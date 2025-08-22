


// Enhanced server.js with partner server wake-up management
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cron from 'node-cron';
import http from 'http';
import { Server } from 'socket.io';

// Routes
import HeadlineNewsChannelRoute from './lib/routes/HeadlineNews/HeadlineNewsChannelRoute.js';
import HeadlineNewsContentRoute from './lib/routes/HeadlineNews/HeadlineNewsContentRoute.js';
import HeadlineNewsCommentRoute from './lib/routes/HeadlineNews/HeadlineNewsCommentRoute.js';
import HeadlineNewsJustInRoute from './lib/routes/HeadlineNews/HeadlineNewsJustInRoute.js';
import UserRoute from './lib/routes/HeadlineNews/HeadlineNewsUserRoute.js';
import BeyondVideoRoute from './lib/routes/Beyond_Headline/Beyond_video/BeyondVideoRoute.js';
import BeyondArticleRoute from './lib/routes/Beyond_Headline/Beyond_article/BeyondArticleRoute.js';
import MissedJustInRoute from './lib/routes/Missed_Just_In/MissedJustInRoute.js';
import UserHistoryRoute from './lib/routes/User_History/UserHistoryRoute.js';
import MlPartnerRoute from './lib/routes/Direct_ML_Database/MlPartnerRoute.js';
import ExternalNewsRoute from './lib/routes/HeadlineNews/ExternalNewsRoute.js';
import LocationRoute from './lib/routes/HeadlineNews/LocationRoute.js';

// Services
import { initializeApp } from './lib/FirebaseAdmin.js';
import { Content } from './lib/models/HeadlineNews/HeadlineModel.js';
import { CleanupService, cleanupRoutes } from './lib/routes/HeadlineNews/CleanupService.js';
// import { setupChangeStream } from './lib/routes/Direct_ML_Database/ChangeStream.js';
import { 
  fetchExternalNewsServer, 
  refreshExternalChannelsServer,
  createExternalNewsRoute,
  wakeUpPartner 
} from './lib/routes/HeadlineNews/ServerExternalNewsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const NODE_ENV = process.env.NODE_ENV?.toLowerCase() || 'development';
const isDevelopment = NODE_ENV === 'development';
const port = process.env.PORT || 4000;

console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);

// Initialize Firebase
await initializeApp();

// Global news fetch state
global.newsState = {
  lastFetch: 0,
  isFetching: false,
  fetchCount: 0,
  lastSuccessfulFetch: null,
  consecutiveFailures: 0,
  lastFetchSuccess: false
};

const wakeUpPartnerServer = async () => {
  try {
    const partnerApiUrl = process.env.PARTNER_API_URL;
    if (!partnerApiUrl) {
      console.log('❌ No partner API URL configured for wake-up');
      return false;
    }

    // Create URL object to safely extract base URL (SAME AS ServerExternalNewsService.js)
    const url = new URL(partnerApiUrl);
    const baseUrl = `${url.protocol}//${url.host}`; // Always gives clean base URL
    
    console.log('🔔 Original API URL:', partnerApiUrl);
    console.log('🔔 Extracted base URL for wake-up:', baseUrl);

    const response = await fetch(baseUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'TruePaceNewsApp-WakeUp/1.0',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    });

    if (response.ok || response.status < 500) {
      console.log(`✅ Partner server wake-up successful (${response.status})`);
      return true;
    } else {
      console.log(`⚠️ Partner server responded with ${response.status}, but it's awake`);
      return true; // Still counts as awake
    }

  } catch (error) {
    console.error(`❌ Partner wake-up failed: ${error.message}`);
    return false;
  }
};
// Simplified news fetch function with pre-wake-up
const triggerNewsFetch = async (ipInfo = { ip: '8.8.8.8' }, options = {}) => {
  const { isCronJob = false } = options;
  
  if (global.newsState.isFetching) {
    console.log('⏳ Already fetching - skipping');
    return { success: false, reason: 'already_fetching' };
  }

  try {
    global.newsState.isFetching = true;
    global.newsState.lastFetch = Date.now();
    global.newsState.fetchCount++;
    
    console.log(`🚀 ${isCronJob ? 'CRON' : 'MANUAL'} fetch #${global.newsState.fetchCount}`);
    
    // Pre-emptive partner wake-up for cron jobs
    if (isCronJob) {
      console.log('🔔 Pre-emptive partner server wake-up...');
      await wakeUpPartnerServer();
      // Wait a bit for partner to fully initialize
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    const results = await fetchExternalNewsServer(ipInfo);
    
    global.newsState.lastSuccessfulFetch = Date.now();
    global.newsState.consecutiveFailures = 0;
    global.newsState.lastFetchSuccess = true;
    
    console.log(`✅ Fetch successful: ${results.length} articles`);
    return { success: true, articlesCount: results.length };
    
  } catch (error) {
    global.newsState.consecutiveFailures++;
    global.newsState.lastFetchSuccess = false;
    console.error(`❌ Fetch failed:`, error.message);
    return { success: false, error: error.message };
  } finally {
    global.newsState.isFetching = false;
  }
};

// App setup
const app = express();
const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://ikea-true.vercel.app"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const allowedOrigins = [
  'http://localhost:3000',
  'https://ikea-true.vercel.app'
];

// Middleware
app.set('trust proxy', true);

app.use((req, res, next) => {
  req.ipAddress = 
    req.headers['x-forwarded-for']?.split(',').shift() || 
    req.socket?.remoteAddress ||
    req.ip ||
    '8.8.8.8';
  next();
});

app.use(express.json());
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    callback(new Error('CORS policy violation'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Socket.io
io.on('connection', (socket) => {
  console.log('User connected');
  socket.on('disconnect', () => console.log('User disconnected'));
});

// Essential endpoints
app.get('/', (req, res) => {
  res.json({ 
    status: 'alive',
    message: 'TruePace News API',
    timestamp: new Date().toISOString(),
    environment: isDevelopment ? 'development' : 'production'
  });
});

// Health check optimized for external cron monitoring
app.get('/health', async (req, res) => {
  try {
    const dbConnected = mongoose.connection.readyState === 1;
    
    let dbStatus = 'disconnected';
    if (dbConnected) {
      try {
        await mongoose.connection.db.admin().ping();
        dbStatus = 'connected';
      } catch (dbError) {
        dbStatus = 'error';
        console.warn('⚠️ Database ping failed during health check');
      }
    }
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      dbStatus: dbStatus,
      lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
      server: 'awake',
      environment: isDevelopment ? 'development' : 'production',
      readyForCron: !global.newsState.isFetching,
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    };
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json(healthData);
    
  } catch (error) {
    console.error('❌ Health check error:', error.message);
    res.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      error: error.message,
      server: 'awake'
    });
  }
});

// Partner server wake-up endpoint for external cron
app.all('/api/wake-partner', async (req, res) => {
  try {
    console.log(`\n🔔 PARTNER WAKE-UP REQUESTED via ${req.method}`);
    
    const success = await wakeUpPartnerServer();
    
    res.json({
      success: success,
      message: success ? 'Partner server wake-up successful' : 'Partner server wake-up failed',
      timestamp: new Date().toISOString(),
      method: req.method,
      partnerApiConfigured: !!process.env.PARTNER_API_URL
    });
    
  } catch (error) {
    console.error('❌ Partner wake-up error:', error.message);
    res.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced cron endpoint with better partner management
app.all('/api/cron/fetch-news', async (req, res) => {
  const maxRetries = 3;
  const baseDelay = 8000; // 8 seconds base delay (increased for partner wake-up)
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n🔔 CRON JOB TRIGGERED - Attempt ${attempt}/${maxRetries}`);
      console.log(`📡 Method: ${req.method}, IP: ${req.ipAddress}`);
      
      const result = await triggerNewsFetch(
        { ip: req.ipAddress || '8.8.8.8' }, 
        { isCronJob: true }
      );
      
      // Success case
      if (result.success && result.articlesCount > 0) {
        console.log(`✅ CRON SUCCESS on attempt ${attempt}: ${result.articlesCount} articles`);
        
        return res.json({
          success: true,
          timestamp: new Date().toISOString(),
          articlesProcessed: result.articlesCount,
          attempt: attempt,
          totalAttempts: maxRetries,
          method: req.method,
          message: `Successfully fetched ${result.articlesCount} articles on attempt ${attempt}`
        });
      }
      
      // Partial success (no new articles but API responded)
      if (result.success && result.articlesCount === 0) {
        console.log(`ℹ️ CRON PARTIAL SUCCESS on attempt ${attempt}: API responded but no new articles`);
        
        return res.json({
          success: true,
          timestamp: new Date().toISOString(),
          articlesProcessed: 0,
          attempt: attempt,
          message: 'API responded successfully but no new articles to process',
          reason: 'no_new_content'
        });
      }
      
      // Failed attempt - try additional wake-up if needed
      console.log(`❌ CRON ATTEMPT ${attempt} FAILED: ${result.reason || result.error}`);
      
      // If this was the last attempt, return failure
      if (attempt === maxRetries) {
        console.log('🔥 ALL CRON ATTEMPTS EXHAUSTED');
        
        return res.json({
          success: false,
          error: result.error || result.reason || 'Unknown error',
          timestamp: new Date().toISOString(),
          attemptsMade: attempt,
          totalAttempts: maxRetries,
          message: `Failed after ${maxRetries} attempts`,
          suggestion: 'Partner server may be sleeping - try manual wake-up'
        });
      }
      
      // Extra wake-up attempt before retry
      if (attempt === 2) {
        console.log('🔔 Extra partner wake-up before final attempt...');
        await wakeUpPartnerServer();
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      }
      
      // Wait before retry (exponential backoff)
      const delay = baseDelay * Math.pow(1.5, attempt - 1);
      console.log(`⏳ CRON RETRY: Waiting ${delay}ms before attempt ${attempt + 1}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (error) {
      console.error(`❌ CRON ATTEMPT ${attempt} ERROR:`, error.message);
      
      // If this was the last attempt, return the error
      if (attempt === maxRetries) {
        console.log('🔥 ALL CRON ATTEMPTS FAILED WITH ERRORS');
        
        return res.json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
          attemptsMade: attempt,
          totalAttempts: maxRetries,
          message: `All ${maxRetries} attempts failed with errors`,
          suggestion: 'Check partner server status and connectivity'
        });
      }
      
      // Wait before retry
      const delay = baseDelay * Math.pow(1.5, attempt - 1);
      console.log(`⏳ CRON ERROR RETRY: Waiting ${delay}ms before attempt ${attempt + 1}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
});

// Manual fetch endpoint
app.post('/api/fetch-news', async (req, res) => {
  try {
    const result = await triggerNewsFetch({ ip: req.ipAddress });
    
    res.json({
      success: result.success,
      message: result.success 
        ? `Processed ${result.articlesCount} articles` 
        : `Failed: ${result.error}`,
      articlesProcessed: result.articlesCount || 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Mount routes
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

// Admin and external news routes
const cleanupRouter = express.Router();
cleanupRoutes(cleanupRouter);
app.use('/api/admin', cleanupRouter);

const externalNewsRouter = express.Router();
createExternalNewsRoute(externalNewsRouter);
app.use('/api/external-news', externalNewsRouter);

// Database connection and server startup
const startServer = async () => {
  try {
    console.log('🚀 Starting server...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5
    });
    console.log('✅ Connected to MongoDB');
    
    // Initialize services
    await CleanupService.cleanupDuplicatesNow();
    // setupChangeStream();
    CleanupService.startPeriodicCleanup();
    
    // Optional startup fetch
    if (process.env.AUTO_FETCH_ON_START === 'true') {
      setTimeout(async () => {
        const result = await triggerNewsFetch({ ip: '8.8.8.8' });
        console.log(`🚀 Startup fetch: ${result.success ? 'Success' : 'Failed'}`);
      }, 10000);
    }
    
    // Start server
    server.listen(port, () => {
      console.log(`✅ Server running on port ${port}`);
      console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
      console.log(`📰 Partner API: ${process.env.PARTNER_API_URL ? 'Configured' : 'NOT CONFIGURED!'}`);
    });
    
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

// Enhanced cron jobs with partner management
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
    console.error('❌ Just In rotation error:', error);
  }
});

// Partner wake-up cron - runs every 12 minutes (to prevent sleep)
cron.schedule('*/12 * * * *', async () => {
  try {
    console.log('🔔 Scheduled partner server wake-up...');
    await wakeUpPartnerServer();
  } catch (error) {
    console.error('❌ Scheduled partner wake-up error:', error);
  }
});

cron.schedule('0 1 * * *', async () => {
  try {
    console.log('📺 Refreshing external channels...');
    await refreshExternalChannelsServer();
  } catch (error) {
    console.error('❌ Channel refresh error:', error);
  }
});

cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🌙 Running daily cleanup...');
    const cleanupResult = await CleanupService.runFullCleanup();
    
    const now = new Date();
    const internal = await Content.deleteMany({ 
      source: { $ne: 'external' },
      headlineExpiresAt: { $lte: now } 
    });
    
    const external = await Content.deleteMany({ 
      source: 'external',
      headlineExpiresAt: { $lte: now } 
    });
    
    console.log(`🗑️ Cleanup: ${cleanupResult.duplicatesRemoved} duplicates, ${internal.deletedCount + external.deletedCount} expired`);
  } catch (error) {
    console.error('❌ Daily cleanup error:', error);
  }
});

// Database heartbeat
setInterval(async () => {
  try {
    const startTime = Date.now();
    await mongoose.connection.db.admin().ping();
    const duration = Date.now() - startTime;
    
    if (duration > 2000) {
      console.warn(`⚠️ Slow database response: ${duration}ms`);
    }
  } catch (error) {
    console.error('❌ Database heartbeat failed:', error.message);
  }
}, 5 * 60 * 1000);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`📛 ${signal} received, shutting down gracefully...`);
  
  try {
    await new Promise((resolve) => {
      server.close(() => {
        console.log('🛑 HTTP server closed');
        resolve();
      });
    });
    
    await mongoose.connection.close();
    console.log('🗄️ MongoDB connection closed');
    console.log('✅ Server closed gracefully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});