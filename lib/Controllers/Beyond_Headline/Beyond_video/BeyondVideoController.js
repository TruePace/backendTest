

import { BeyondVideo,BeyondVidComment} from "../../../models/Beyond_Video/BeyondVideoModel.js";
import { Channel } from "../../../models/HeadlineNews/HeadlineModel.js";
import admin from 'firebase-admin'
import { User } from "../../../models/HeadlineNews/HeadlineModel.js";

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

    await BeyondVideo.findByIdAndUpdate(videoId, { $inc: { commentsCount: 1 } });

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
      console.log("Received like request for video:", videoId);
      
      // Log the entire authorization header
      console.log("Authorization header:", req.headers.authorization);
      
      // Verify the token
      const token = req.headers.authorization.split('Bearer ')[1];
      console.log("Extracted token:", token.substring(0, 10) + "...");
      
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (error) {
        console.error("Token verification failed:", error);
        return res.status(401).json({ message: "Invalid token" });
      }
      
      const uid = decodedToken.uid;
      console.log("Authenticated user:", uid);
      
      const video = await BeyondVideo.findById(videoId);
      if (!video) {
        console.log("Video not found:", videoId);
        return res.status(404).json({ message: "Video not found" });
      }
  
      const likeIndex = video.likes.indexOf(uid);
      if (likeIndex > -1) {
        console.log("Removing like");
        video.likes.splice(likeIndex, 1);
        video.likesCount = Math.max(0, video.likesCount - 1);
      } else {
        console.log("Adding like");
        video.likes.push(uid);
        video.likesCount += 1;
      }
      
      await video.save();
      console.log("Updated video:", video);
      
      res.json({ likes: video.likes, likesCount: video.likesCount });
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
      const { videoId } = req.params;
      console.log("Received view request for video:", videoId);
  
      // Log the entire authorization header
      console.log("Authorization header for view:", req.headers.authorization);
  
      // Verify the token
      const token = req.headers.authorization.split('Bearer ')[1];
      console.log("Extracted token for view:", token.substring(0, 10) + "...");
  
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (error) {
        console.error("Token verification failed for view:", error);
        return res.status(401).json({ message: "Invalid token" });
      }
  
      const uid = decodedToken.uid;
      console.log("Authenticated user for view:", uid);
  
      const video = await BeyondVideo.findById(videoId);
      if (!video) {
        console.log("Video not found for view:", videoId);
        return res.status(404).json({ message: "Video not found" });
      }
  
      if (!video.views.includes(uid)) {
        console.log("Adding new view for user:", uid);
        video.views.push(uid);
        video.viewsCount += 1;
        await video.save();
        console.log("Updated video view count:", video.viewsCount);
      } else {
        console.log("User has already viewed this video:", uid);
      }
  
      console.log("Sending view response");
      res.json({ views: video.views, viewsCount: video.viewsCount });
    } catch (error) {
      console.error('Error in viewVideo:', error);
      res.status(500).json({ message: error.message });
    }
  };