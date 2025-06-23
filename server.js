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
import UserRoute from './lib/routes/HeadlineNews/HeadlineNewsUserRoute.js' // Add this line
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
// Import CleanupService

import { CleanupService,cleanupRoutes } from './lib/routes/HeadlineNews/CleanupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

// console.log('FIREBASE_SERVICE_ACCOUNT:', process.env.FIREBASE_SERVICE_ACCOUNT);
 
await initializeApp(); 

// app config
const app = express();
const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://ikea-true.vercel.app"], // Updated to include Vercel URL
    methods: ["GET", "POST"],
    credentials: true
  }
});

const port = process.env.PORT || 4000;
const allowedOrigins = [
  'http://localhost:3000',
  'https://ikea-true.vercel.app'  // Added your Vercel URL
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
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true, // Allow credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Specify allowed methods
  allowedHeaders: ['Content-Type', 'Authorization'] // Specify allowed headers
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
const router = express.Router();
cleanupRoutes(router);
app.use('/api/admin', router);

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

// Move expired Just In content to Headlines (runs every minute)
cron.schedule('* * * * *', async () => {
  try {
    const expiredJustInContent = await Content.find({
      isJustIn: true,
      justInExpiresAt: { $lte: new Date() }
    });

    for (let content of expiredJustInContent) {
      // Update the existing content instead of creating a new one
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
    
    // Run the full cleanup service
    const cleanupResult = await CleanupService.runFullCleanup();
    
    if (cleanupResult.success) {
      console.log(`✅ Daily cleanup completed: ${cleanupResult.duplicatesRemoved} duplicates removed, ${cleanupResult.expiredRemoved} expired items removed`);
    } else {
      console.error('❌ Daily cleanup failed:', cleanupResult.error);
    }
    
    // Keep your existing logic as backup
    const now = new Date();
    
    // Delete internal content expired after 24 hours
    const expiredInternalResult = await Content.deleteMany({ 
      source: { $ne: 'external' }, // Internal content (not external)
      headlineExpiresAt: { $lte: now } 
    });
    
    // Delete external content expired after 48 hours
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
    
    // Remove duplicates first
    const duplicatesRemoved = await CleanupService.removeDuplicateExternalContent();
    
    // Then clean expired external content
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

// Add a cron job to update channel statistics daily at 3 AM
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