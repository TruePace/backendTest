

import { BeyondVideo,BeyondVidComment,BeyondVideoInteraction} from "../../../models/Beyond_Video/BeyondVideoModel.js";
import { Channel } from "../../../models/HeadlineNews/HeadlineModel.js";
// import admin from 'firebase-admin'
import { User } from "../../../models/HeadlineNews/HeadlineModel.js";
 import { io } from "../../../../server.js";
 import { addToHistory } from "../../User_History/UserHistoryController.js";

 export const getAllVideos = async (req, res) => {
  try {
    const { channelId, tag, page = 1, limit = 10 } = req.query;
    let query = channelId ? { channelId } : {};
    
    if (tag) {
      query.tags = tag;
    }
    
    const skip = (page - 1) * limit;
    
    const videos = await BeyondVideo.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('channelId', 'name picture');

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
        const { title, thumbnailUrl, videoUrl, channelId , description, tags } = req.body;
        
        if (!title || !thumbnailUrl || !videoUrl || !channelId) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const channel = await Channel.findById(channelId);
        if (!channel) {
            return res.status(404).json({ message: 'Channel not found' });
        }

        // Process tags
        const processedTags = tags ? tags.map(tag => tag.toLowerCase().replace(/[^a-z0-9]/g, '')) : [];


        const newVideo = new BeyondVideo({
            title,
            thumbnailUrl,
            videoUrl,
            channelId,
            description,
            tags: processedTags,
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
    const { deviceInfo, location } = req.body; // Add these to capture device info and location

    // Fetch the user's details from your database
    const user = await User.findOne({ uid });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create the comment
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

    // Create an interaction record
    await BeyondVideoInteraction.create({
      userId: uid,
      videoId,
      interactionType: 'comment',
      deviceInfo,
      location,
      ipAddress: req.ipAddress
    });

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
      viewCount: updatedVideo.viewCount,
      avgWatchTime: updatedVideo.avgWatchTime,
      engagementScore: updatedVideo.engagementScore,
      viralScore: updatedVideo.viralScore
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
          location,
          ipAddress: req.ipAddress
        });
      }
      
      // Recalculate engagement and viral scores
      video.engagementScore = video.calculateEngagementScore();
      video.viralScore = video.calculateViralScore();
  
      await video.save();
  
      // Emit the updated video data
      io.emit('videoUpdated', { 
        videoId: video._id,
        commentCount: video.commentCount,
        likeCount: video.likeCount,
        viewCount: video.viewCount,
        avgWatchTime: video.avgWatchTime,
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
        // console.log('Received view request:', req.body);
        const { videoId } = req.params;
        const { uid } = req.user;
        const { watchDuration, deviceInfo, location } = req.body;

        const video = await BeyondVideo.findById(videoId);
        if (!video) {
            return res.status(404).json({ message: "Video not found" });
        }

        // console.log('Current video duration:', video.duration);
        // console.log('Watch duration received:', watchDuration);

        // If video duration isn't set, update it
        if (!video.duration && req.body.videoDuration) {
            video.duration = req.body.videoDuration;
        }

        const requiredWatchDuration = video.duration * 0.7;
        // console.log('Required watch duration:', requiredWatchDuration);

        // Only proceed if user has watched at least 70% of the video
        if (watchDuration >= requiredWatchDuration) {
            // console.log('Watch duration meets threshold');
            
            // Check for recent views
            const lastInteraction = await BeyondVideoInteraction.findOne({
                userId: uid,
                videoId,
                interactionType: 'view',
                timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });

            if (!lastInteraction) {
                // console.log('No recent interaction found, incrementing view count');
                video.viewCount += 1;
                if (!video.uniqueViewers.includes(uid)) {
                    video.uniqueViewers.push(uid);
                }
            }

            // Create/update interaction record
            const interaction = await BeyondVideoInteraction.findOneAndUpdate(
                { userId: uid, videoId, interactionType: 'view' },
                {
                    watchDuration,
                    deviceInfo,
                    location,
                    ipAddress: req.ip,
                    timestamp: new Date()
                },
                { upsert: true, new: true }
            );
            // console.log('Interaction recorded:', interaction);

            // Update average watch time
            if (watchDuration > 0) {
                const totalWatchTime = video.avgWatchTime * (video.viewCount - 1);
                video.avgWatchTime = (totalWatchTime + watchDuration) / video.viewCount;
            }

            // Update scores and save
            video.engagementScore = video.calculateEngagementScore();
            video.viralScore = video.calculateViralScore();
            await video.save();

            // Emit update
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
        } else {
            // console.log('Watch duration does not meet threshold');
            res.json({
                viewCount: video.viewCount,
                avgWatchTime: video.avgWatchTime,
                engagementScore: video.engagementScore,
                viralScore: video.viralScore,
                message: "Watch duration does not meet 70% threshold"
            });
        }
    } catch (error) {
        console.error('Error in viewVideo:', error);
        res.status(500).json({ message: error.message });
    }
};
  
  export const shareVideo = async (req, res) => {
    try {
      const { videoId } = req.params;
      const { uid } = req.user;
      const { platform, deviceInfo, location } = req.body;
  
      const video = await BeyondVideo.findById(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
  
      // Create a share interaction record
      await BeyondVideoInteraction.create({
        userId: uid,
        videoId,
        interactionType: 'share',
        deviceInfo,
        location,
        platform,
        ipAddress: req.ipAddress 
      });
  
      // Increment share count
      video.shareCount = (video.shareCount || 0) + 1;
  
      // Recalculate engagement and viral scores
      video.engagementScore = video.calculateEngagementScore();
      video.viralScore = video.calculateViralScore();
  
      await video.save();
  
      // Emit the updated video data
      io.emit('videoUpdated', { 
        videoId: video._id,
        commentCount: video.commentCount,
        likeCount: video.likeCount,
        viewCount: video.viewCount,
        shareCount: video.shareCount,
        avgWatchTime: video.avgWatchTime,
        engagementScore: video.engagementScore,
        viralScore: video.viralScore
      });
  
      res.json({ 
        shareCount: video.shareCount,
        engagementScore: video.engagementScore,
        viralScore: video.viralScore
      });
    } catch (error) {
      console.error('Error in shareVideo:', error);
      res.status(500).json({ message: error.message });
    }
  };