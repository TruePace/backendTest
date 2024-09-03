
import { Content } from "../../models/HeadlineNews/HeadlineModel.js";

const getJustInContent = async (req, res) => {
  try {
    const { currentChannelId } = req.query;
    let justInContent = await Content.find({
      isJustIn: true,
      justInExpiresAt: { $gt: new Date() }
    }).sort('-createdAt').limit(50);

    // Move current channel's content to the front
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
    const headlineContent = await Content.find({ isJustIn: false })
      .sort('-createdAt')
      .limit(100); // Increased limit to get more content
    res.status(200).json(headlineContent);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching Headline content', error: err.message });
  }
};
  
  const postNewContent = async (req, res) => {
    try {
      const newContent = new Content({
        ...req.body,
        isJustIn: true,
        justInExpiresAt: new Date(Date.now() + 3 * 60 * 1000) // 10 minutes from now
      });
      await newContent.save();
      res.status(201).json(newContent);
    } catch (err) {
      res.status(500).json({ message: 'Error creating new content', error: err.message });
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

  const updateHeadlineContent = async (req, res) => {
    try {
      const contentId = req.params.id;
      const updates = req.body;
  
      const updatedContent = await Content.findByIdAndUpdate(contentId, updates, { new: true });
  
      if (!updatedContent) {
        return res.status(404).json({ message: 'Content not found' });
      }
  
      res.status(200).json(updatedContent);
    } catch (err) {
      res.status(500).json({ message: 'Error updating content', error: err.message });
    }
  };
// Add a new function to update engagement score
  const updateEngagementScore = async (contentId) => {
    const content = await Content.findById(contentId);
    if (content) {
      content.engagementScore = content.calculateEngagementScore();
      await content.save();
    }
  };
  
  export { getJustInContent, getHeadlineContent, postNewContent ,updateEngagementScore,getHeadlineNewsContentId, updateHeadlineContent};