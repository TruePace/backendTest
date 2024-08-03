import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Channel, Content, Comment, User } from './lib/models/HeadlineModel.js'

// app config
dotenv.config();
const app = express();
const port  = process.env.PORT || 4000

// Middleware to parse JSON bodies
app.use(express.json());

// api endpoints
app.get('/', (req, res) => {
    // GET request is to GET DATA from the database
    res.status(200).send("Hello Node Api headline news");
});
app.get('/BeyondHeadline', (req, res) => {
    res.status(200).send('Hello Beyond get response');
});
app.get('/MissedJustIn', (req, res) => {
    res.status(200).send("Hello Node Api Missed Just In");
});

app.get('/History', (req, res) => {
    res.status(200).send("Hello Node Api History");
});

app.get('/HeadlineNews/Channel',async (req,res)=>{
    try {
        const channels = await Channel.find();
        res.status(200).json(channels);
      } catch (err) {
        console.error('Error fetching channels:', err);
        res.status(500).json({ message: 'Error fetching channels', error: err.message });
      }
})

app.get('/HeadlineNews/Content',async (req,res)=>{
    try {
        const content = await Content.find();
        res.status(200).json(content);
      } catch (err) {
        console.error('Error fetching contents:', err);
        res.status(500).json({ message: 'Error fetching contents', error: err.message });
      }
})
app.get('/HeadlineNews/Comment',async (req,res)=>{
    try {
        const comment = await Comment.find();
        res.status(200).json(comment);
      } catch (err) {
        console.error('Error fetching contents:', err);
        res.status(500).json({ message: 'Error fetching contents', error: err.message });
      }
})

// POST request is to ADD DATA to the database
app.post('/HeadlineNews/Channel', async (req, res) => {
    try {
      const dbChannel = req.body;
      const newChannel = await Channel.create(dbChannel);
      res.status(201).send(newChannel);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/HeadlineNews/Content', async (req, res) => {
    try {
      const dbContent = req.body;
      const newContent = await Content.create(dbContent);
      res.status(201).send(newContent);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/HeadlineNews/Comment', async (req, res) => {
    try {
      const dbComment = req.body;
      const newComment = await Comment.create(dbComment);
      res.status(201).send(newComment);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/HeadlineNews/User', async (req, res) => {
    try {
      const dbUser = req.body;
      const newUser = await User.create(dbUser);
      res.status(201).send(newUser);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  

// Database config
mongoose.connect(process.env.MONGO)
    .then(() => {
        console.log("Connected to database");
        app.listen(port, () => {
            console.log(`Server is running on port ${port}` );
        });
        
    })
    .catch((error) => {
        console.error("Connection failed", error);
    });
