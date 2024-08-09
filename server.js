import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Channel, Content, Comment, User } from './lib/models/HeadlineModel.js'

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
// GET a single ID
app.get('/HeadlineNews/Content/:id', async (req, res) => {
    try {
        const content = await Content.findById(req.params.id);
        if (!content) {
            return res.status(404).json({ message: 'Content not found' });
        }
        res.status(200).json(content);
    } catch (err) {
        console.error('Error fetching content:', err);
        res.status(500).json({ message: 'Error fetching content', error: err.message });
    }
});

app.get('/HeadlineNews/Channel/:id', async (req, res) => {
    try {
        console.log('Received GET request for Channel ID:', req.params.id);
        
        const channel = await Channel.findById(req.params.id);
        
        console.log('Database query result:', channel);
        
        if (!channel) {
            console.log('Channel not found');
            return res.status(404).json({ message: 'Channel not found' });
        }
        
        res.status(200).json(channel);
    } catch (err) {
        console.error('Error fetching channel:', err);
        res.status(500).json({ message: 'Error fetching channel', error: err.message });
    }
});

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

  app.put('/HeadlineNews/Channel/:id', async (req, res) => {
    try {
        const updatedChannel = await Channel.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedChannel) {
            return res.status(404).json({ message: 'Channel not found' });
        }
        res.status(200).json(updatedChannel);
    } catch (err) {
        res.status(500).json({ message: 'Error updating channel', error: err.message });
    }
});

app.put('/HeadlineNews/Content/:id', async (req, res) => {
    try {
        const updatedContent = await Content.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedContent) {
            return res.status(404).json({ message: 'Content not found' });
        }
        res.status(200).json(updatedContent);
    } catch (err) {
        res.status(500).json({ message: 'Error updating content', error: err.message });
    }
});

app.put('/HeadlineNews/Comment/:id', async (req, res) => {
    try {
        const updatedComment = await Comment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedComment) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        res.status(200).json(updatedComment);
    } catch (err) {
        res.status(500).json({ message: 'Error updating comment', error: err.message });
    }
});

app.put('/HeadlineNews/User/:id', async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: 'Error updating user', error: err.message });
    }
});

app.delete('/HeadlineNews/Channel/:id', async (req, res) => {
    try {
        const deletedChannel = await Channel.findByIdAndDelete(req.params.id);
        if (!deletedChannel) {
            return res.status(404).json({ message: 'Channel not found' });
        }
        res.status(200).json({ message: 'Channel deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting channel', error: err.message });
    }
});

app.delete('/HeadlineNews/Content/:id', async (req, res) => {
    try {
        const deletedContent = await Content.findByIdAndDelete(req.params.id);
        if (!deletedContent) {
            return res.status(404).json({ message: 'Content not found' });
        }
        res.status(200).json({ message: 'Content deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting content', error: err.message });
    }
});

app.delete('/HeadlineNews/Comment/:id', async (req, res) => {
    try {
        const deletedComment = await Comment.findByIdAndDelete(req.params.id);
        if (!deletedComment) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        res.status(200).json({ message: 'Comment deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting comment', error: err.message });
    }
});

app.delete('/HeadlineNews/User/:id', async (req, res) => {
    try {
        const deletedUser = await User.findByIdAndDelete(req.params.id);
        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting user', error: err.message });
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
