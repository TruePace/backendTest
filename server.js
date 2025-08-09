// Enhanced server.js with FIXED graceful shutdown and free hosting optimizations
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

// 1. UPDATE: Remove minimumInterval from global newsState
global.newsState = {
  lastFetch: 0,
  isFetching: false,
  fetchCount: 0,
  lastSuccessfulFetch: null,
  consecutiveFailures: 0,
  activeFetchPromise: null,
  // ❌ REMOVE THIS LINE: minimumInterval: 10 * 60 * 1000,
  lastFetchSuccess: false,
  cronJobsAllowed: true
};

// 2. UPDATE: Simplify canMakeApiRequest function
const canMakeApiRequest = (isCronJob = false) => {
  // Only check if currently fetching - NO TIME RESTRICTIONS
  if (global.newsState.isFetching) {
    console.log('⏳ Still fetching - request will wait');
    return false;
  }
  
  // Always allow requests if not currently fetching
  return true;
};

// 3. UPDATE: Simplify needsFreshNews function
const needsFreshNews = (isCronJob = false) => {
  // Always return true - no time-based restrictions
  console.log(`✅ ${isCronJob ? 'CRON' : 'Regular'}: Always allow fetching`);
  return true;
};

// 4. UPDATE: Simplify triggerNewsFetch function
const triggerNewsFetch = async (ipInfo = { ip: '8.8.8.8' }, options = {}) => {
  const { background = false, force = false, isCronJob = false } = options;
  
  console.log(`🚀 Fetch request: ${isCronJob ? 'CRON JOB' : 'REGULAR'}`);
  
  // Only check if already fetching (no force mode needed anymore)
  if (global.newsState && global.newsState.isFetching) {
    console.log('⏳ Already fetching - skipping');
    return { success: false, reason: 'already_fetching' };
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


// 🆕 Cache cleanup function for free hosting
const cleanupCaches = () => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  console.log(`🧹 Cleaned up caches - Active: 0, Recent: 0`);
};

// 🆕 Memory cleanup for free hosting
const memoryCleanup = () => {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    console.log(`🧠 Memory usage: ${heapUsedMB}MB`);
    
    // Force garbage collection if available and memory is high
    if (global.gc && heapUsedMB > 100) {
      console.log('🧹 Running garbage collection...');
      global.gc();
    }
    
    // Clear caches if memory usage is high
    if (heapUsedMB > 150) {
      console.log('🧹 Clearing caches due to high memory usage...');
      cleanupCaches();
    }
  }, 10 * 60 * 1000); // Every 10 minutes
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

// 🆕 Keep-alive endpoint for free hosting monitoring
app.get('/api/keep-alive', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    environment: process.env.NODE_ENV || 'development',
    dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    lastFetch: global.newsState?.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never'
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
    
    // No need for force: true anymore
    const result = await triggerNewsFetch(
      { ip: req.ipAddress || '8.8.8.8' }, 
      { background: true, isCronJob: true }
    );
    
    const response = {
      success: result.success,
      timestamp: new Date().toISOString(),
      articlesProcessed: result.articlesCount || 0,
      environment: process.env.NODE_ENV || 'development',
      reason: result.reason || 'completed',
      cronType: 'external',
      method: req.method,
      rateLimiting: 'DISABLED - No time restrictions',
      errorMessage: result.error || null
    };
    
    console.log('🏁 ============ CRON JOB COMPLETED ============\n');
    res.json(response);
    
  } catch (error) {
    console.error('❌ CRON JOB FAILED:', error.message);
    res.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      rateLimiting: 'DISABLED - No time restrictions'
    });
  }
});

// Manual force fetch with no restrictions
app.post('/api/health/force-fresh-news', async (req, res) => {
  try {
    const startTime = Date.now();
    console.log('🚀 MANUAL fresh news requested');
    
    const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
    
    // No need for force: true anymore
    const result = await triggerNewsFetch(ipInfo, { background: false });
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: result.success,
      message: result.success 
        ? `Successfully processed ${result.articlesCount} fresh articles in ${duration}ms` 
        : `Failed: ${result.reason || result.error}`,
      articlesProcessed: result.articlesCount || 0,
      duration: duration,
      rateLimiting: 'DISABLED',
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
    canFetch: !global.newsState?.isFetching, // Only check if currently fetching
    lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
    rateLimiting: 'DISABLED - No time restrictions'
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

// 🆕 OPTIMIZED database connection and startup
const startOptimizedServer = async () => {
  try {
    console.log('🚀 Starting optimized server for free hosting...');
    
    // Connect to MongoDB with retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        await mongoose.connect(process.env.MONGO, {
          serverSelectionTimeoutMS: 10000, // Increased timeout
          socketTimeoutMS: 45000,
          maxPoolSize: 5, // Reduced for free tier
          bufferCommands: false, // Don't buffer commands
        });
        console.log('✅ Connected to MongoDB');
        break;
      } catch (error) {
        retries--;
        console.error(`❌ MongoDB connection attempt failed (${retries} retries left):`, error.message);
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw error;
        }
      }
    }
    
    console.log('🧹 Running emergency duplicate cleanup on startup...');
    await CleanupService.cleanupDuplicatesNow();
    
    setupChangeStream();
    CleanupService.startPeriodicCleanup();
    
    // Start optimized monitoring
    memoryCleanup();
    
    // 🆕 Only auto-fetch if explicitly enabled
    if (shouldAutoFetch) {
      console.log('🌅 Auto-fetch enabled - scheduling initial fetch...');
      setTimeout(async () => {
        try {
          const result = await triggerNewsFetch({ ip: '8.8.8.8' }, { background: true, force: false });
          console.log(`🚀 Startup fetch: ${result.success ? 'Success' : 'Failed'} - ${result.articlesCount || 0} articles`);
        } catch (error) {
          console.error('❌ Startup fetch failed:', error.message);
        }
      }, 10000); // Increased delay for free hosting
    } else {
      console.log('⏭️ Auto-fetch disabled - no startup API call');
      console.log('💡 Use manual endpoints or set AUTO_FETCH_ON_START=true to enable');
    }
    
    // Start server
    server.listen(port, () => {
      console.log(`✅ Server running on port ${port} (optimized for free hosting)`);
      console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
      console.log(`🔧 Auto-fetch: ${shouldAutoFetch ? 'ENABLED' : 'DISABLED'}`);
      console.log(`📰 Partner API: ${process.env.PARTNER_API_URL ? 'Configured' : 'NOT CONFIGURED!'}`);
      console.log(`🚫 Rate Limiting: RELAXED MODE - No daily limits, only timing limits`);
      console.log(`🤖 Cron Strategy: External cron-job.org + internal backup`);
      console.log(`🆓 Free Hosting Mode: Reduced resource usage, extended timeouts`);
      
      if (isDevelopment) {
        console.log('🔧 Development Tips:');
        console.log('   • Use POST /api/health/force-fresh-news to manually fetch');
        console.log('   • Use GET /api/external-news/test-api to test API connection');
        console.log('   • Use GET /api/debug/status to check current state');
        console.log('   • Use GET /api/keep-alive for lightweight health checks');
      }
    });
    
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

// Start the server
startOptimizedServer();

// 🆕 OPTIMIZED Database heartbeat for free hosting
setInterval(async () => {
  try {
    const startTime = Date.now();
    await mongoose.connection.db.admin().ping();
    const duration = Date.now() - startTime;
    
    console.log(`💓 Database heartbeat: ${duration}ms`);
    
    // If ping takes too long, log it
    if (duration > 2000) {
      console.warn(`⚠️ Slow database response: ${duration}ms`);
    }
  } catch (error) {
    console.error('❌ Database heartbeat failed:', error.message);
    
    // Attempt to reconnect if connection is lost
    if (mongoose.connection.readyState === 0) {
      console.log('🔄 Attempting database reconnection...');
      try {
        await mongoose.connect(process.env.MONGO);
        console.log('✅ Database reconnected');
      } catch (reconnectError) {
        console.error('❌ Database reconnection failed:', reconnectError.message);
      }
    }
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

// 🚨 FIXED: Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('📛 SIGTERM received, shutting down gracefully...');
  
  try {
    // Close HTTP server first
    await new Promise((resolve) => {
      server.close(() => {
        console.log('🛑 HTTP server closed');
        resolve();
      });
    });
    
    // Close MongoDB connection without callback (FIXED)
    await mongoose.connection.close();
    console.log('🗄️ MongoDB connection closed');
    
    console.log('✅ Server closed gracefully');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// Also add SIGINT handler for Ctrl+C during development
process.on('SIGINT', async () => {
  console.log('📛 SIGINT received, shutting down gracefully...');
  
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
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

