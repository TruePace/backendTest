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
import ExportUserHeadlineDataEndpoint from './lib/routes/Export_User_Data_Headline/ExportUserHeadlineDataEndpoint.js'
import DataExportService from './lib/routes/Export_User_Data_Headline/DataExportService.js';

import { setupChangeStream } from './lib/routes/Direct_ML_Database/ChangeStream.js';
import MlPartnerRoute from './lib/routes/Direct_ML_Database/MlPartnerRoute.js'

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
    origin: ["http://localhost:3000", "https://ikea-better.vercel.app"], // Updated to include Vercel URL
    methods: ["GET", "POST"],
    credentials: true
  }
});

const port = process.env.PORT || 4000;
const allowedOrigins = [
  'http://localhost:3000',
  'https://ikea-better.vercel.app'  // Added your Vercel URL
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
app.use('/api/HeadlineNews/Comment',HeadlineNewsCommentRoute)
app.use('/api/HeadlineNews/Content',HeadlineNewsContentRoute)
app.use('/api/HeadlineNews/GetJustIn',HeadlineNewsJustInRoute)
app.use('/api/users', UserRoute);
app.use('/api/BeyondVideo', BeyondVideoRoute);
app.use('/api/BeyondArticle', BeyondArticleRoute);
app.use ('/api/HeadlineNews',MissedJustInRoute)
app.use('/api/history', UserHistoryRoute);
app.use('/api/data', ExportUserHeadlineDataEndpoint);

app.use('/api/ml-partner', MlPartnerRoute);

 
// MongoDB connection
mongoose.connect(process.env.MONGO, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log('Connected to MongoDB');
    setupChangeStream()
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

  
        
 // Set up the cron job after successful database connection
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
    console.log(`Moved ${expiredJustInContent.length} items from Just In to Headline News`);
  } catch (error) {
    console.error('Error in cron job:', error);
  }
});

cron.schedule('0 0 * * *', async () => {
  try {
    const result = await Content.deleteMany({ headlineExpiresAt: { $lte: new Date() } });
    console.log(`Deleted ${result.deletedCount} expired Headline News content items.`);
  } catch (error) {
    console.error('Error deleting expired content:', error);
  }
});
    


// setting up a system to regularly update and export the data for your machine learning partner
await DataExportService.initialize()
// Schedule full data export every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Starting scheduled data export');
  try {
    await DataExportService.exportAllData();
  } catch (error) {
    console.error('Scheduled export failed:', error);
  }
});
// Schedule incremental updates every hour
cron.schedule('0 * * * *', async () => {
  console.log('Starting incremental data update');
  try {
    // You can implement incremental updates here if needed
    // This could be useful for updating only the data that has changed since the last export
  } catch (error) {
    console.error('Incremental update failed:', error);
  }
});
// Add an endpoint to manually trigger data export
app.post('/api/trigger-export', verifyFirebaseToken, async (req, res) => {
  try {
    const exportJob = DataExportService.exportAllData();
    res.json({ message: 'Export job started' });
    
    // Optionally wait for the export to complete
    await exportJob;
  } catch (error) {
    console.error('Manual export failed:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});





    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).send('Something broke!');
      });