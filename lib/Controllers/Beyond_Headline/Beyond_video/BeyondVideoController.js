

import { BeyondVideo,BeyondVidComment} from "../../../models/Beyond_Video/BeyondVideoModel.js";
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

export const postBeyondVideoComment = async (req, res) => {
    try {
      const { videoId, text, replyTo } = req.body;
      const { uid, email } = req.user;
  
      // Use email as username if no username is provided
      const username = req.user.username || email.split('@')[0];
  
      console.log('Received data:', { videoId, text, replyTo, uid, username });
  
      if (!videoId) {
        return res.status(400).json({ message: "videoId is required" });
      }
  
      const newComment = new BeyondVidComment({
        userId: uid,
        username,
        videoId,
        text,
        replyTo
      });
  
      if (replyTo) {
        const parentComment = await BeyondVidComment.findById(replyTo);
        if (!parentComment) {
          return res.status(404).json({ message: "Parent comment not found" });
        }
        parentComment.replies.push(newComment._id);
        await parentComment.save();
      }
  
      await newComment.save();
  
      // Update comment count on the video
      await BeyondVideo.findByIdAndUpdate(videoId, { $inc: { commentsCount: 1 } });
  
      res.status(201).json(newComment);
    } catch (error) {
      console.error('Error in postBeyondVideoComment:', error);
      res.status(400).json({ message: error.message });
    }
  };
  
  export const getBeyondVideoComments = async (req, res) => {
    try {
      const { videoId } = req.params;
      const comments = await BeyondVidComment.find({ videoId, replyTo: null })
        .populate({
          path: 'replies',
          populate: {
            path: 'replies',
            populate: { path: 'replies' }
          }
        })
        .sort('-createdAt');
  
      const commentCount = await BeyondVidComment.countDocuments({ videoId });
  
      res.json({ comments, commentCount });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
  
  export const likeBeyondVideoComment = async (req, res) => {
    try {
      const { commentId } = req.params;
      const { uid } = req.user;
  
      const comment = await BeyondVidComment.findById(commentId);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
  
      const likeIndex = comment.likes.indexOf(uid);
      if (likeIndex > -1) {
        comment.likes.splice(likeIndex, 1);
      } else {
        comment.likes.push(uid);
      }
  
      await comment.save();
      res.json({ likes: comment.likes.length });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
  
  export const getBeyondVideoCommentCount = async (req, res) => {
    try {
      const { videoId } = req.params;
      const commentCount = await BeyondVidComment.countDocuments({ videoId });
      res.json({ commentCount });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
