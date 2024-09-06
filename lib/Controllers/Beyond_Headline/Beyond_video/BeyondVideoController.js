

import { BeyondVideo } from "../../../models/Beyond_Video/BeyondVideoModel.js";
import { Channel } from "../../../models/HeadlineNews/HeadlineModel.js";

export const getAllVideos = async (req, res) => {
  try {
    const videos = await BeyondVideo.find()
      .sort({ createdAt: -1 })
      .populate('channelId', 'name picture');
    
    console.log('Videos with populated channel data:', JSON.stringify(videos, null, 2));
    
    res.status(200).json(videos);
  } catch (error) {
    console.error('Error in getAllVideos:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getVideoById = async (req, res) => {
    try {
        const video = await BeyondVideo.findById(req.params.id).populate('channelId', 'name picture');
        if (!video) {
            return res.status(404).json({ message: 'Video not found' });
        }
        res.status(200).json(video);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const createVideo = async (req, res) => {
    try {
        const { title, thumbnailUrl, videoUrl, channelId } = req.body;
        
        if (!title || !thumbnailUrl || !videoUrl || !channelId) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const channel = await Channel.findById(channelId);
        if (!channel) {
            return res.status(404).json({ message: 'Channel not found' });
        }

        const newVideo = new BeyondVideo({
            title,
            thumbnailUrl,
            videoUrl,
            channelId,
        });

        const savedVideo = await newVideo.save();
        res.status(201).json(savedVideo);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};