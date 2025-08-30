import { Content, Channel } from "../../models/HeadlineNews/HeadlineModel.js";

const getMissedJustInContent = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const missedContent = await Content.find({
      isJustIn: false,
      justInExpiresAt: { $lte: new Date(), $gte: fifteenMinutesAgo },
      viewedBy: { $ne: userId }
    })
    .populate('channelId', 'name picture subscriberCount')
    .skip(skip)
    .limit(limit);

    const formattedContent = missedContent.map(content => ({
      _id: content._id,
      message: content.message,
      picture: content.picture,
      channelName: content.channelId.name,
      channelPicture: content.channelId.picture,
      channelId: content.channelId._id,
      subscriberCount: content.channelId.subscriberCount,
      createdAt: content.createdAt
    }));

    const totalCount = await Content.countDocuments({
      isJustIn: false,
      justInExpiresAt: { $lte: new Date(), $gte: fifteenMinutesAgo },
      viewedBy: { $ne: userId }
    });

    const hasMore = totalCount > skip + missedContent.length;

    res.status(200).json({ content: formattedContent, hasMore });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching missed Just In content', error: err.message });
  }
};

const markMissedContentAsViewed = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Update all missed content to mark as viewed by this user
    const result = await Content.updateMany(
      {
        isJustIn: false,
        justInExpiresAt: { $lte: new Date(), $gte: fifteenMinutesAgo },
        viewedBy: { $ne: userId }
      },
      {
        $addToSet: { viewedBy: userId } // Add userId to viewedBy array if not already present
      }
    );

    res.status(200).json({ 
      message: 'Missed content marked as viewed',
      updatedCount: result.modifiedCount 
    });
  } catch (err) {
    res.status(500).json({ 
      message: 'Error marking content as viewed', 
      error: err.message 
    });
  }
};

export { getMissedJustInContent, markMissedContentAsViewed };