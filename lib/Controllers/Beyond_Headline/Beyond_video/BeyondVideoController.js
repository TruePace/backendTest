

import { BeyondVideo,BeyondVidComment,BeyondVideoInteraction} from "../../../models/Beyond_Video/BeyondVideoModel.js";
import { Channel } from "../../../models/HeadlineNews/HeadlineModel.js";
// import admin from 'firebase-admin'
import { User } from "../../../models/HeadlineNews/HeadlineModel.js";
 import { io } from "../../../../server.js";

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
    const { videoId } = req.params;
    const { text, replyTo } = req.body;
    const { uid } = req.user;

    // Fetch the user's details from your database
    const user = await User.findOne({ uid });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Use the username, which is now always set to a version of the display name
    const newComment = new BeyondVidComment({
      userId: uid,
      username: user.username,
      videoId,
      text,
      replyTo,
      picture: user.photoURL
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

    const updatedVideo = await BeyondVideo.findByIdAndUpdate(
      videoId, 
      { $inc: { commentCount: 1 } },  
      { new: true }
    );

     // Emit a 'videoUpdated' event
     io.emit('videoUpdated', { 
      videoId: videoId,
      commentCount: updatedVideo.commentCount,
      likeCount: updatedVideo.likeCount,
      viewCount: updatedVideo.viewCount
    });

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Error in postBeyondVideoComment:', error);
    res.status(500).json({ message: error.message });
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
  
  
  export const getBeyondVideoCommentCount = async (req, res) => {
    try {
      const { videoId } = req.params;
      const commentCount = await BeyondVidComment.countDocuments({ videoId });
      res.json({ commentCount });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
  
  
  
  export const likeVideo = async (req, res) => {
    try {
      const { videoId } = req.params;
      const { uid } = req.user;
      const { deviceInfo, location } = req.body;
  
      const video = await BeyondVideo.findById(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
  
      const likeIndex = video.likes.indexOf(uid);
      if (likeIndex > -1) {
        video.likes.splice(likeIndex, 1);
        video.likeCount = Math.max(0, video.likeCount - 1);
        await BeyondVideoInteraction.findOneAndDelete({ userId: uid, videoId, interactionType: 'like' });
      } else {
        video.likes.push(uid);
        video.likeCount += 1;
        await BeyondVideoInteraction.create({
          userId: uid,
          videoId,
          interactionType: 'like',
          deviceInfo,
          location
        });
      }
      
      // Recalculate engagement and viral scores
      video.engagementScore = video.calculateEngagementScore();
      video.viralScore = video.calculateViralScore();
  
      await video.save();
  
      // Emit the updated video data
      io.emit('videoUpdated', { 
        videoId: video._id,
        likeCount: video.likeCount,
        engagementScore: video.engagementScore,
        viralScore: video.viralScore
      });
  
      res.json({ 
        likes: video.likes, 
        likeCount: video.likeCount,
        engagementScore: video.engagementScore,
        viralScore: video.viralScore
      });
    } catch (error) {
      console.error('Error in likeVideo:', error);
      res.status(500).json({ message: error.message });
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



  export const viewVideo = async (req, res) => {
    try {
      console.log('Received view request:', req.body);
      const { videoId } = req.params;
      const { uid } = req.user;
      const { watchDuration, deviceInfo, location } = req.body;
  
      const video = await BeyondVideo.findById(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
  
      // Increment view count
      video.viewCount += 1;
  
      // Update average watch time only if watchDuration is provided
      if (watchDuration > 0) {
        const totalWatchTime = video.avgWatchTime * (video.viewCount - 1);
        video.avgWatchTime = (totalWatchTime + watchDuration) / video.viewCount;
      }
  
      // Create interaction
      await BeyondVideoInteraction.create({
        userId: uid,
        videoId,
        interactionType: 'view',
        watchDuration,
        deviceInfo,
        location
      });
  
      // Recalculate engagement and viral scores
      video.engagementScore = video.calculateEngagementScore();
      video.viralScore = video.calculateViralScore();


    console.log('Updating video:', {
      viewCount: video.viewCount,
      avgWatchTime: video.avgWatchTime,
      engagementScore: video.engagementScore,
      viralScore: video.viralScore
    });

  
      await video.save();
  
      // Emit the updated video data
      io.emit('videoUpdated', { 
        videoId: video._id,
        viewCount: video.viewCount,
        avgWatchTime: video.avgWatchTime,
        engagementScore: video.engagementScore,
        viralScore: video.viralScore
      });
  
      res.json({ 
        viewCount: video.viewCount, 
        avgWatchTime: video.avgWatchTime,
        engagementScore: video.engagementScore,
        viralScore: video.viralScore
      });
    } catch (error) {
      console.error('Error in viewVideo:', error);
      res.status(500).json({ message: error.message });
    }
  };