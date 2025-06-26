import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cron from  'node-cron'
import http from 'http';
import { Server } from 'socket.io';
import { verifyFirebaseToken } from './lib/Middlewares/AuthMiddleware.js';
import HeadlineNewsChannelRoute from './lib/routes/HeadlineNews/HeadlineNewsChannelRoute.js'
import HeadlineNewsContentRoute from './lib/routes/HeadlineNews/HeadlineNewsContentRoute.js'
import HeadlineNewsCommentRoute from './lib/routes/HeadlineNews/HeadlineNewsCommentRoute.js'
import HeadlineNewsJustInRoute from './lib/routes/HeadlineNews/HeadlineNewsJustInRoute.js'
import UserRoute from './lib/routes/HeadlineNews/HeadlineNewsUserRoute.js'
import { Content } from './lib/models/HeadlineNews/HeadlineModel.js';
import { initializeApp } from './lib/FirebaseAdmin.js';
import BeyondVideoRoute from './lib/routes/Beyond_Headline/Beyond_video/BeyondVideoRoute.js'
import BeyondArticleRoute from './lib/routes/Beyond_Headline/Beyond_article/BeyondArticleRoute.js'
import MissedJustInRoute from './lib/routes/Missed_Just_In/MissedJustInRoute.js'
import UserHistoryRoute from './lib/routes/User_History/UserHistoryRoute.js'
import { setupChangeStream } from './lib/routes/Direct_ML_Database/ChangeStream.js';
import MlPartnerRoute from './lib/routes/Direct_ML_Database/MlPartnerRoute.js'
import ExternalNewsRoute from './lib/routes/HeadlineNews/ExternalNewsRoute.js'
import LocationRoute from './lib/routes/HeadlineNews/LocationRoute.js'
import { CleanupService, cleanupRoutes } from './lib/routes/HeadlineNews/CleanupService.js';

// Import the new server-side external news service
import { 
  fetchExternalNewsServer, 
  refreshExternalChannelsServer,
  createExternalNewsRoute 
} from './lib/routes/HeadlineNews/ServerExternalNewsService.js'


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🔍 Detailed Environment Debug:');
console.log('Raw PARTNER_API_URL:', `"${process.env.PARTNER_API_URL}"`);
console.log('PARTNER_API_URL type:', typeof process.env.PARTNER_API_URL);
console.log('PARTNER_API_URL length:', process.env.PARTNER_API_URL?.length);
console.log('PARTNER_API_URL char codes:', process.env.PARTNER_API_URL?.split('').map(c => c.charCodeAt(0)));

// Test if the value has hidden characters
if (process.env.PARTNER_API_URL) {
  const cleaned = process.env.PARTNER_API_URL.trim();
  console.log('Cleaned PARTNER_API_URL:', `"${cleaned}"`);
  console.log('Original vs Cleaned same?', process.env.PARTNER_API_URL === cleaned);
}

// Check .env file content directly
import fs from 'fs';


const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('📄 .env file content:');
  console.log(envContent);
  
  // Look for the specific line
  const partnerApiLine = envContent.split('\n').find(line => line.includes('PARTNER_API_URL'));
  if (partnerApiLine) {
    console.log('🔍 PARTNER_API_URL line:', `"${partnerApiLine}"`);
    console.log('🔍 Line char codes:', partnerApiLine.split('').map(c => c.charCodeAt(0)));
  }
} else {
  console.log('❌ .env file not found at:', envPath);
}


await initializeApp(); 

// app config
const app = express();
const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://ikea-true.vercel.app"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const port = process.env.PORT || 4000;
const allowedOrigins = [
  'http://localhost:3000',
  'https://ikea-true.vercel.app'
];

app.set('trust proxy', true);

app.use((req, res, next) => {
  const ip = 
    req.headers['x-forwarded-for']?.split(',').shift() || 
    req.socket?.remoteAddress ||
    req.ip ||
    null;
  
  req.ipAddress = ip;
  next();
});

// Middleware
app.use(express.json());
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

app.set('trust proxy', true);

// routes
app.use('/api/HeadlineNews/Channel',HeadlineNewsChannelRoute)
app.use ('/api/HeadlineNews/Channel',ExternalNewsRoute)
app.use('/api/location', LocationRoute);
app.use('/api/HeadlineNews/Comment',HeadlineNewsCommentRoute)
app.use('/api/HeadlineNews/Content',HeadlineNewsContentRoute)
app.use('/api/HeadlineNews/GetJustIn',HeadlineNewsJustInRoute)
app.use('/api/users', UserRoute);
app.use('/api/BeyondVideo', BeyondVideoRoute);
app.use('/api/BeyondArticle', BeyondArticleRoute);
app.use ('/api/HeadlineNews',MissedJustInRoute)
app.use('/api/history', UserHistoryRoute);
app.use('/api/ml-partner', MlPartnerRoute);


// Add cleanup routes
const cleanupRouter = express.Router();
cleanupRoutes(cleanupRouter);
app.use('/api/admin', cleanupRouter);

// Add external news routes - PLACE THIS BEFORE THE MONGODB CONNECTION
const externalNewsRouter = express.Router();

// Manual fetch endpoint
externalNewsRouter.post('/fetch-external-news', async (req, res) => {
  try {
    console.log('📡 Manual external news fetch triggered');
    
    // Get IP from request body or use the request IP
    const ipInfo = req.body.ipInfo || { ip: req.ipAddress || '8.8.8.8' };
    
    const results = await fetchExternalNewsServer(ipInfo);
    
    res.json({
      success: true,
      articlesProcessed: results.length,
      message: `Successfully processed ${results.length} external news articles`
    });
  } catch (error) {
    console.error('❌ Error in manual fetch:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Refresh channels endpoint
externalNewsRouter.post('/refresh-external-channels', async (req, res) => {
  try {
    console.log('📡 Manual channels refresh triggered');
    
    const success = await refreshExternalChannelsServer();
    
    res.json({
      success,
      message: success ? 'External channels refreshed successfully' : 'Failed to refresh external channels'
    });
  } catch (error) {
    console.error('❌ Error in manual channels refresh:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Status endpoint (optional)
externalNewsRouter.get('/status', async (req, res) => {
  try {
    // You can add logic here to return status info
    const status = {
      serviceStatus: 'active',
      lastCronRun: new Date(),
      partnerApiUrl: process.env.PARTNER_API_URL ? 'configured' : 'not configured'
    };
    
    res.json(status);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mount the external news routes
app.use('/api/external-news', externalNewsRouter);


// MongoDB connection
mongoose.connect(process.env.MONGO, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
  console.log('Connected to MongoDB');
  setupChangeStream();
  
  // Start periodic cleanup after DB connection
  CleanupService.startPeriodicCleanup();
  
  // Initialize external channels on startup
  refreshExternalChannelsServer();
  
  // NEW: Fetch fresh news on startup
  setTimeout(fetchNewsOnStartup, 2000); // Wait 2 seconds for everything to initialize
  
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
})
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
  
// Reconnection logic
mongoose.connection.on('disconnected', () => {
  console.log('Lost MongoDB connection. Reconnecting...');
  mongoose.connect(process.env.MONGO, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
});

// Heartbeat mechanism
setInterval(async () => {
  try {
    await mongoose.connection.db.admin().ping();
    console.log('Database connection is alive');
  } catch (error) {
    console.error('Error pinging database:', error);
  }
}, 300000); // Every 5 minutes

// Add this to your main server.js file after the MongoDB connection

// Global variable to track last fetch time
global.lastNewsFetch = 0;
global.serverStartTime = Date.now();

// Function to check if we need fresh news
const shouldFetchFreshNews = () => {
  const now = Date.now();
  const lastFetch = global.lastNewsFetch;
  const thirtyMinutes = 30 * 60 * 1000; // 30 minutes
  
  // If we've never fetched or it's been more than 30 minutes
  return lastFetch === 0 || (now - lastFetch) > thirtyMinutes;
};

// Middleware to ensure fresh news on important requests
const ensureFreshNewsMiddleware = async (req, res, next) => {
  try {
    if (shouldFetchFreshNews()) {
      console.log('🔄 Server needs fresh news - triggering background fetch...');
      
      // Update the timestamp immediately to prevent multiple simultaneous fetches
      global.lastNewsFetch = Date.now();
      
      // Get IP from request
      const ipInfo = { ip: req.ipAddress || '8.8.8.8' };
      
      // Fetch in background - don't make user wait
      fetchExternalNewsServer(ipInfo)
        .then(results => {
          console.log(`✅ Background fetch completed: ${results.length} articles processed`);
        })
        .catch(error => {
          console.error('❌ Background fetch failed:', error);
          // Reset timestamp so we can try again next time
          global.lastNewsFetch = Date.now() - (25 * 60 * 1000); // Try again in 5 minutes
        });
    }
    
    next();
  } catch (error) {
    console.error('❌ Fresh news middleware error:', error);
    next(); // Continue even if this fails
  }
};

// Apply middleware to your main content routes
app.use('/api/HeadlineNews/Content', ensureFreshNewsMiddleware);
app.use('/api/HeadlineNews/GetJustIn', ensureFreshNewsMiddleware);
app.use('/api/HeadlineNews/Channel', ensureFreshNewsMiddleware);


// Enhanced keep-alive endpoint that also triggers news fetch
app.get('/api/health/keep-alive', async (req, res) => {
  try {
    const now = Date.now();
    const uptime = process.uptime();
    
    console.log('🏥 Keep-alive ping received at:', new Date().toISOString());
    console.log('⏱️ Server uptime:', Math.round(uptime / 60), 'minutes');
    
    // If server just started or hasn't fetched in a while, fetch news
    if (shouldFetchFreshNews()) {
      console.log('📰 Triggering news fetch via keep-alive...');
      global.lastNewsFetch = now;
      
      // Fetch news in background
      fetchExternalNewsServer({ ip: req.ipAddress || '8.8.8.8' })
        .then(results => {
          console.log(`✅ Keep-alive fetch completed: ${results.length} articles`);
        })
        .catch(error => {
          console.error('❌ Keep-alive fetch failed:', error);
          // Reset timestamp for retry
          global.lastNewsFetch = now - (25 * 60 * 1000);
        });
    }
    
    res.json({ 
      status: 'alive', 
      timestamp: new Date().toISOString(),
      uptime: Math.round(uptime),
      lastNewsFetch: global.lastNewsFetch ? new Date(global.lastNewsFetch).toISOString() : 'never',
      needsFreshNews: shouldFetchFreshNews()
    });
    
  } catch (error) {
    console.error('❌ Keep-alive error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Force fetch endpoint for immediate fresh news
app.post('/api/health/force-fresh-news', async (req, res) => {
  try {
    console.log('🚀 Force fetching fresh news...');
    
    const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
    
    // Force fetch regardless of timing
    global.lastNewsFetch = Date.now();
    const results = await fetchExternalNewsServer(ipInfo);
    
    res.json({
      success: true,
      message: `Successfully fetched ${results.length} fresh articles`,
      articlesProcessed: results.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Force fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Server startup news fetch
const fetchNewsOnStartup = async () => {
  try {
    console.log('🌅 Server starting up - checking for fresh news...');
    
    if (shouldFetchFreshNews()) {
      console.log('📰 Fetching fresh news on startup...');
      global.lastNewsFetch = Date.now();
      
      const results = await fetchExternalNewsServer({ ip: '8.8.8.8' });
      console.log(`✅ Startup fetch completed: ${results.length} articles processed`);
    } else {
      console.log('ℹ️ News is still fresh, skipping startup fetch');
    }
  } catch (error) {
    console.error('❌ Startup news fetch failed:', error);
  }
};


// ===== CRON JOBS =====

// Move expired Just In content to Headlines (runs every minute)
cron.schedule('* * * * *', async () => {
  try {
    const expiredJustInContent = await Content.find({
      isJustIn: true,
      justInExpiresAt: { $lte: new Date() }
    });

    for (let content of expiredJustInContent) {
      await Content.findByIdAndUpdate(content._id, {
        isJustIn: false,
        showInAllChannels: true
      });
    }
    
    if (expiredJustInContent.length > 0) {
      console.log(`Moved ${expiredJustInContent.length} items from Just In to Headline News`);
    }
  } catch (error) {
    console.error('Error in Just In to Headlines cron job:', error);
  }
});

// **NEW: Fetch external news every 30 minutes**
cron.schedule('*/30 * * * *', async () => {
  try {
    console.log('📰 [CRON] Running 30-minute external news fetch...');
    
    // Use a default IP or get from environment
    const defaultIpInfo = { ip: process.env.DEFAULT_IP || '8.8.8.8' };
    
    const results = await fetchExternalNewsServer(defaultIpInfo);
    
    if (results.length > 0) {
      console.log(`✅ [CRON] Successfully processed ${results.length} external news articles`);
    } else {
      console.log('ℹ️ [CRON] No new external news articles to process');
    }
    
  } catch (error) {
    console.error('❌ [CRON] Error in external news fetch:', error);
  }
});

// **NEW: Refresh external channels every 6 hours**
cron.schedule('0 */6 * * *', async () => {
  try {
    console.log('📺 [CRON] Running 6-hour external channels refresh...');
    
    const success = await refreshExternalChannelsServer();
    
    if (success) {
      console.log('✅ [CRON] External channels refreshed successfully');
    } else {
      console.log('❌ [CRON] Failed to refresh external channels');
    }
    
  } catch (error) {
    console.error('❌ [CRON] Error in external channels refresh:', error);
  }
});

// Enhanced cleanup with CleanupService - runs daily at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🌙 Running daily cleanup with CleanupService...');
    
    const cleanupResult = await CleanupService.runFullCleanup();
    
    if (cleanupResult.success) {
      console.log(`✅ Daily cleanup completed: ${cleanupResult.duplicatesRemoved} duplicates removed, ${cleanupResult.expiredRemoved} expired items removed`);
    } else {
      console.error('❌ Daily cleanup failed:', cleanupResult.error);
    }
    
    // Keep existing logic as backup
    const now = new Date();
    
    const expiredInternalResult = await Content.deleteMany({ 
      source: { $ne: 'external' },
      headlineExpiresAt: { $lte: now } 
    });
    
    const expiredExternalResult = await Content.deleteMany({ 
      source: 'external',
      headlineExpiresAt: { $lte: now } 
    });
    
    const totalDeleted = expiredInternalResult.deletedCount + expiredExternalResult.deletedCount;
    
    console.log(`Deleted ${expiredInternalResult.deletedCount} expired internal content items (24hr rule).`);
    console.log(`Deleted ${expiredExternalResult.deletedCount} expired external content items (48hr rule).`);
    console.log(`Total deleted: ${totalDeleted} expired Headline News content items.`);
    
  } catch (error) {
    console.error('Error in daily cleanup cron job:', error);
  }
});

// Enhanced 6-hour cleanup with duplicate removal
cron.schedule('0 */6 * * *', async () => {
  try {
    console.log('🕕 Running 6-hour cleanup...');
    
    const duplicatesRemoved = await CleanupService.removeDuplicateExternalContent();
    
    const now = new Date();
    const expiredExternalResult = await Content.deleteMany({ 
      source: 'external',
      headlineExpiresAt: { $lte: now } 
    });
    
    if (expiredExternalResult.deletedCount > 0 || duplicatesRemoved > 0) {
      console.log(`[6hr cleanup] Removed ${duplicatesRemoved} duplicates, deleted ${expiredExternalResult.deletedCount} expired external content items`);
    }
    
  } catch (error) {
    console.error('Error in 6-hour cleanup:', error);
  }
});

// Update channel statistics daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  try {
    console.log('📊 Running daily channel statistics update...');
    await CleanupService.updateChannelStats();
  } catch (error) {
    console.error('Error updating channel statistics:', error);
  }
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});