// Enhanced server.js with proper auto-fetching for development and production
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

// Detect environment
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isProduction = process.env.NODE_ENV === 'production';

console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
console.log(`🤖 Auto-fetch strategy: ${isProduction ? 'EXTERNAL CRON ONLY' : 'INTERNAL CRON'}`);

// Validate critical environment variables
if (!process.env.PARTNER_API_URL) {
  console.error('❌ CRITICAL: PARTNER_API_URL is not set in environment variables!');
  console.error('Please ensure PARTNER_API_URL is set in environment settings');
}

// Initialize Firebase
await initializeApp();

// 🆕 ENVIRONMENT-SPECIFIC Rate limiting
global.newsState = {
  lastFetch: 0,
  isFetching: false,
  fetchCount: 0,
  lastSuccessfulFetch: null,
  consecutiveFailures: 0,
  activeFetchPromise: null,
  // Different limits for dev vs production
  dailyRequestCount: 0,
  lastResetDate: new Date().toDateString(),
  rateLimitHit: false,
  maxDailyRequests: isDevelopment ? 50 : 50, // More generous in development
  minimumInterval: isDevelopment ? 20 * 60 * 1000 : 2 * 60 * 60 * 1000, // 10 min dev, 2hrs prod
  lastFetchSuccess: false
};

console.log(`⚙️ Rate Limits: ${global.newsState.maxDailyRequests} requests/day, ${Math.round(global.newsState.minimumInterval/60000)} min intervals`);

// 🆕 Smarter rate limit checker
const canMakeApiRequest = () => {
  const today = new Date().toDateString();
  
  // Reset counter if new day
  if (global.newsState.lastResetDate !== today) {
    global.newsState.dailyRequestCount = 0;
    global.newsState.lastResetDate = today;
    global.newsState.rateLimitHit = false;
    console.log('🔄 Daily API request counter reset');
  }
  
  // Check daily limit
  if (global.newsState.dailyRequestCount >= global.newsState.maxDailyRequests) {
    console.log(`🚫 Daily API limit reached: ${global.newsState.dailyRequestCount}/${global.newsState.maxDailyRequests}`);
    global.newsState.rateLimitHit = true;
    return false;
  }
  
  // Check minimum time interval
  const timeSinceLastFetch = Date.now() - global.newsState.lastFetch;
  if (timeSinceLastFetch < global.newsState.minimumInterval) {
    const remainingTime = Math.ceil((global.newsState.minimumInterval - timeSinceLastFetch) / (60 * 1000));
    console.log(`⏰ Too soon to make API request. Wait ${remainingTime} minutes`);
    return false;
  }
  
  return true;
};

// 🆕 Environment-aware freshness check
const needsFreshNews = () => {
  const now = Date.now();
  const timeSinceLastFetch = now - global.newsState.lastFetch;
  const minimumInterval = global.newsState.minimumInterval;
  
  // Never fetch if rate limit hit
  if (global.newsState.rateLimitHit) {
    console.log('🚫 Rate limit reached, not fetching news');
    return false;
  }
  
  // Only fetch if minimum interval has passed OR never fetched
  if (global.newsState.lastFetch === 0 || timeSinceLastFetch > minimumInterval) {
    console.log(`✅ ${global.newsState.lastFetch === 0 ? 'First fetch' : Math.round(timeSinceLastFetch / (60 * 1000)) + ' minutes since last fetch'} - can fetch now`);
    return true;
  }
  
  console.log(`⏰ Only ${Math.round(timeSinceLastFetch / (60 * 1000))} minutes since last fetch - need to wait`);
  return false;
};

// Enhanced news fetching with better handling
const triggerNewsFetch = async (ipInfo = { ip: '8.8.8.8' }, options = {}) => {
  const { background = false, force = false } = options;
  
  // Check rate limits first (unless absolutely forced)
  if (!force && !canMakeApiRequest()) {
    return { 
      success: false, 
      reason: 'rate_limit_protection',
      dailyCount: global.newsState.dailyRequestCount,
      maxDaily: global.newsState.maxDailyRequests
    };
  }
  
  // If there's already an active fetch promise, wait for it
  if (global.newsState.activeFetchPromise && !force) {
    console.log('⏳ Waiting for existing news fetch to complete...');
    try {
      return await global.newsState.activeFetchPromise;
    } catch (error) {
      console.log('⚠️ Existing fetch failed, will start new one');
    }
  }
  
  if (!force && global.newsState.isFetching) {
    console.log('⏭️ News fetch already in progress, skipping...');
    return { success: false, reason: 'already_fetching' };
  }
  
  if (!force && !needsFreshNews()) {
    console.log('⏰ Fresh news not needed yet');
    return { success: false, reason: 'not_needed' };
  }

  // Create the fetch promise and store it globally
  const fetchPromise = (async () => {
    try {
      global.newsState.isFetching = true;
      global.newsState.lastFetch = Date.now();
      global.newsState.fetchCount++;
      global.newsState.dailyRequestCount++;
      
      console.log(`🚀 API Request #${global.newsState.dailyRequestCount}/${global.newsState.maxDailyRequests} (Total: ${global.newsState.fetchCount})${background ? ' (background)' : ''}`);
      
      const results = await fetchExternalNewsServer(ipInfo);
      
      global.newsState.lastSuccessfulFetch = Date.now();
      global.newsState.consecutiveFailures = 0;
      global.newsState.lastFetchSuccess = true;
      
      console.log(`✅ API request successful: ${results.length} articles`);
      
      return { success: true, articlesCount: results.length };
      
    } catch (error) {
      global.newsState.consecutiveFailures++;
      global.newsState.lastFetchSuccess = false;
      
      // Handle rate limit errors specifically
      if (error.message.includes('rate limit') || error.message.includes('Rate limit')) {
        console.error(`🚫 Rate limit hit! Marking as rate limited.`);
        global.newsState.rateLimitHit = true;
        global.newsState.dailyRequestCount = global.newsState.maxDailyRequests;
      }
      
      console.error(`❌ News fetch failed (${global.newsState.consecutiveFailures} consecutive failures):`, error.message);
      
      return { success: false, error: error.message };
      
    } finally {
      global.newsState.isFetching = false;
      global.newsState.activeFetchPromise = null;
    }
  })();
  
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

// Basic wake-up endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'alive',
    message: 'TruePace News API',
    timestamp: new Date().toISOString(),
    environment: isDevelopment ? 'development' : 'production',
    cronStrategy: isProduction ? 'external-only' : 'internal-auto'
  });
});

// 🚨 MODIFIED: Health check - NO AUTO-TRIGGER in production
app.get('/health', async (req, res) => {
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isDevelopment ? 'development' : 'production',
    cronStrategy: isProduction ? 'external-cron-job.org' : 'internal-development',
    apiLimits: {
      dailyRequests: global.newsState.dailyRequestCount,
      maxDaily: global.newsState.maxDailyRequests,
      rateLimitHit: global.newsState.rateLimitHit,
      lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never'
    }
  };
  
  res.json(status);
  
  // 🚨 PRODUCTION CHANGE: Only auto-trigger in development
  if (isDevelopment && needsFreshNews() && canMakeApiRequest()) {
    console.log('🚀 [DEV] Health check triggered automatic news fetch');
    setTimeout(() => {
      triggerNewsFetch({ ip: req.ipAddress || '8.8.8.8' }, { background: true });
    }, 2000);
  } else if (isProduction) {
    console.log('🏭 [PROD] Health check - relying on external cron-job.org');
  }
});

// 🚨 MODIFIED: Wake endpoint - NO AUTO-TRIGGER in production
app.get('/wake', async (req, res) => {
  console.log('🔔 Wake endpoint called');
  
  res.json({ 
    status: 'awake', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isDevelopment ? 'development' : 'production',
    cronStrategy: isProduction ? 'external-cron-job.org' : 'internal-development',
    rateLimitStatus: {
      dailyRequests: global.newsState.dailyRequestCount,
      maxDaily: global.newsState.maxDailyRequests,
      canFetch: canMakeApiRequest()
    }
  });
  
  // 🚨 PRODUCTION CHANGE: Only auto-trigger in development
  if (isDevelopment && canMakeApiRequest() && needsFreshNews()) {
    console.log('🚀 [DEV] Wake triggered immediate news fetch...');
    setTimeout(() => {
      triggerNewsFetch({ ip: req.ipAddress || '8.8.8.8' }, { background: true });
    }, 1000);
  } else if (isProduction) {
    console.log('🏭 [PROD] Wake called - relying on external cron-job.org');
  }
});

// 🚨 MODIFIED: Keep-alive - NO AUTO-TRIGGER in production
app.get('/api/health/keep-alive', async (req, res) => {
  res.json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: isDevelopment ? 'development' : 'production',
    cronStrategy: isProduction ? 'external-cron-job.org' : 'internal-development',
    apiStatus: {
      dailyRequests: global.newsState.dailyRequestCount,
      maxDaily: global.newsState.maxDailyRequests,
      rateLimitHit: global.newsState.rateLimitHit,
      lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never'
    }
  });
  
  // 🚨 PRODUCTION CHANGE: Only auto-trigger in development
  if (isDevelopment && needsFreshNews() && canMakeApiRequest()) {
    console.log('🚀 [DEV] Keep-alive triggered periodic news fetch');
    setTimeout(() => {
      triggerNewsFetch({ ip: req.ipAddress || '8.8.8.8' }, { background: true });
    }, 3000);
  } else if (isProduction) {
    console.log('🏭 [PROD] Keep-alive - relying on external cron-job.org');
  }
});

// Manual force fetch
app.post('/api/health/force-fresh-news', async (req, res) => {
  try {
    const startTime = Date.now();
    console.log('🚀 Force fresh news requested');
    
    if (!canMakeApiRequest()) {
      return res.status(429).json({
        success: false,
        error: 'API rate limit protection - request blocked',
        dailyRequests: global.newsState.dailyRequestCount,
        maxDaily: global.newsState.maxDailyRequests,
        rateLimitHit: global.newsState.rateLimitHit,
        message: 'Too many API requests today. Try again tomorrow or use manual content upload.'
      });
    }
    
    const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
    const isUrgent = req.body.urgent || false;
    
    console.log(`📡 ${isUrgent ? '[URGENT]' : ''} Forcing news fetch (${global.newsState.dailyRequestCount + 1}/${global.newsState.maxDailyRequests})...`);
    
    const result = await triggerNewsFetch(ipInfo, { force: true, background: false });
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: result.success,
      message: result.success 
        ? `Successfully processed ${result.articlesCount} fresh articles in ${duration}ms` 
        : `Failed: ${result.reason || result.error}`,
      articlesProcessed: result.articlesCount || 0,
      duration: duration,
      apiUsage: {
        dailyRequests: global.newsState.dailyRequestCount,
        maxDaily: global.newsState.maxDailyRequests,
        remaining: global.newsState.maxDailyRequests - global.newsState.dailyRequestCount
      },
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

// 🎯 MAIN CRON ENDPOINT - This is what cron-job.org should call
app.post('/api/cron/fetch-news', async (req, res) => {
  try {
    console.log('🔔 [EXTERNAL CRON] News fetch triggered from cron-job.org');
    console.log(`📡 [EXTERNAL CRON] Request from IP: ${req.ipAddress}`);
    console.log(`🌍 [EXTERNAL CRON] Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    
    // Check rate limits
    if (!canMakeApiRequest()) {
      console.log('🚫 [EXTERNAL CRON] Rate limit protection active');
      return res.status(429).json({
        success: false,
        reason: 'rate_limit_protection',
        dailyRequests: global.newsState.dailyRequestCount,
        maxDaily: global.newsState.maxDailyRequests,
        message: 'Daily API limit reached or too soon since last request',
        environment: isProduction ? 'production' : 'development'
      });
    }
    
    const result = await triggerNewsFetch(
      { ip: req.ipAddress || '8.8.8.8' }, 
      { force: false, background: true }
    );
    
    const response = {
      success: result.success,
      timestamp: new Date().toISOString(),
      articlesProcessed: result.articlesCount || 0,
      dailyUsage: `${global.newsState.dailyRequestCount}/${global.newsState.maxDailyRequests}`,
      environment: isDevelopment ? 'development' : 'production',
      reason: result.reason || 'completed',
      cronType: 'external'
    };
    
    if (result.success) {
      console.log(`✅ [EXTERNAL CRON] Successfully processed ${result.articlesCount} articles`);
      res.json(response);
    } else {
      console.log(`⚠️ [EXTERNAL CRON] Fetch failed: ${result.reason || result.error}`);
      res.status(400).json(response);
    }
    
  } catch (error) {
    console.error('❌ [EXTERNAL CRON] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      environment: isProduction ? 'production' : 'development'
    });
  }
});

// Simple health endpoint for cron-job.org
app.get('/api/cron/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: isDevelopment ? 'development' : 'production',
    cronStrategy: isProduction ? 'external-cron-job.org' : 'internal-development',
    canFetch: canMakeApiRequest(),
    dailyUsage: `${global.newsState.dailyRequestCount}/${global.newsState.maxDailyRequests}`,
    lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never'
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
    cronStrategy: isProduction ? 'external-cron-job.org' : 'internal-development',
    newsState: global.newsState,
    apiLimits: {
      dailyRequests: global.newsState.dailyRequestCount,
      maxDaily: global.newsState.maxDailyRequests,
      rateLimitHit: global.newsState.rateLimitHit,
      canMakeRequest: canMakeApiRequest(),
      nextAllowedRequest: global.newsState.lastFetch + global.newsState.minimumInterval
    },
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

// MongoDB connection with startup fetch
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
  
  // 🚨 PRODUCTION CHANGE: Only auto-fetch on startup in development
  if (isDevelopment && canMakeApiRequest()) {
    console.log('🌅 [DEV] Server starting - triggering initial news fetch...');
    setTimeout(async () => {
      try {
        const result = await triggerNewsFetch({ ip: '8.8.8.8' }, { background: true });
        console.log(`🚀 [DEV] Startup fetch: ${result.success ? 'Success' : 'Failed'} - ${result.articlesCount || 0} articles`);
      } catch (error) {
        console.error('❌ [DEV] Startup fetch failed:', error.message);
      }
    }, 5000);
  } else if (isProduction) {
    console.log('🏭 [PROD] Server starting - relying on external cron-job.org for news fetching');
  } else {
    console.log('🌅 Server starting - startup fetch skipped due to rate limits');
  }
  
  // Start server
  server.listen(port, () => {
    console.log(`✅ Server running on port ${port}`);
    console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
    console.log(`📰 Partner API: ${process.env.PARTNER_API_URL ? 'Configured' : 'NOT CONFIGURED!'}`);
    console.log(`🚫 API Rate Limiting: ${global.newsState.maxDailyRequests} requests/day max`);
    console.log(`🤖 Cron Strategy: ${isProduction ? 'EXTERNAL (cron-job.org)' : 'INTERNAL (development)'}`);
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

// Move expired Just In content to Headlines (every minute) - RUNS IN BOTH ENVIRONMENTS
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

// 🚨 ENVIRONMENT-SPECIFIC CRON: Only run internal cron in DEVELOPMENT
let cronJobRunning = false;

// 🚨 DEVELOPMENT ONLY: Internal cron for testing
if (isDevelopment) {
  cron.schedule('*/15 * * * *', async () => {
    if (cronJobRunning || !canMakeApiRequest()) {
      console.log('⏭️ [DEV-INTERNAL-CRON] Skipping - job running or rate limited');
      return;
    }
    
    cronJobRunning = true;
    try {
      console.log('⏰ [DEV-INTERNAL-CRON] Development news fetch (every 15 minutes)');
      const result = await triggerNewsFetch({ ip: '8.8.8.8' }, { force: false, background: true });
      console.log(`✅ [DEV-INTERNAL-CRON] Fetch completed: ${result.success ? 'Success' : 'Failed'}`);
    } catch (error) {
      console.error('❌ [DEV-INTERNAL-CRON] Fetch error:', error.message);
    } finally {
      cronJobRunning = false;
    }
  });
  console.log('⏰ Development INTERNAL CRON: Every 15 minutes');
} else {
  console.log('🏭 Production: NO INTERNAL CRON - Relying on external cron-job.org');
}

// 🚨 REMOVED: Production internal cron - we rely on external cron-job.org

// Refresh external channels every 24 hours (no API calls) - RUNS IN BOTH ENVIRONMENTS
cron.schedule('0 1 * * *', async () => {
  try {
    console.log('📺 [INTERNAL-CRON] Refreshing external channels...');
    const success = await refreshExternalChannelsServer();
    console.log(success ? '✅ Channels refreshed' : '❌ Channel refresh failed');
  } catch (error) {
    console.error('❌ Channel refresh error:', error);
  }
});

// Daily cleanup at midnight (no API calls) - RUNS IN BOTH ENVIRONMENTS
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