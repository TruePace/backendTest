import { Content, Channel } from "../../models/HeadlineNews/HeadlineModel.js";


const getJustInContent = async (req, res) => {
  try {
    const { currentChannelId } = req.query;
    const now = new Date();

    // Update expired content
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

const getHeadlineContent = async (req, res) => {
  try {
    const headlineContent = await Content.find({ 
      $or: [
        { isJustIn: false },
        { justInExpiresAt: { $lte: new Date() } }
      ]
    })
      .sort('-createdAt')
      .limit(100);
    res.status(200).json(headlineContent);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching Headline content', error: err.message });
  }
};


const postNewContent = async (req, res) => {
   try {
    const now = new Date();
    const headlineExpiresAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const newContent = new Content({
      ...req.body,
      isJustIn: true,
      justInExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      headlineExpiresAt: headlineExpiresAt,
      uploadedAt: now
    });

    await newContent.save();

    // Update channel's totalViews and avgEngagementRate
    const channel = await Channel.findById(newContent.channelId);
    if (channel) {
      channel.totalViews += 1;
      const allContent = await Content.find({ channelId: channel._id });
      const totalEngagement = allContent.reduce((sum, content) => sum + content.engagementScore, 0);
      channel.avgEngagementRate = totalEngagement / allContent.length;
      await channel.save();
    }

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