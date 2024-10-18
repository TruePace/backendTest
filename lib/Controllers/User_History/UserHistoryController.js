import { UserHistory } from "../../models/UserHistory/UserHistoryModel.js";
import { BeyondVideo } from "../../models/Beyond_Video/BeyondVideoModel.js";
import { BeyondArticle } from "../../models/Beyond_article/BeyondArticleModel.js";

export const getUserHistory = async (req, res) => {
  try {
    const { uid } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const history = await UserHistory.find({ userId: uid })
      .sort({ viewedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const populatedHistory = await Promise.all(history.map(async (item) => {
      if (item.contentType === 'video') {
        const video = await BeyondVideo.findById(item.contentId)
          .select('title thumbnailUrl')
          .populate('channelId', 'name picture')
          .lean();
        return { ...item, video };
      } else if (item.contentType === 'article') {
        const article = await BeyondArticle.findById(item.contentId)
          .select('title previewImage')
          .populate('channelId', 'name picture')
          .lean();
        return { ...item, article };
      }
      return item;
    }));

    const totalCount = await UserHistory.countDocuments({ userId: uid });
    const hasMore = totalCount > skip + history.length;

    res.json({ history: populatedHistory, hasMore });
  } catch (error) {
    console.error('Error in getUserHistory:', error);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
};
export const addToHistory = async (userId, contentId, contentType, duration) => {
  try {
    const historyEntry = await UserHistory.findOneAndUpdate(
      { userId, contentId, contentType },
      {
        $set: {
          userId,
          contentId,
          contentType,
          duration: duration || 0
        },
        $setOnInsert: { viewedAt: new Date() }
      },
      { upsert: true, new: true }
    );

    return historyEntry;
  } catch (error) {
    console.error('Error adding to history:', error);
    throw error;
  }
};

export const addToHistoryHandler = async (req, res) => {
  try {
    const { uid } = req.user;
    const { contentId, contentType, duration } = req.body;
    const historyEntry = await addToHistory(uid, contentId, contentType, duration);
    res.status(200).json(historyEntry);
  } catch (error) {
    console.error('Error adding to history:', error);
    res.status(500).json({ message: 'Error adding to history' });
  }
};
  
  export const clearHistory = async (req, res) => {
    try {
      const { uid } = req.user;
      await UserHistory.deleteMany({ userId: uid });
      res.json({ message: 'History cleared successfully' });
    } catch (error) {
      console.error('Error clearing history:', error);
      res.status(500).json({ message: error.message });
    }
  };
  
  export const removeFromHistory = async (req, res) => {
    try {
      const { uid } = req.user;
      const { historyId } = req.params;
      await UserHistory.findOneAndDelete({ _id: historyId, userId: uid });
      res.json({ message: 'Item removed from history' });
    } catch (error) {
      console.error('Error removing item from history:', error);
      res.status(500).json({ message: error.message });
    }
  };