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
import LocationRoute from './lib/routes/HeadlineNews/LocationRoute.js'
import { CleanupService, cleanupRoutes } from './lib/routes/HeadlineNews/CleanupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

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

// routes
app.use('/api/HeadlineNews/Channel', HeadlineNewsChannelRoute)
app.use('/api/location', LocationRoute);
app.use('/api/HeadlineNews/Comment', HeadlineNewsCommentRoute)
app.use('/api/HeadlineNews/Content', HeadlineNewsContentRoute)
app.use('/api/HeadlineNews/GetJustIn', HeadlineNewsJustInRoute)
app.use('/api/users', UserRoute);
app.use('/api/BeyondVideo', BeyondVideoRoute);
app.use('/api/BeyondArticle', BeyondArticleRoute);
app.use('/api/HeadlineNews', MissedJustInRoute)
app.use('/api/history', UserHistoryRoute);
app.use('/api/ml-partner', MlPartnerRoute);

// Add cleanup routes
const cleanupRouter = express.Router();
cleanupRoutes(cleanupRouter);
app.use('/api/admin', cleanupRouter);

// Basic health check endpoints
app.get('/api/health/keep-alive', async (req, res) => {
  try {
    const uptime = process.uptime();
    
    console.log('🏥 Keep-alive ping');
    
    res.json({ 
      status: 'alive', 
      timestamp: new Date().toISOString(),
      uptime: Math.round(uptime)
    });
    
  } catch (error) {
    console.error('❌ Keep-alive error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Warm-up endpoint for database
app.get('/api/health/warm-up', async (req, res) => {
  try {
    console.log('🔥 Warm-up endpoint called');
    
    // Warm up database connection
    await mongoose.connection.db.admin().ping();
    
    res.json({
      status: 'warmed-up',
      timestamp: new Date().toISOString(),
      dbConnected: mongoose.connection.readyState === 1
    });
    
  } catch (error) {
    console.error('❌ Warm-up error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

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
    
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      console.log('🚀 Server ready - external news now handled by frontend');
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
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
    
    // Clean up internal content (24hr rule)
    const now = new Date();
    const expiredInternalResult = await Content.deleteMany({ 
      source: { $ne: 'external' },
      headlineExpiresAt: { $lte: now } 
    });
    
    console.log(`Deleted ${expiredInternalResult.deletedCount} expired internal content items (24hr rule).`);
    
  } catch (error) {
    console.error('Error in daily cleanup cron job:', error);
  }
});

// 6-hour cleanup for any remaining cleanup tasks
cron.schedule('0 */6 * * *', async () => {
  try {
    console.log('🕕 Running 6-hour cleanup...');
    
    const duplicatesRemoved = await CleanupService.removeDuplicateExternalContent();
    
    if (duplicatesRemoved > 0) {
      console.log(`[6hr cleanup] Removed ${duplicatesRemoved} duplicates`);
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});