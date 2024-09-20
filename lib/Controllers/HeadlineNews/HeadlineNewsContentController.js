import { Content, Channel, Interaction ,User} from "../../models/HeadlineNews/HeadlineModel.js";
import { io } from "../../../server.js";

const getHeadlineNewsContent = async (req, res) => {
  try {
    const contents = await Content.find().sort('-createdAt').limit(100);
    res.status(200).json(contents);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching contents', error: err.message });
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

const postHeadlineNewsContent = async (req, res) => {
  try {
    const newContent = new Content(req.body);
    await newContent.save();
    res.status(201).json(newContent);
  } catch (err) {
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

const postHeadlineNewsContentAction = async (req, res) => {
  try {
    const { contentId, userId, action, location } = req.body;
    
    // console.log(`Received action request: contentId=${contentId}, userId=${userId}, action=${action}`);

    const content = await Content.findById(contentId);
    if (!content) {
      console.log(`Content not found for id: ${contentId}`);
      return res.status(404).json({ message: 'Content not found' });
    }

    // Check if the user has already interacted with this content
    let existingInteraction = await Interaction.findOne({ userId, contentId });

    let updatedContent;
    let newActiveButton = null;

    if (existingInteraction && (action === 'like' || action === 'dislike')) {
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
      // This is a new interaction or a non-like/dislike action
      if (!existingInteraction || (action !== 'like' && action !== 'dislike')) {
        const newInteraction = new Interaction({
          userId,
          contentId,
          interactionType: action,
          location
        });
        await newInteraction.save();
      }
      updatedContent = await updateContentMetrics(content, action, 1);
      if (action === 'like' || action === 'dislike') {
        newActiveButton = action;
      }
    }

    // console.log(`Updated content metrics: ${JSON.stringify(updatedContent)}`);

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
      activeButton: newActiveButton
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


export {
  getHeadlineNewsContent,
  getHeadlineNewsContentId,
  postHeadlineNewsContent,
  putHeadlineNewsContentId,
  deleteHeadlineNewsContentId,
  postHeadlineNewsContentAction,
  getHeadlineNewsContentIdReaction
};