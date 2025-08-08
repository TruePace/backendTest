// Enhanced server.js with intelligent rate limit handling
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

// Enhanced global news state with rate limiting awareness
global.newsState = {
  lastFetch: 0,
  isFetching: false,
  fetchCount: 0,
  lastSuccessfulFetch: null,
  consecutiveFailures: 0,
  activeFetchPromise: null,
  lastFetchSuccess: false,
  cronJobsAllowed: true,
  rateLimitDetected: false,
  rateLimitUntil: null,
  lastRateLimitTime: null
};

// Enhanced rate limit aware checking
const canMakeApiRequest = (isCronJob = false) => {
  const now = Date.now();
  
  // Check if currently fetching
  if (global.newsState.isFetching) {
    console.log('⏳ Still fetching - request will wait');
    return false;
  }
  
  // Check rate limit status
  if (global.newsState.rateLimitDetected && global.newsState.rateLimitUntil) {
    if (now < global.newsState.rateLimitUntil) {
      const waitMinutes = Math.ceil((global.newsState.rateLimitUntil - now) / (60 * 1000));
      console.log(`🚫 Rate limited for ${waitMinutes} more minutes`);
      return false;
    } else {
      // Rate limit period has passed
      console.log('✅ Rate limit period expired, clearing state');
      global.newsState.rateLimitDetected = false;
      global.newsState.rateLimitUntil = null;
      global.newsState.consecutiveFailures = 0;
    }
  }
  
  // For cron jobs, be more conservative if we've had recent failures
  if (isCronJob && global.newsState.consecutiveFailures >= 3) {
    const timeSinceLastAttempt = now - global.newsState.lastFetch;
    const minimumWait = 30 * 60 * 1000; // 30 minutes after 3 failures
    
    if (timeSinceLastAttempt < minimumWait) {
      const waitMinutes = Math.ceil((minimumWait - timeSinceLastAttempt) / (60 * 1000));
      console.log(`⏳ CRON: Waiting ${waitMinutes} minutes due to consecutive failures`);
      return false;
    }
  }
  
  return true;
};

const needsFreshNews = (isCronJob = false) => {
  const now = Date.now();
  const timeSinceLastSuccess = global.newsState.lastSuccessfulFetch ? 
    now - global.newsState.lastSuccessfulFetch : Infinity;
  
  // If we haven't had a successful fetch in over 2 hours, we definitely need fresh news
  if (timeSinceLastSuccess > 2 * 60 * 60 * 1000) {
    console.log(`✅ ${isCronJob ? 'CRON' : 'Regular'}: Need fresh news (last success > 2 hours ago)`);
    return true;
  }
  
  // For regular requests, be more lenient
  if (!isCronJob) {
    return true;
  }
  
  // For cron jobs, check if we need fresh content
  const minimumInterval = 30 * 60 * 1000; // 30 minutes minimum for cron
  const timeSinceLastFetch = now - global.newsState.lastFetch;
  
  if (timeSinceLastFetch >= minimumInterval) {
    console.log(`✅ CRON: Need fresh news (${Math.round(timeSinceLastFetch / (60 * 1000))} minutes since last fetch)`);
    return true;
  }
  
  console.log(`⏭️ CRON: Skip fetch (only ${Math.round(timeSinceLastFetch / (60 * 1000))} minutes since last)`);
  return false;
};

// Enhanced fetch function with better rate limit handling
const triggerNewsFetch = async (ipInfo = { ip: '8.8.8.8' }, options = {}) => {
  const { background = false, force = false, isCronJob = false } = options;
  
  console.log(`🚀 Fetch request: ${isCronJob ? 'CRON JOB' : 'REGULAR'}`);
  
  // Check if we can make API request
  if (!canMakeApiRequest(isCronJob) && !force) {
    const reason = global.newsState.isFetching ? 'already_fetching' : 'rate_limited';
    console.log(`⏭️ Skipping fetch: ${reason}`);
    return { success: false, reason };
  }
  
  // For cron jobs, check if we actually need fresh news
  if (isCronJob && !needsFreshNews(true) && !force) {
    console.log('⏭️ CRON: No fresh news needed');
    return { success: false, reason: 'no_fresh_news_needed' };
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
      
      // Clear rate limit state on success
      if (global.newsState.rateLimitDetected) {
        console.log('✅ Rate limit cleared after successful fetch');
        global.newsState.rateLimitDetected = false;
        global.newsState.rateLimitUntil = null;
      }
    }
    
    console.log(`✅ API request successful: ${results.length} articles`);
    
    return { success: true, articlesCount: results.length };
    
  } catch (error) {
    // Enhanced error handling for rate limits
    const isRateLimit = error.message.includes('Rate limit') || 
                       error.message.includes('429') || 
                       error.message.includes('Too Many Requests');
    
    if (global.newsState) {
      global.newsState.consecutiveFailures = (global.newsState.consecutiveFailures || 0) + 1;
      global.newsState.lastFetchSuccess = false;
      
      // Handle rate limit specifically
      if (isRateLimit) {
        global.newsState.rateLimitDetected = true;
        global.newsState.lastRateLimitTime = Date.now();
        
        // Set rate limit until time based on consecutive failures
        const backoffMinutes = Math.min(30 * Math.pow(1.5, global.newsState.consecutiveFailures - 1), 120);
        global.newsState.rateLimitUntil = Date.now() + (backoffMinutes * 60 * 1000);
        
        console.error(`🚫 Rate limit detected! Backing off for ${Math.ceil(backoffMinutes)} minutes`);
      }
    }
    
    console.error(`❌ News fetch failed:`, error.message);
    
    return { 
      success: false, 
      error: error.message,
      isRateLimit,
      backoffUntil: global.newsState?.rateLimitUntil
    };
    
  } finally {
    // Clear fetching state
    if (global.newsState) {
      global.newsState.isFetching = false;
      global.newsState.activeFetchPromise = null;
    }
  }
};

// Memory and cache cleanup for free hosting (unchanged)
const cleanupCaches = () => {
  console.log(`🧹 Cleaned up caches - Active: 0, Recent: 0`);
};

const memoryCleanup = () => {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    console.log(`🧠 Memory usage: ${heapUsedMB}MB`);
    
    if (global.gc && heapUsedMB > 100) {
      console.log('🧹 Running garbage collection...');
      global.gc();
    }
    
    if (heapUsedMB > 150) {
      console.log('🧹 Clearing caches due to high memory usage...');
      cleanupCaches();
    }
  }, 10 * 60 * 1000);
};

// App configuration (unchanged)
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

// Core middleware (unchanged)
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

// Socket.io setup (unchanged)
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Enhanced wake-up endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'alive',
    message: 'TruePace News API - Enhanced Rate Limit Handling',
    timestamp: new Date().toISOString(),
    environment: isDevelopment ? 'development' : 'production',
    cronStrategy: 'intelligent rate limit aware',
    rateLimitStatus: {
      detected: global.newsState?.rateLimitDetected || false,
      until: global.newsState?.rateLimitUntil ? new Date(global.newsState.rateLimitUntil).toISOString() : null
    }
  });
});

// Enhanced keep-alive endpoint
app.get('/api/keep-alive', (req, res) => {
  const now = Date.now();
  const canFetch = canMakeApiRequest(false);
  
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
    lastFetch: global.newsState?.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
    rateLimitStatus: {
      detected: global.newsState?.rateLimitDetected || false,
      until: global.newsState?.rateLimitUntil ? new Date(global.newsState.rateLimitUntil).toISOString() : null,
      canMakeRequest: canFetch,
      consecutiveFailures: global.newsState?.consecutiveFailures || 0
    }
  });
});

// Enhanced health endpoint
app.get('/health', async (req, res) => {
  const now = Date.now();
  const canFetch = canMakeApiRequest(false);
  const rateLimitWaitTime = global.newsState?.rateLimitUntil ? 
    Math.max(0, Math.ceil((global.newsState.rateLimitUntil - now) / (60 * 1000))) : 0;
  
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isDevelopment ? 'development' : 'production',
    fetchStatus: {
      lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
      totalFetches: global.newsState.fetchCount,
      lastSuccess: global.newsState.lastSuccessfulFetch ? new Date(global.newsState.lastSuccessfulFetch).toISOString() : 'never',
      consecutiveFailures: global.newsState.consecutiveFailures,
      canMakeRequest: canFetch
    },
    rateLimitStatus: {
      detected: global.newsState.rateLimitDetected || false,
      waitTimeMinutes: rateLimitWaitTime,
      rateLimitUntil: global.newsState?.rateLimitUntil ? new Date(global.newsState.rateLimitUntil).toISOString() : null,
      lastRateLimitTime: global.newsState?.lastRateLimitTime ? new Date(global.newsState.lastRateLimitTime).toISOString() : 'never'
    }
  };
  
  res.json(status);
});

// Enhanced cron endpoint with smart rate limit handling
app.all('/api/cron/fetch-news', async (req, res) => {
  try {
    console.log('\n🔔 ============ CRON JOB TRIGGERED ============');
    console.log(`📡 Method: ${req.method}`);
    console.log(`📡 Request from IP: ${req.ipAddress}`);
    
    // Check rate limit status before proceeding
    if (global.newsState?.rateLimitDetected) {
      const now = Date.now();
      const waitTime = Math.ceil((global.newsState.rateLimitUntil - now) / (60 * 1000));
      
      if (waitTime > 0) {
        console.log(`🚫 CRON: Skipping due to rate limit (${waitTime} minutes remaining)`);
        
        const response = {
          success: false,
          timestamp: new Date().toISOString(),
          reason: 'rate_limited',
          waitTimeMinutes: waitTime,
          rateLimitUntil: new Date(global.newsState.rateLimitUntil).toISOString(),
          message: `Rate limited. Next attempt in ${waitTime} minutes.`,
          environment: process.env.NODE_ENV || 'development',
          method: req.method
        };
        
        console.log('🏁 ============ CRON JOB SKIPPED ============\n');
        return res.json(response);
      }
    }
    
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
      errorMessage: result.error || null,
      isRateLimit: result.isRateLimit || false,
      backoffUntil: result.backoffUntil ? new Date(result.backoffUntil).toISOString() : null
    };
    
    console.log('🏁 ============ CRON JOB COMPLETED ============\n');
    res.json(response);
    
  } catch (error) {
    console.error('❌ CRON JOB FAILED:', error.message);
    res.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      isRateLimit: error.message.includes('Rate limit') || error.message.includes('429')
    });
  }
});

// Enhanced manual force fetch
app.post('/api/health/force-fresh-news', async (req, res) => {
  try {
    const startTime = Date.now();
    console.log('🚀 MANUAL fresh news requested');
    
    const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
    const force = req.body.force || false;
    
    // Check rate limit unless forced
    if (!force && global.newsState?.rateLimitDetected) {
      const now = Date.now();
      const waitTime = Math.ceil((global.newsState.rateLimitUntil - now) / (60 * 1000));
      
      if (waitTime > 0) {
        return res.json({
          success: false,
          message: `Rate limited. Wait ${waitTime} minutes or use force=true parameter.`,
          waitTimeMinutes: waitTime,
          rateLimitUntil: new Date(global.newsState.rateLimitUntil).toISOString(),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    const result = await triggerNewsFetch(ipInfo, { background: false, force });
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: result.success,
      message: result.success 
        ? `Successfully processed ${result.articlesCount} fresh articles in ${duration}ms` 
        : `Failed: ${result.reason || result.error}`,
      articlesProcessed: result.articlesCount || 0,
      duration: duration,
      isRateLimit: result.isRateLimit || false,
      backoffUntil: result.backoffUntil ? new Date(result.backoffUntil).toISOString() : null,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Force fetch endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      isRateLimit: error.message.includes('Rate limit') || error.message.includes('429'),
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced cron health endpoint
app.get('/api/cron/health', (req, res) => {
  const now = Date.now();
  const canFetch = canMakeApiRequest(true);
  const rateLimitWaitTime = global.newsState?.rateLimitUntil ? 
    Math.max(0, Math.ceil((global.newsState.rateLimitUntil - now) / (60 * 1000))) : 0;
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: isDevelopment ? 'development' : 'production',
    canFetch: canFetch,
    lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
    rateLimitStatus: {
      detected: global.newsState?.rateLimitDetected || false,
      waitTimeMinutes: rateLimitWaitTime,
      rateLimitUntil: global.newsState?.rateLimitUntil ? new Date(global.newsState.rateLimitUntil).toISOString() : null
    },
    recommendations: canFetch ? 
      'Ready for cron requests' : 
      `Wait ${rateLimitWaitTime} minutes before next cron attempt`
  });
});

// Mount all routes (unchanged)
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
  const now = Date.now();
  const canFetchRegular = canMakeApiRequest(false);
  const canFetchCron = canMakeApiRequest(true);
  const rateLimitWaitTime = global.newsState?.rateLimitUntil ? 
    Math.max(0, Math.ceil((global.newsState.rateLimitUntil - now) / (60 * 1000))) : 0;

  res.json({
    serverTime: new Date().toISOString(),
    uptime: `${Math.round(process.uptime() / 60)} minutes`,
    environment: isDevelopment ? 'development' : 'production',
    cronStrategy: 'intelligent rate limit aware',
    newsState: {
      ...global.newsState,
      canFetchRegular,
      canFetchCron,
      rateLimitWaitTimeMinutes: rateLimitWaitTime,
      lastFetchFormatted: global.newsState?.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
      lastSuccessFormatted: global.newsState?.lastSuccessfulFetch ? new Date(global.newsState.lastSuccessfulFetch).toISOString() : 'never'
    },
    rateLimitDetails: {
      detected: global.newsState?.rateLimitDetected || false,
      until: global.newsState?.rateLimitUntil ? new Date(global.newsState.rateLimitUntil).toISOString() : null,
      waitTimeMinutes: rateLimitWaitTime,
      lastRateLimitTime: global.newsState?.lastRateLimitTime ? new Date(global.newsState.lastRateLimitTime).toISOString() : 'never',
      consecutiveFailures: global.newsState?.consecutiveFailures || 0
    },
    environment_vars: {
      NODE_ENV: process.env.NODE_ENV,
      hasPartnerAPI: !!process.env.PARTNER_API_URL,
      port: port
    },
    database: {
      connected: mongoose.connection.readyState === 1,
      host: mongoose.connection.host
    },
    recommendations: {
      nextCronAttempt: canFetchCron ? 'Ready' : `Wait ${rateLimitWaitTime} minutes`,
      manualFetch: canFetchRegular ? 'Available' : `Rate limited for ${rateLimitWaitTime} minutes`
    }
  });
});

// Rate limit reset endpoint for emergency situations
app.post('/api/debug/reset-rate-limit', (req, res) => {
  const oldState = {
    rateLimitDetected: global.newsState?.rateLimitDetected || false,
    rateLimitUntil: global.newsState?.rateLimitUntil || null,
    consecutiveFailures: global.newsState?.consecutiveFailures || 0
  };

  // Reset all rate limit related states
  if (global.newsState) {
    global.newsState.rateLimitDetected = false;
    global.newsState.rateLimitUntil = null;
    global.newsState.lastRateLimitTime = null;
    global.newsState.consecutiveFailures = 0;
    global.newsState.isFetching = false;
  }

  console.log('🔄 Emergency rate limit reset performed');

  res.json({
    success: true,
    message: 'Rate limit state forcefully reset',
    oldState: {
      rateLimitDetected: oldState.rateLimitDetected,
      rateLimitUntil: oldState.rateLimitUntil ? new Date(oldState.rateLimitUntil).toISOString() : null,
      consecutiveFailures: oldState.consecutiveFailures
    },
    newState: {
      rateLimitDetected: false,
      consecutiveFailures: 0,
      resetTime: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  });
});

// Enhanced startup function
const startOptimizedServer = async () => {
  try {
    console.log('🚀 Starting enhanced server with intelligent rate limiting...');
    
    // Connect to MongoDB with retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        await mongoose.connect(process.env.MONGO, {
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          maxPoolSize: 5,
          bufferCommands: false,
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
    
    // Enhanced auto-fetch with rate limit awareness
    if (shouldAutoFetch) {
      console.log('🌅 Auto-fetch enabled - checking rate limit status...');
      
      setTimeout(async () => {
        try {
          if (canMakeApiRequest(false)) {
            console.log('✅ No rate limits detected - proceeding with startup fetch');
            const result = await triggerNewsFetch({ ip: '8.8.8.8' }, { background: true, force: false });
            console.log(`🚀 Startup fetch: ${result.success ? 'Success' : 'Failed'} - ${result.articlesCount || 0} articles`);
            
            if (result.isRateLimit) {
              console.log('🚫 Rate limit detected during startup fetch - will respect backoff');
            }
          } else {
            console.log('⏳ Rate limit detected - skipping startup fetch');
          }
        } catch (error) {
          console.error('❌ Startup fetch failed:', error.message);
        }
      }, 15000); // Increased delay for free hosting stability
    } else {
      console.log('⏭️ Auto-fetch disabled - no startup API call');
      console.log('💡 Use manual endpoints or set AUTO_FETCH_ON_START=true to enable');
    }
    
    // Start server
    server.listen(port, () => {
      console.log(`✅ Server running on port ${port} (enhanced with intelligent rate limiting)`);
      console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
      console.log(`🔧 Auto-fetch: ${shouldAutoFetch ? 'ENABLED' : 'DISABLED'}`);
      console.log(`📰 Partner API: ${process.env.PARTNER_API_URL ? 'Configured' : 'NOT CONFIGURED!'}`);
      console.log(`🧠 Rate Limiting: INTELLIGENT - Adaptive backoff with fallback strategies`);
      console.log(`🤖 Cron Strategy: Smart rate-limit aware external cron`);
      console.log(`🆓 Free Hosting Mode: Enhanced stability with rate limit detection`);
      
      if (isDevelopment) {
        console.log('🔧 Development Tips:');
        console.log('   • Use POST /api/health/force-fresh-news to manually fetch');
        console.log('   • Use GET /api/external-news/test-api to test API connection');
        console.log('   • Use GET /api/debug/status to check current state and rate limits');
        console.log('   • Use POST /api/debug/reset-rate-limit for emergency rate limit reset');
        console.log('   • Use GET /api/external-news/rate-limit-status for detailed rate limit info');
      }
      
      console.log('\n🎯 Rate Limit Management:');
      console.log('   • Automatic detection of 429 responses');
      console.log('   • Progressive backoff (30min → 45min → 67min → max 120min)');
      console.log('   • Multiple IP fallback strategies');
      console.log('   • Cron job intelligence (skips during rate limits)');
      console.log('   • Manual override options available');
    });
    
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

// Start the server
startOptimizedServer();

// Enhanced database heartbeat with connection recovery
setInterval(async () => {
  try {
    const startTime = Date.now();
    await mongoose.connection.db.admin().ping();
    const duration = Date.now() - startTime;
    
    console.log(`💓 Database heartbeat: ${duration}ms`);
    
    if (duration > 2000) {
      console.warn(`⚠️ Slow database response: ${duration}ms`);
    }
  } catch (error) {
    console.error('❌ Database heartbeat failed:', error.message);
    
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
}, 5 * 60 * 1000);

// CRON JOBS - Enhanced with rate limit awareness

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

// Refresh external channels every 24 hours (unchanged)
cron.schedule('0 1 * * *', async () => {
  try {
    console.log('📺 [INTERNAL-CRON] Refreshing external channels...');
    const success = await refreshExternalChannelsServer();
    console.log(success ? '✅ Channels refreshed' : '❌ Channel refresh failed');
  } catch (error) {
    console.error('❌ Channel refresh error:', error);
  }
});

// Daily cleanup at midnight (unchanged)
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

// Error handling middleware (unchanged)
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Enhanced graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('📛 SIGTERM received, shutting down gracefully...');
  
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