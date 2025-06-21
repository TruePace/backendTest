// HeadlineNewsJustInController.js - Updated to handle different expiration logic and pagination
import { Content, Channel } from "../../models/HeadlineNews/HeadlineModel.js";

const getJustInContent = async (req, res) => {
  try {
    const { currentChannelId } = req.query;
    const now = new Date();

    // Update expired content (applies to both internal and external)
    await Content.updateMany(
      { isJustIn: true, justInExpiresAt: { $lte: now } },
      { $set: { isJustIn: false } }
    );

    let justInContent = await Content.find({
      isJustIn: true,
      justInExpiresAt: { $gt: now }
    }).sort('-createdAt').limit(50);

    if (currentChannelId) {
      justInContent.sort((a, b) => {
        if (a.channelId.toString() === currentChannelId) return -1;
        if (b.channelId.toString() === currentChannelId) return 1;
        return 0;
      });
    }

    res.status(200).json(justInContent);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching Just In content', error: err.message });
  }
};

// HeadlineNewsJustInController.js - Remove artificial limits
const getHeadlineContent = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100; // Increased from 20 to 100
    const skip = (page - 1) * limit;
    const now = new Date();

    // Clean up expired content based on source type
    await Content.deleteMany({
      source: { $ne: 'external' },
      headlineExpiresAt: { $lte: now }
    });

    await Content.deleteMany({
      source: 'external',
      headlineExpiresAt: { $lte: now }
    });

    const headlineContent = await Content.find({
      $and: [
        {
          $or: [
            { isJustIn: false },
            { justInExpiresAt: { $lte: now } }
          ]
        },
        {
          headlineExpiresAt: { $gt: now }
        }
      ]
    })
      .sort('-createdAt')
      .skip(skip)
      .limit(limit);

    console.log(`📊 Headline content query results:`, {
      page,
      limit,
      skip,
      totalFound: headlineContent.length,
      externalCount: headlineContent.filter(c => c.source === 'external').length,
      internalCount: headlineContent.filter(c => c.source !== 'external').length
    });

    res.status(200).json(headlineContent);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching Headline content', error: err.message });
  }
};

const postNewContent = async (req, res) => {
  try {
    const now = new Date();
    const isExternal = req.body.source === 'external';
    
    // Different expiration logic for internal vs external content
    let headlineExpiresAt;
    
    if (isExternal) {
      // External news: 48 hours from published date
      const publishedAt = req.body.uploadedAt ? new Date(req.body.uploadedAt) : now;
      headlineExpiresAt = new Date(publishedAt.getTime() + (48 * 60 * 60 * 1000));
    } else {
      // Internal news: 24 hours (end of current day)
      headlineExpiresAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }

    const newContent = new Content({
      ...req.body,
      isJustIn: true,
      justInExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes for both
      headlineExpiresAt: headlineExpiresAt,
      uploadedAt: req.body.uploadedAt || now,
      source: req.body.source || 'internal'
    });

    await newContent.save();

    // Update channel statistics
    const channel = await Channel.findById(newContent.channelId);
    if (channel) {
      channel.totalViews += 1;
      const allContent = await Content.find({ channelId: channel._id });
      const totalEngagement = allContent.reduce((sum, content) => sum + content.engagementScore, 0);
      channel.avgEngagementRate = totalEngagement / allContent.length;
      await channel.save();
    }

    const contentType = isExternal ? 'external' : 'internal';
    const duration = isExternal ? '48 hours' : '24 hours';
    console.log(`Created ${contentType} content with ${duration} headline duration`);

    res.status(201).json(newContent);
  } catch (err) {
    res.status(500).json({ message: 'Error creating new content', error: err.message });
  }
};

const updateHeadlineContent = async (req, res) => {
  try {
    const contentId = req.params.id;
    const updates = req.body;

    const updatedContent = await Content.findByIdAndUpdate(contentId, updates, { new: true });

    if (!updatedContent) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Recalculate engagement and viral scores
    updatedContent.engagementScore = updatedContent.calculateEngagementScore();
    updatedContent.viralScore = updatedContent.calculateViralScore();
    await updatedContent.save();

    res.status(200).json(updatedContent);
  } catch (err) {
    res.status(500).json({ message: 'Error updating content', error: err.message });
  }
};

export { getJustInContent, getHeadlineContent, postNewContent, updateHeadlineContent };