import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import cron from 'node-cron';
import HeadlineNewsChannelRoute from './lib/routes/HeadlineNews/HeadlineNewsChannelRoute.js'
import HeadlineNewsContentRoute from './lib/routes/HeadlineNews/HeadlineNewsContentRoute.js'
import HeadlineNewsCommentRoute from './lib/routes/HeadlineNews/HeadlineNewsCommentRoute.js'
import HeadlineNewsJustInRoute from './lib/routes/HeadlineNews/HeadlineNewsJustInRoute.js'
import UserRoute from './lib/routes/HeadlineNews/HeadlineNewsUserRoute.js' // Add this line
import { Content } from './lib/models/HeadlineNews/HeadlineModel.js';
import { initializeApp } from './lib/FirebaseAdmin.js';
import BeyondVideoRoute from './lib/routes/Beyond_Headline/Beyond_video/BeyondVideoRoute.js'
import BeyondArticleRoute from './lib/routes/Beyond_Headline/Beyond_article/BeyondArticleRoute.js'

await initializeApp(); 

// app config
dotenv.config();
const app = express();
const port  = process.env.PORT || 4000
const allowedOrigins = ['http://localhost:3000', 'later production url'];

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cors({
    origin: function(origin, callback){
      if(!origin) return callback(null, true);
      if(allowedOrigins.indexOf(origin) === -1){
        var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    }
  }));

// routes
app.use('/api/HeadlineNews/Channel',HeadlineNewsChannelRoute)
app.use('/api/HeadlineNews/Comment',HeadlineNewsCommentRoute)
app.use('/api/HeadlineNews/Content',HeadlineNewsContentRoute)
app.use('/api/HeadlineNews/GetJustIn',HeadlineNewsJustInRoute)
app.use('/api/users', UserRoute);
app.use('/api/BeyondVideo', BeyondVideoRoute);
app.use('/api/BeyondArticle', BeyondArticleRoute);

// api endpoints
app.get('/', (req, res) => {
    // GET request is to GET DATA from the database
    res.status(200).send("Hello Node Api headline news");
});


app.get('api/MissedJustIn', (req, res) => {
    res.status(200).send("Hello Node Api Missed Just In");
});

app.get('api/History', (req, res) => {
    res.status(200).send("Hello Node Api History");
});




// Database config
// mongoose.connect(process.env.MONGO)
//     .then(() => {
//         console.log("Connected to database");
//         app.listen(port, () => {
//             console.log(`Server is running on port ${port}` );
//         });

// }).catch((error) => {
//     console.error("Connection failed", error);
// });


// MongoDB connection
mongoose.connect(process.env.MONGO, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(port, () => {
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
        // Create a new content entry for Headline News
        const headlineContent = new Content({
          ...content.toObject(),
          _id: new mongoose.Types.ObjectId(), // Generate a new ID
          isJustIn: false,
          showInAllChannels: true,
          createdAt: new Date() // Set the creation time to now
        });
  
        await headlineContent.save();
  
        // Remove the content from Just In
        await Content.findByIdAndDelete(content._id);
      }
  
      console.log(`Moved ${expiredJustInContent.length} items from Just In to Headline News`);
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  });
    




    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).send('Something broke!');
      });