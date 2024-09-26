import { Content, Channel } from "../../models/HeadlineNews/HeadlineModel.js";

const getMissedJustInContent = async (req, res) => {
  try {
    const { userId } = req.params;
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const missedContent = await Content.find({
      isJustIn: false,
      justInExpiresAt: { $lte: new Date(), $gte: fifteenMinutesAgo },
      viewedBy: { $ne: userId }
    }).populate('channelId', 'name picture subscriberCount');

    const formattedContent = missedContent.map(content => ({
      _id: content._id,
      message: content.message,
      picture: content.picture, // Include the content picture
      channelName: content.channelId.name,
      channelPicture: content.channelId.picture,
      channelId: content.channelId._id,
      subscriberCount: content.channelId.subscriberCount,
      createdAt: content.createdAt
    }));

    res.status(200).json(formattedContent);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching missed Just In content', error: err.message });
  }
};

export { getMissedJustInContent };