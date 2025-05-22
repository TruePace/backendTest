import express from 'express';
import { Channel } from '../../models/HeadlineNews/HeadlineModel.js';

const router = express.Router();

// Get external news channel by source name
router.get('/external/:sourceName', async (req, res) => {
  try {
    const { sourceName } = req.params;
    
    // Try to find existing channel for this source
    let channel = await Channel.findOne({ 
      name: sourceName,
      isExternal: true 
    });
    
    if (channel) {
      return res.status(200).json(channel);
    }
    
    // If no channel exists, return a 404
    res.status(404).json({ message: 'Channel not found' });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching external channel', error: err.message });
  }
});

export default router;