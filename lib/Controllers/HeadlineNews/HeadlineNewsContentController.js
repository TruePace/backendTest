// Updated HeadlineNewsContentController.js - Improved duplicate handling
import { Content, Channel, Interaction, User } from "../../models/HeadlineNews/HeadlineModel.js";
import { io } from "../../../server.js";

const getHeadlineNewsContent = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit; 
  

  try {
    const contents = await Content.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json(contents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getHeadlineNewsContentId = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ message: 'Content not found' });
    }
    res.status(200).json(content);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching content', error: err.message });
  }
};

// Check if content exists by MongoDB _id
const checkContentExists = async (req, res) => {
  try {
    const content = await Content.findById(req.params.id);
    if (content) {
      res.status(200).json(content);
    } else {
      res.status(404).json(null);
    }
  } catch (err) {
    res.status(404).json(null);
  }
};

// Improved: Check if external content exists by externalId
const checkExternalContentExists = async (req, res) => {
  try {
    const { externalId } = req.params;
    console.log(`🔍 Checking for existing external content with ID: ${externalId}`);
    
    const content = await Content.findOne({ 
      externalId: externalId,
      source: 'external' 
    });
    
    if (content) {
      console.log(`✅ Found existing external content: ${content._id}`);
      res.status(200).json(content);
    } else {
      console.log(`❌ No existing external content found with ID: ${externalId}`);
      res.status(404).json(null);
    }
  } catch (err) {
    console.error(`❌ Error checking external content: ${err.message}`);
    res.status(404).json(null);
  }
};

const getHeadlineNewsContentByChannel = async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const contents = await Content.find({ channelId: channelId }).sort('-createdAt');
    res.status(200).json(contents);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching contents', error: err.message });
  }
};

const getUserInteraction = async (req, res) => {
  try {
    const { contentId } = req.params;
    const userId = req.user.uid;

    const interaction = await Interaction.findOne({ userId, contentId });
            
    res.status(200).json({
      activeButton: interaction ? interaction.interactionType : null
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user interaction', error: err.message });
  }
};

const postHeadlineNewsContent = async (req, res) => {
  try {
    console.log(`📝 Creating new content...`);
    
    // For external content, check if it already exists using externalId
    if (req.body.externalId) {
      console.log(`🔍 Checking for existing external content with ID: ${req.body.externalId}`);
      
      const existingContent = await Content.findOne({ 
        externalId: req.body.externalId,
        source: 'external'
      });
      
      if (existingContent) {
        console.log(`✅ External content already exists: ${req.body.externalId} (MongoDB ID: ${existingContent._id})`);
        return res.status(200).json(existingContent); // Return existing content
      }
      
      console.log(`✅ External content ID is unique: ${req.body.externalId}`);
    }

    // Check if content with this MongoDB _id already exists (for backward compatibility)
    if (req.body._id) {
      const existingContent = await Content.findById(req.body._id);
      if (existingContent) {
        console.log(`✅ Content with MongoDB ID already exists: ${req.body._id}`);
        return res.status(200).json(existingContent); // Return existing content
      }
    }

    // Additional validation for external content
    if (req.body.source === 'external') {
      if (!req.body.externalId) {
        return res.status(400).json({ 
          message: 'External content requires externalId',
          error: 'Missing externalId field'
        });
      }
      
      if (!req.body.originalUrl) {
        return res.status(400).json({ 
          message: 'External content requires originalUrl',
          error: 'Missing originalUrl field'
        });
      }
    }

    console.log(`💾 Creating new content with externalId: ${req.body.externalId || 'N/A'}`);
    
    const newContent = new Content({
      ...req.body,
      channelId: req.body.channelId
    });
        
    await newContent.save();
        
    // Update channel statistics
    const channel = await Channel.findById(newContent.channelId);
    if (channel) {
      channel.contentCount += 1;
      await channel.save();
      console.log(`📊 Updated channel content count: ${channel.name} (${channel.contentCount})`);
    }
        
    console.log(`✅ Successfully created content: ${newContent.message.substring(0, 50)}... (ID: ${newContent._id})`);
    res.status(201).json(newContent);
  } catch (err) {
    console.error('❌ Error creating content:', err);
    
    // Handle duplicate key error specifically
    if (err.code === 11000 && err.keyPattern && err.keyPattern.externalId) {
      console.log(`⚠️ Duplicate externalId detected: ${err.keyValue.externalId}`);
      // Try to find and return the existing content
      try {
        const existingContent = await Content.findOne({ externalId: err.keyValue.externalId });
        if (existingContent) {
          return res.status(200).json(existingContent);
        }
      } catch (findErr) {
        console.error('Error finding existing content:', findErr);
      }
      
      return res.status(409).json({ 
        message: 'Content with this externalId already exists',
        error: 'Duplicate externalId'
      });
    }
    
    res.status(500).json({ message: 'Error creating content', error: err.message });
  }
};

const putHeadlineNewsContentId = async (req, res) => {
  try {
    const updatedContent = await Content.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updatedContent) {
      return res.status(404).json({ message: 'Content not found' });
    }
    res.status(200).json(updatedContent);
  } catch (err) {
    res.status(500).json({ message: 'Error updating content', error: err.message });
  }
};

const deleteHeadlineNewsContentId = async (req, res) => {
  try {
    const deletedContent = await Content.findByIdAndDelete(req.params.id);
    if (!deletedContent) {
      return res.status(404).json({ message: 'Content not found' });
    }
    res.status(200).json({ message: 'Content deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting content', error: err.message });
  }
};

// Clean up old external content
const cleanupOldExternalContent = async (req, res) => {
  try {
    const { olderThan } = req.body;
    const cutoffDate = olderThan ? new Date(olderThan) : new Date(Date.now() - (6 * 60 * 60 * 1000)); // 6 hours ago
    
    const result = await Content.deleteMany({
      source: 'external',
      createdAt: { $lt: cutoffDate }
    });
    
    console.log(`🗑️ Cleaned up ${result.deletedCount} old external content items`);
    res.status(200).json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error('Error cleaning up external content:', err);
    res.status(500).json({ message: 'Error cleaning up external content', error: err.message });
  }
};

// Get duplicate external content for debugging
const getDuplicateExternalContent = async (req, res) => {
  try {
    console.log('🔍 Analyzing external content for duplicates...');
    
    const pipeline = [
      { $match: { source: 'external', externalId: { $exists: true } } },
      { 
        $group: {
          _id: '$externalId',
          count: { $sum: 1 },
          docs: { $push: { _id: '$_id', title: { $substr: ['$message', 0, 50] }, createdAt: '$createdAt' } }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ];
    
    const duplicates = await Content.aggregate(pipeline);
    
    console.log(`📊 Found ${duplicates.length} groups of duplicate external content`);
    res.status(200).json({
      duplicateGroups: duplicates.length,
      duplicates: duplicates
    });
  } catch (err) {
    console.error('Error analyzing duplicates:', err);
    res.status(500).json({ message: 'Error analyzing duplicates', error: err.message });
  }
};


const postHeadlineNewsContentAction = async (req, res) => {
  try {
    const { contentId, userId, action, location, platform } = req.body;
    
    const content = await Content.findById(contentId);
    if (!content) {
      console.log(`Content not found for id: ${contentId}`);
      return res.status(404).json({ message: 'Content not found' });
    }

    if (action === 'view' && !content.viewedBy.includes(userId)) {
      content.viewedBy.push(userId);
      await content.save();
    }

    let updatedContent;
    let newActiveButton = null;
    if (action === 'share') {
      const newInteraction = new Interaction({
        userId,
        contentId,
        interactionType: action,
        location,
        platform // Add this to store the sharing platform
      });
      await newInteraction.save();
      updatedContent = await updateContentMetrics(content, action, 1);
    } else
    {/* opening 'else' cause by share func*/ } 

    if (action === 'screenshot') {
      content.screenshotCount += 1;
      await content.save();
      
      return res.status(200).json({
        message: 'Screenshot count updated successfully',
        screenshotCount: content.screenshotCount
      });
    }
    
    {
    // Always create a new interaction for views
    if (action === 'view') {
      const newInteraction = new Interaction({
        userId,
        contentId,
        interactionType: action,
        location
      });
      await newInteraction.save();
      updatedContent = await updateContentMetrics(content, action, 1);
    } else if (action === 'like' || action === 'dislike') {
      // Check if the user has already interacted with this content
      let existingInteraction = await Interaction.findOne({ userId, contentId, interactionType: { $in: ['like', 'dislike'] } });

      if (existingInteraction) {
        if (existingInteraction.interactionType === action) {
          // User is undoing their previous action
          await Interaction.findByIdAndDelete(existingInteraction._id);
          updatedContent = await updateContentMetrics(content, action, -1);
        } else {
          // User is switching from like to dislike or vice versa
          const oldAction = existingInteraction.interactionType;
          existingInteraction.interactionType = action;
          await existingInteraction.save();
          updatedContent = await updateContentMetrics(content, action, 1, oldAction);
          newActiveButton = action;
        }
      } else {
        // This is a new interaction
        const newInteraction = new Interaction({
          userId,
          contentId,
          interactionType: action,
          location
        });
        await newInteraction.save();
        updatedContent = await updateContentMetrics(content, action, 1);
        newActiveButton = action;
      }
    } 

  }
  const existingInteraction = await Interaction.findOne({ 
    userId, 
    contentId, 
    interactionType: { $in: ['like', 'dislike'] },
    createdAt: { 
      $gt: new Date(Date.now() - 300) // Prevent interactions within 300ms
    }
  });
  
  if (existingInteraction) {
    return res.status(429).json({ message: 'Please wait before trying again' });
  } 
  
  {/* closing 'else' cause by share func*/ }

    // Emit socket event for real-time updates
    io.emit('updateContentInteractions', {
      contentId: updatedContent._id,
      likeCount: updatedContent.likeCount,
      dislikeCount: updatedContent.dislikeCount,
      shareCount: updatedContent.shareCount,
      screenshotCount: updatedContent.screenshotCount,
      viewCount: updatedContent.viewCount,
      activeButton: newActiveButton
    });

    res.status(200).json({
      message: 'Action recorded successfully',
      likeCount: updatedContent.likeCount,
      dislikeCount: updatedContent.dislikeCount,
      shareCount: updatedContent.shareCount,
      screenshotCount: updatedContent.screenshotCount,
      viewCount: updatedContent.viewCount,
      engagementScore: updatedContent.engagementScore,
      viralScore: updatedContent.viralScore,
      userInteractions: {
        [userId]: {
          activeButton: action === 'like' || action === 'dislike' ? action : null
        }
      }
    });
  } catch (err) {
    console.error('Error recording action:', err);
    res.status(500).json({ message: 'Error recording action', error: err.message });
  }
};


const updateContentMetrics = async (content, action, change, oldAction = null) => {
  // console.log(`Updating metrics for action: ${action}, change: ${change}, oldAction: ${oldAction}`);

  if (oldAction) {
    // If switching from like to dislike or vice versa, decrease the old count
    content[`${oldAction}Count`] = Math.max(0, content[`${oldAction}Count`] - 1);
  }

  switch(action) {
    case 'like':
    case 'dislike':
    case 'share':
    case 'screenshot':
    case 'view':
      content[`${action}Count`] = Math.max(0, (content[`${action}Count`] || 0) + change);
      break;
    default:
      console.warn(`Unhandled action type: ${action}`);
  }

  content.engagementScore = content.calculateEngagementScore();
  content.viralScore = content.calculateViralScore();

  // console.log(`Updated content: ${JSON.stringify(content)}`);

  return await content.save();
};



const getHeadlineNewsContentIdReaction = async (req, res) => {
  try {
    const content = await Content.findById(req.params.contentId);
    if (!content) {
      return res.status(404).json({ message: 'Content not found' });
    }
    res.status(200).json({
      likeCount: content.likeCount,
      dislikeCount: content.dislikeCount,
      viewCount: content.viewCount,
      shareCount: content.shareCount,
      screenshotCount: content.screenshotCount,
      engagementScore: content.engagementScore,
      viralScore: content.viralScore,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching reactions', error: err.message });
  }
};


const removeDuplicateExternalContent = async (req, res) => {
  try {
    console.log('🗑️ Starting duplicate removal process...');
    
    const pipeline = [
      { $match: { source: 'external', externalId: { $exists: true, $ne: null } } },
      { 
        $group: {
          _id: '$externalId',
          count: { $sum: 1 },
          docs: { 
            $push: { 
              _id: '$_id', 
              createdAt: '$createdAt',
              title: { $substr: ['$message', 0, 50] }
            } 
          }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ];
    
    const duplicateGroups = await Content.aggregate(pipeline);
    
    let totalRemoved = 0;
    
    for (const group of duplicateGroups) {
      // Sort by createdAt descending (newest first)
      const sortedDocs = group.docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Keep the first (newest), remove the rest
      const toRemove = sortedDocs.slice(1).map(doc => doc._id);
      
      if (toRemove.length > 0) {
        const result = await Content.deleteMany({ _id: { $in: toRemove } });
        totalRemoved += result.deletedCount;
        console.log(`🗑️ Removed ${result.deletedCount} duplicates for externalId: ${group._id}`);
      }
    }
    
    console.log(`✅ Duplicate removal completed. Total removed: ${totalRemoved}`);
    res.status(200).json({
      duplicateGroupsFound: duplicateGroups.length,
      totalRemoved: totalRemoved,
      message: `Successfully removed ${totalRemoved} duplicate external content items`
    });
  } catch (err) {
    console.error('❌ Error removing duplicates:', err);
    res.status(500).json({ message: 'Error removing duplicates', error: err.message });
  }
};

export {
  getHeadlineNewsContent,
  getHeadlineNewsContentId,
  getHeadlineNewsContentByChannel ,
  postHeadlineNewsContent,
  putHeadlineNewsContentId,
  deleteHeadlineNewsContentId,
  postHeadlineNewsContentAction,
  getHeadlineNewsContentIdReaction,
  getUserInteraction,
  checkContentExists ,
  checkExternalContentExists,
    cleanupOldExternalContent,
    getDuplicateExternalContent,
     removeDuplicateExternalContent
};


