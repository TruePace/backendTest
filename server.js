// Enhanced server.js with proper cold start handling for Render.com
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cron from 'node-cron';
import http from 'http';
import { Server } from 'socket.io';
import { verifyFirebaseToken } from './lib/Middlewares/AuthMiddleware.js';
import HeadlineNewsChannelRoute from './lib/routes/HeadlineNews/HeadlineNewsChannelRoute.js';
import HeadlineNewsContentRoute from './lib/routes/HeadlineNews/HeadlineNewsContentRoute.js';
import HeadlineNewsCommentRoute from './lib/routes/HeadlineNews/HeadlineNewsCommentRoute.js';
import HeadlineNewsJustInRoute from './lib/routes/HeadlineNews/HeadlineNewsJustInRoute.js';
import UserRoute from './lib/routes/HeadlineNews/HeadlineNewsUserRoute.js';
import { Content } from './lib/models/HeadlineNews/HeadlineModel.js';
import { initializeApp } from './lib/FirebaseAdmin.js';
import BeyondVideoRoute from './lib/routes/Beyond_Headline/Beyond_video/BeyondVideoRoute.js';
import BeyondArticleRoute from './lib/routes/Beyond_Headline/Beyond_article/BeyondArticleRoute.js';
import MissedJustInRoute from './lib/routes/Missed_Just_In/MissedJustInRoute.js';
import UserHistoryRoute from './lib/routes/User_History/UserHistoryRoute.js';
import { setupChangeStream } from './lib/routes/Direct_ML_Database/ChangeStream.js';
import MlPartnerRoute from './lib/routes/Direct_ML_Database/MlPartnerRoute.js';
import ExternalNewsRoute from './lib/routes/HeadlineNews/ExternalNewsRoute.js';
import LocationRoute from './lib/routes/HeadlineNews/LocationRoute.js';
import { CleanupService, cleanupRoutes } from './lib/routes/HeadlineNews/CleanupService.js';
import { 
  fetchExternalNewsServer, 
  refreshExternalChannelsServer,
  createExternalNewsRoute 
} from './lib/routes/HeadlineNews/ServerExternalNewsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Validate critical environment variables
if (!process.env.PARTNER_API_URL) {
  console.error('❌ CRITICAL: PARTNER_API_URL is not set in environment variables!');
  console.error('Please ensure PARTNER_API_URL is set in Render.com environment settings');
}

// Initialize Firebase
await initializeApp();

// Global state management for news fetching
global.newsState = {
  lastFetch: 0,
  isFetching: false,
  fetchCount: 0,
  lastSuccessfulFetch: null,
  consecutiveFailures: 0,
   activeFetchPromise: null // NEW: Track active promise
};

// Helper function to check if fresh news is needed
const needsFreshNews = () => {
  const now = Date.now();
  const timeSinceLastFetch = now - global.newsState.lastFetch;
  const fetchInterval = 15 * 60 * 1000; // 15 minutes
  
  // Always fetch if never fetched before
  if (global.newsState.lastFetch === 0) return true;
  
  // Fetch if interval has passed
  if (timeSinceLastFetch > fetchInterval) return true;
  
  // Force fetch if too many consecutive failures
  if (global.newsState.consecutiveFailures >= 3) return true;
  
  return false;
};

// Enhanced news fetching with retry and error handling
const triggerNewsFetch = async (ipInfo = { ip: '8.8.8.8' }, options = {}) => {
  const { background = false, force = false } = options;
  
  // If there's already an active fetch promise, wait for it instead of starting new one
  if (global.newsState.activeFetchPromise && !force) {
    console.log('⏳ Waiting for existing news fetch to complete...');
    try {
      return await global.newsState.activeFetchPromise;
    } catch (error) {
      console.log('⚠️ Existing fetch failed, will start new one');
    }
  }
  
  const isRecentStartup = process.uptime() < 300;
  
  if (!force && !isRecentStartup && global.newsState.isFetching) {
    console.log('⏭️ News fetch already in progress, skipping...');
    return { success: false, reason: 'already_fetching' };
  }
  
  if (!force && !isRecentStartup && !needsFreshNews()) {
    console.log('⏰ Fresh news not needed yet');
    return { success: false, reason: 'not_needed' };
  }

  // Create the fetch promise and store it globally
  const fetchPromise = (async () => {
    try {
      global.newsState.isFetching = true;
      global.newsState.lastFetch = Date.now();
      global.newsState.fetchCount++;
      
      const startupIndicator = isRecentStartup ? ' (STARTUP)' : '';
      console.log(`🚀 Starting news fetch #${global.newsState.fetchCount}${startupIndicator} (${background ? 'background' : 'foreground'})...`);
      
      const results = await fetchExternalNewsServer(ipInfo);
      
      global.newsState.lastSuccessfulFetch = Date.now();
      global.newsState.consecutiveFailures = 0;
      
      console.log(`✅ News fetch #${global.newsState.fetchCount} completed: ${results.length} articles`);
      
      return { success: true, articlesCount: results.length };
      
    } catch (error) {
      global.newsState.consecutiveFailures++;
      console.error(`❌ News fetch #${global.newsState.fetchCount} failed (${global.newsState.consecutiveFailures} consecutive failures):`, error.message);
      
      if (isRecentStartup) {
        global.newsState.lastFetch = Date.now() - (5 * 60 * 1000);
      } else {
        global.newsState.lastFetch = Date.now() - (10 * 60 * 1000);
      }
      
      return { success: false, error: error.message };
      
    } finally {
      global.newsState.isFetching = false;
      global.newsState.activeFetchPromise = null; // Clear the promise
    }
  })();
  
  // Store the active promise
  global.newsState.activeFetchPromise = fetchPromise;
  
  return fetchPromise;
};

// App configuration
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

// Trust proxy for proper IP handling
app.set('trust proxy', true);

// IP extraction middleware
app.use((req, res, next) => {
  const ip = 
    req.headers['x-forwarded-for']?.split(',').shift() || 
    req.socket?.remoteAddress ||
    req.ip ||
    '8.8.8.8';
  
  req.ipAddress = ip;
  next();
});

// Core middleware
app.use(express.json());
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Socket.io setup
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// CRITICAL: Wake-up endpoint that Render health checks can use
app.get('/', (req, res) => {
  res.json({ 
    status: 'alive',
    message: 'TruePace News API',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint that triggers news fetch
app.get('/health', async (req, res) => {
  const needsFresh = needsFreshNews();
  
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    newsState: {
      lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
      isFetching: global.newsState.isFetching,
      fetchCount: global.newsState.fetchCount,
      needsFresh: needsFresh
    }
  };
  
  // Send response immediately
  res.json(status);
  
  // ALWAYS trigger fetch on health check if server just woke up
  if (process.uptime() < 300) { // If server has been up for less than 5 minutes
    console.log('🔄 Health check detected recent startup - forcing news fetch');
    triggerNewsFetch({ ip: req.ipAddress }, { force: true, background: true });
  } else if (needsFresh) {
    console.log('📰 Health check triggering background news fetch...');
    triggerNewsFetch({ ip: req.ipAddress }, { background: true });
  }
});

// CRITICAL: Wake-up endpoint specifically for Render cold starts
app.get('/wake', async (req, res) => {
  const startTime = Date.now();
  console.log('🔔 Wake endpoint called - starting aggressive initialization...');
  
  // Immediately respond to prevent timeout
  res.json({ 
    status: 'waking up', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    action: 'triggering_aggressive_news_fetch'
  });
  
  // Start aggressive background initialization
  setTimeout(async () => {
    try {
      console.log('🚀 Background: Starting news fetch after wake...');
      
      // Force immediate news fetch regardless of timing
      const result = await triggerNewsFetch({ ip: req.ipAddress || '8.8.8.8' }, { 
        force: true, 
        background: false // Make it foreground for wake calls
      });
      
      const duration = Date.now() - startTime;
      console.log(`⏱️ Wake sequence completed in ${duration}ms:`, result);
      
    } catch (error) {
      console.error('❌ Background wake sequence failed:', error);
    }
  }, 100); // Start immediately
});

// Enhanced keep-alive endpoint
app.get('/api/health/keep-alive', async (req, res) => {
  const needsFresh = needsFreshNews();
  
  // Always respond immediately
  res.json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    lastNewsFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
    needsFreshNews: needsFresh,
    isFetching: global.newsState.isFetching,
    fetchCount: global.newsState.fetchCount
  });
  
  // Trigger background fetch if needed
  if (needsFresh) {
    console.log('📰 Keep-alive triggering background news fetch...');
    triggerNewsFetch({ ip: req.ipAddress }, { background: true });
  }
});

// Force fresh news endpoint
app.post('/api/health/force-fresh-news', async (req, res) => {
  try {
    const startTime = Date.now();
    console.log('🚀 Force fresh news requested');
    
    const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
    const isUrgent = req.body.urgent || false;
    
    console.log(`📡 ${isUrgent ? '[URGENT]' : ''} Forcing news fetch...`);
    
    // Always force fetch when explicitly requested
    const result = await triggerNewsFetch(ipInfo, { force: true, background: false });
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: result.success,
      message: result.success 
        ? `Successfully processed ${result.articlesCount} fresh articles in ${duration}ms` 
        : `Failed: ${result.reason || result.error}`,
      articlesProcessed: result.articlesCount || 0,
      duration: duration,
      urgent: isUrgent,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Force fetch endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// CRITICAL: Middleware that ensures fresh news on important endpoints
const ensureFreshNewsMiddleware = (req, res, next) => {
  // Only trigger on GET requests to avoid duplicate fetches
  if (req.method === 'GET' && needsFreshNews()) {
    console.log('🔄 Content request triggering background news fetch...');
    triggerNewsFetch({ ip: req.ipAddress }, { background: true });
  }
  next();
};

// Apply fresh news middleware to content routes
app.use('/api/HeadlineNews/Channel', ensureFreshNewsMiddleware);
app.use('/api/HeadlineNews/GetJustIn', ensureFreshNewsMiddleware);
app.use('/api/HeadlineNews/Content', ensureFreshNewsMiddleware);

// Mount all routes
app.use('/api/HeadlineNews/Channel', HeadlineNewsChannelRoute);
app.use('/api/HeadlineNews/Channel', ExternalNewsRoute);
app.use('/api/location', LocationRoute);
app.use('/api/HeadlineNews/Comment', HeadlineNewsCommentRoute);
app.use('/api/HeadlineNews/Content', HeadlineNewsContentRoute);
app.use('/api/HeadlineNews/GetJustIn', HeadlineNewsJustInRoute);
app.use('/api/users', UserRoute);
app.use('/api/BeyondVideo', BeyondVideoRoute);
app.use('/api/BeyondArticle', BeyondArticleRoute);
app.use('/api/HeadlineNews', MissedJustInRoute);
app.use('/api/history', UserHistoryRoute);
app.use('/api/ml-partner', MlPartnerRoute);

// Add cleanup routes
const cleanupRouter = express.Router();
cleanupRoutes(cleanupRouter);
app.use('/api/admin', cleanupRouter);

// Add external news management routes
const externalNewsRouter = express.Router();
createExternalNewsRoute(externalNewsRouter);
app.use('/api/external-news', externalNewsRouter);

// Debug endpoint
app.get('/api/debug/status', (req, res) => {
  res.json({
    serverTime: new Date().toISOString(),
    uptime: `${Math.round(process.uptime() / 60)} minutes`,
    newsState: global.newsState,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      hasPartnerAPI: !!process.env.PARTNER_API_URL,
      port: port
    },
    database: {
      connected: mongoose.connection.readyState === 1,
      host: mongoose.connection.host
    }
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGO, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(async () => {
  console.log('✅ Connected to MongoDB');
  setupChangeStream();
  
  // Start cleanup service
  CleanupService.startPeriodicCleanup();
  
  // CRITICAL: Always fetch news immediately on startup - regardless of last fetch time
  console.log('🌅 Server starting - fetching initial news with force...');
  await triggerNewsFetch({ ip: '8.8.8.8' }, { force: true, background: false });
  
  // Start server
  server.listen(port, () => {
    console.log(`✅ Server running on port ${port}`);
    console.log('🚀 Cold start handling active');
    console.log(`📰 Partner API: ${process.env.PARTNER_API_URL ? 'Configured' : 'NOT CONFIGURED!'}`);
    
    // ADDITIONAL: Set up immediate fetch after server is ready
    setTimeout(async () => {
      console.log('🔄 Post-startup news fetch...');
      await triggerNewsFetch({ ip: '8.8.8.8' }, { force: true });
    }, 5000); // 5 seconds after server starts
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Database heartbeat
setInterval(async () => {
  try {
    await mongoose.connection.db.admin().ping();
    console.log('💓 Database heartbeat successful');
  } catch (error) {
    console.error('❌ Database heartbeat failed:', error);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// CRON JOBS

// Move expired Just In content to Headlines (every minute)
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
      console.log(`📦 Moved ${expiredJustInContent.length} items from Just In to Headlines`);
    }
  } catch (error) {
    console.error('❌ Error in Just In rotation:', error);
  }
});

// Fetch external news every 15 minutes
let cronJobRunning = false;

cron.schedule('*/15 * * * *', async () => {
  if (cronJobRunning) {
    console.log('⏭️ [CRON] Previous job still running, skipping...');
    return;
  }
  
  cronJobRunning = true;
  try {
    console.log('⏰ [CRON] 15-minute news fetch triggered');
    await triggerNewsFetch({ ip: '8.8.8.8' }, { force: true });
  } finally {
    cronJobRunning = false;
  }
});

// Refresh external channels every 6 hours
cron.schedule('0 */6 * * *', async () => {
  try {
    console.log('📺 [CRON] Refreshing external channels...');
    const success = await refreshExternalChannelsServer();
    console.log(success ? '✅ Channels refreshed' : '❌ Channel refresh failed');
  } catch (error) {
    console.error('❌ Channel refresh error:', error);
  }
});

// Daily cleanup at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🌙 [CRON] Running daily cleanup...');
    
    const cleanupResult = await CleanupService.runFullCleanup();
    
    if (cleanupResult.success) {
      console.log(`✅ Cleanup completed: ${cleanupResult.duplicatesRemoved} duplicates, ${cleanupResult.expiredRemoved} expired`);
    }
    
    // Additional cleanup for expired content
    const now = new Date();
    
    const internal = await Content.deleteMany({ 
      source: { $ne: 'external' },
      headlineExpiresAt: { $lte: now } 
    });
    
    const external = await Content.deleteMany({ 
      source: 'external',
      headlineExpiresAt: { $lte: now } 
    });
    
    console.log(`🗑️ Deleted ${internal.deletedCount} internal, ${external.deletedCount} external expired items`);
    
  } catch (error) {
    console.error('❌ Daily cleanup error:', error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📛 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
});