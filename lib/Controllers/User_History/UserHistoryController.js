import { UserHistory } from "../../models/UserHistory/UserHistoryModel.js";
import { BeyondVideo } from "../../models/Beyond_Video/BeyondVideoModel.js";
import { BeyondArticle } from "../../models/Beyond_article/BeyondArticleModel.js";

export const getUserHistory = async (req, res) => {
  try {
    const { uid } = req.user;
    const history = await UserHistory.find({ userId: uid })
      .sort({ viewedAt: -1 })
      .lean();

    console.log('Raw history:', history);

    const populatedHistory = await Promise.all(history.map(async (item) => {
      console.log(`Processing item: ${item._id}, contentType: ${item.contentType}, contentId: ${item.contentId}`);
      
      if (item.contentType === 'video') {
        const video = await BeyondVideo.findById(item.contentId)
          .select('title thumbnailUrl')
          .populate('channelId', 'name picture')
          .lean();
        console.log('Found video:', video);
        return { ...item, video };
      } else if (item.contentType === 'article') {
        const article = await BeyondArticle.findById(item.contentId)
          .select('title previewImage')
          .populate('channelId', 'name picture')
          .lean();
        console.log('Found article:', article);
        return { ...item, article };
      }
      return item;
    }));

    console.log('Populated history:', populatedHistory);

    res.json(populatedHistory);
  } catch (error) {
    console.error('Error in getUserHistory:', error);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
};
  export const addToHistory = async (req, res) => {
    try {
      const { uid } = req.user;
      const { contentId, contentType, duration } = req.body;
  
      const historyEntry = await UserHistory.findOneAndUpdate(
        { userId: uid, contentId, contentType },
        { 
          $set: { 
            userId: uid, 
            contentId, 
            contentType,
            duration: duration || 0
          },
          $setOnInsert: { viewedAt: new Date() }
        },
        { upsert: true, new: true }
      );
  
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