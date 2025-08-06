// Enhanced server.js with RELAXED rate limiting for cron jobs
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

// Environment detection with .env override
const NODE_ENV = process.env.NODE_ENV?.toLowerCase() || 'development';
const isDevelopment = NODE_ENV === 'development';
const isProduction = NODE_ENV === 'production';

// Auto-fetch control
const shouldAutoFetch = process.env.AUTO_FETCH_ON_START === 'true';

console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
console.log(`🔧 Auto-fetch on start: ${shouldAutoFetch ? 'ENABLED' : 'DISABLED'}`);

// Validate critical environment variables
if (!process.env.PARTNER_API_URL) {
  console.error('❌ CRITICAL: PARTNER_API_URL is not set in environment variables!');
  console.error('Please ensure PARTNER_API_URL is set in environment settings');
}

// Initialize Firebase
await initializeApp();

// 🆕 RELAXED Rate limiting - Remove daily limits for cron jobs
global.newsState = {
  lastFetch: 0,
  isFetching: false,
  fetchCount: 0,
  lastSuccessfulFetch: null,
  consecutiveFailures: 0,
  activeFetchPromise: null,
  // 🚨 REMOVED DAILY LIMITS - Only use timing limits
  minimumInterval: 10 * 60 * 1000, // 10 minutes minimum between requests
  lastFetchSuccess: false,
  cronJobsAllowed: true // Allow cron jobs to bypass most restrictions
};

console.log(`⚙️ Rate Limits: RELAXED MODE - Only ${Math.round(global.newsState.minimumInterval/60000)} min intervals`);

// 🆕 RELAXED rate limit checker - Much more permissive
const canMakeApiRequest = (isCronJob = false) => {
  // 🚨 CRON JOBS GET PRIORITY - Skip most restrictions
  if (isCronJob) {
    console.log('🤖 Cron job request - bypassing most rate limits');
    
    // Only check if we're currently fetching
    if (global.newsState.isFetching) {
      console.log('⏳ Still fetching - cron job will wait');
      return false;
    }
    
    // Check minimum interval (reduced for cron jobs)
    const timeSinceLastFetch = Date.now() - global.newsState.lastFetch;
    const cronMinInterval = 5 * 60 * 1000; // 5 minutes for cron jobs
    
    if (timeSinceLastFetch < cronMinInterval) {
      const remainingTime = Math.ceil((cronMinInterval - timeSinceLastFetch) / (60 * 1000));
      console.log(`⏰ Cron job too soon. Wait ${remainingTime} minutes`);
      return false;
    }
    
    return true;
  }
  
  // Regular requests - check minimum time interval only
  const timeSinceLastFetch = Date.now() - global.newsState.lastFetch;
  if (timeSinceLastFetch < global.newsState.minimumInterval) {
    const remainingTime = Math.ceil((global.newsState.minimumInterval - timeSinceLastFetch) / (60 * 1000));
    console.log(`⏰ Regular request too soon. Wait ${remainingTime} minutes`);
    return false;
  }
  
  return true;
};

// 🆕 RELAXED freshness check
const needsFreshNews = (isCronJob = false) => {
  const now = Date.now();
  const timeSinceLastFetch = now - global.newsState.lastFetch;
  
  // 🚨 CRON JOBS: More aggressive fetching
  if (isCronJob) {
    const cronInterval = 10 * 60 * 1000; // 10 minutes for cron jobs
    if (global.newsState.lastFetch === 0 || timeSinceLastFetch > cronInterval) {
      console.log(`✅ CRON: ${global.newsState.lastFetch === 0 ? 'First fetch' : Math.round(timeSinceLastFetch / (60 * 1000)) + ' minutes since last fetch'} - fetching now`);
      return true;
    }
    console.log(`⏰ CRON: Only ${Math.round(timeSinceLastFetch / (60 * 1000))} minutes - need to wait`);
    return false;
  }
  
  // Regular requests
  const regularInterval = global.newsState.minimumInterval;
  if (global.newsState.lastFetch === 0 || timeSinceLastFetch > regularInterval) {
    console.log(`✅ Regular: Can fetch now`);
    return true;
  }
  
  console.log(`⏰ Regular: Need to wait`);
  return false;
};

// 🚨 SIMPLIFIED triggerNewsFetch - Remove all restrictions
const triggerNewsFetch = async (ipInfo = { ip: '8.8.8.8' }, options = {}) => {
  const { background = false, force = false, isCronJob = false } = options;
  
  console.log(`🚀 Fetch request: ${isCronJob ? 'CRON JOB' : 'REGULAR'} ${force ? '(FORCED)' : ''}`);
  
  // 🚨 FORCE MODE - Skip ALL checks when force = true
  if (force) {
    console.log('🚀 FORCE MODE: Skipping all rate limit checks');
  } else {
    // Only check if already fetching (not force mode)
    if (global.newsState && global.newsState.isFetching) {
      console.log('⏳ Already fetching - skipping');
      return { success: false, reason: 'already_fetching' };
    }
  }

  try {
    // Set fetching state
    if (global.newsState) {
      global.newsState.isFetching = true;
      global.newsState.lastFetch = Date.now();
      global.newsState.fetchCount = (global.newsState.fetchCount || 0) + 1;
    }
    
    console.log(`🚀 Starting API call #${global.newsState?.fetchCount || 1}`);
    console.log(`🔗 Using Partner API: ${process.env.PARTNER_API_URL}`);
    
    const results = await fetchExternalNewsServer(ipInfo);
    
    // Update success state
    if (global.newsState) {
      global.newsState.lastSuccessfulFetch = Date.now();
      global.newsState.consecutiveFailures = 0;
      global.newsState.lastFetchSuccess = true;
    }
    
    console.log(`✅ API request successful: ${results.length} articles`);
    
    return { success: true, articlesCount: results.length };
    
  } catch (error) {
    // Update failure state
    if (global.newsState) {
      global.newsState.consecutiveFailures = (global.newsState.consecutiveFailures || 0) + 1;
      global.newsState.lastFetchSuccess = false;
    }
    
    console.error(`❌ News fetch failed:`, error.message);
    
    return { success: false, error: error.message };
    
  } finally {
    // Clear fetching state
    if (global.newsState) {
      global.newsState.isFetching = false;
      global.newsState.activeFetchPromise = null;
    }
  }
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

// Basic wake-up endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'alive',
    message: 'TruePace News API - RELAXED MODE',
    timestamp: new Date().toISOString(),
    environment: isDevelopment ? 'development' : 'production',
    cronStrategy: 'external + internal backup',
    rateLimiting: 'RELAXED - No daily limits'
  });
});

// 🚨 FIXED: Health endpoint for cron-job.org (GET request)
app.get('/health', async (req, res) => {
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isDevelopment ? 'development' : 'production',
    rateLimiting: 'RELAXED MODE',
    fetchStatus: {
      lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
      totalFetches: global.newsState.fetchCount,
      lastSuccess: global.newsState.lastSuccessfulFetch ? new Date(global.newsState.lastSuccessfulFetch).toISOString() : 'never',
      consecutiveFailures: global.newsState.consecutiveFailures
    }
  };
  
  res.json(status);
});

app.all('/api/cron/fetch-news', async (req, res) => {
  try {
    console.log('\n🔔 ============ CRON JOB TRIGGERED ============');
    console.log(`📡 Method: ${req.method}`);
    console.log(`📡 Request from IP: ${req.ipAddress}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Current time: ${new Date().toISOString()}`);
    console.log(`🔗 Partner API URL: ${process.env.PARTNER_API_URL || 'NOT SET'}`);
    
    // 🚨 BYPASS ALL RATE LIMITING FOR DEBUGGING
    console.log('🚀 BYPASSING ALL RATE LIMITING - FORCING FETCH');
    
    const result = await triggerNewsFetch(
      { ip: req.ipAddress || '8.8.8.8' }, 
      { force: true, background: true, isCronJob: true } // FORCE = TRUE
    );
    
    const response = {
      success: result.success,
      timestamp: new Date().toISOString(),
      articlesProcessed: result.articlesCount || 0,
      environment: process.env.NODE_ENV || 'development',
      reason: result.reason || 'completed',
      cronType: 'external',
      method: req.method,
      rateLimiting: 'BYPASSED FOR DEBUGGING',
      partnerApiUrl: process.env.PARTNER_API_URL ? 'configured' : 'NOT CONFIGURED',
      errorMessage: result.error || null
    };
    
    if (result.success) {
      console.log(`✅ [CRON] Successfully processed ${result.articlesCount} articles`);
    } else {
      console.log(`⚠️ [CRON] Fetch failed: ${result.reason || result.error}`);
    }
    
    console.log('🏁 ============ CRON JOB COMPLETED ============\n');
    
    res.json(response);
    
  } catch (error) {
    console.error('\n❌ ============ CRON JOB FAILED ============');
    console.error(`❌ Error: ${error.message}`);
    console.error(`❌ Stack: ${error.stack}`);
    console.error('🏁 ============ CRON JOB FAILED ============\n');
    
    res.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      rateLimiting: 'BYPASSED FOR DEBUGGING',
      partnerApiUrl: process.env.PARTNER_API_URL ? 'configured' : 'NOT CONFIGURED'
    });
  }
});

// Manual force fetch with no restrictions
app.post('/api/health/force-fresh-news', async (req, res) => {
  try {
    const startTime = Date.now();
    console.log('🚀 MANUAL Force fresh news requested');
    
    const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
    const isUrgent = req.body.urgent || false;
    
    console.log(`📡 ${isUrgent ? '[URGENT]' : ''} FORCING news fetch...`);
    
    // 🚨 FORCE WITH NO RESTRICTIONS
    const result = await triggerNewsFetch(ipInfo, { force: true, background: false });
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: result.success,
      message: result.success 
        ? `Successfully processed ${result.articlesCount} fresh articles in ${duration}ms` 
        : `Failed: ${result.reason || result.error}`,
      articlesProcessed: result.articlesCount || 0,
      duration: duration,
      rateLimiting: 'BYPASSED',
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

// Simple health endpoint for cron-job.org monitoring
app.get('/api/cron/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: isDevelopment ? 'development' : 'production',
    canFetch: canMakeApiRequest(true), // Check as cron job
    lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
    rateLimiting: 'RELAXED MODE - No daily limits'
  });
});






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

// Enhanced debug endpoint
app.get('/api/debug/status', (req, res) => {
  res.json({
    serverTime: new Date().toISOString(),
    uptime: `${Math.round(process.uptime() / 60)} minutes`,
    environment: isDevelopment ? 'development' : 'production',
    cronStrategy: 'external + internal backup',
    rateLimiting: 'RELAXED MODE',
    newsState: {
      ...global.newsState,
      canFetchRegular: canMakeApiRequest(false),
      canFetchCron: canMakeApiRequest(true)
    },
    environment_vars: {
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

app.get('/api/debug/config', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV || 'NOT SET',
    partnerApiUrl: process.env.PARTNER_API_URL || 'NOT SET',
    partnerApiWorking: !!process.env.PARTNER_API_URL,
    timestamp: new Date().toISOString()
  });
});

mongoose.connect(process.env.MONGO, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(async () => {
  console.log('✅ Connected to MongoDB');
  
  console.log('🧹 Running emergency duplicate cleanup on startup...');
  await CleanupService.cleanupDuplicatesNow();
  
  setupChangeStream();
  CleanupService.startPeriodicCleanup();
  
  // 🆕 Only auto-fetch if explicitly enabled
  if (shouldAutoFetch) {
    console.log('🌅 Auto-fetch enabled - triggering initial news fetch...');
    setTimeout(async () => {
      try {
        const result = await triggerNewsFetch({ ip: '8.8.8.8' }, { background: true, force: false });
        console.log(`🚀 Startup fetch: ${result.success ? 'Success' : 'Failed'} - ${result.articlesCount || 0} articles`);
      } catch (error) {
        console.error('❌ Startup fetch failed:', error.message);
      }
    }, 5000);
  } else {
    console.log('⏭️ Auto-fetch disabled - no startup API call');
    console.log('💡 Use manual endpoints or set AUTO_FETCH_ON_START=true to enable');
  }
  
  
  // Start server
  server.listen(port, () => {
    console.log(`✅ Server running on port ${port}`);
    console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
      console.log(`🔧 Auto-fetch: ${shouldAutoFetch ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📰 Partner API: ${process.env.PARTNER_API_URL ? 'Configured' : 'NOT CONFIGURED!'}`);
    console.log(`🚫 Rate Limiting: RELAXED MODE - No daily limits, only timing limits`);
    console.log(`🤖 Cron Strategy: External cron-job.org + internal backup`);
    
    if (isDevelopment) {
      console.log('🔧 Development Tips:');
      console.log('   • Use POST /api/health/force-fresh-news to manually fetch');
      console.log('   • Use GET /api/external-news/test-api to test API connection');
      console.log('   • Use GET /api/debug/status to check current state');
    }
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
}, 5 * 60 * 1000);

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



// Refresh external channels every 24 hours
cron.schedule('0 1 * * *', async () => {
  try {
    console.log('📺 [INTERNAL-CRON] Refreshing external channels...');
    const success = await refreshExternalChannelsServer();
    console.log(success ? '✅ Channels refreshed' : '❌ Channel refresh failed');
  } catch (error) {
    console.error('❌ Channel refresh error:', error);
  }
});

// Daily cleanup at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🌙 [INTERNAL-CRON] Running daily cleanup...');
    
    const cleanupResult = await CleanupService.runFullCleanup();
    
    if (cleanupResult.success) {
      console.log(`✅ Cleanup completed: ${cleanupResult.duplicatesRemoved} duplicates, ${cleanupResult.expiredRemoved} expired`);
    }
    
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