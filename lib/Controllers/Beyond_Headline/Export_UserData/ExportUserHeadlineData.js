import { User,Content,Interaction,Comment } from "../../../models/HeadlineNews/HeadlineModel.js";

export const exportUserData = async (req, res) => {
    try {
      // Fetch user data
      const users = await User.find({}, '-_id uid email displayName interests lastActive deviceInfo location');
  
      // Fetch interactions
      const interactions = await Interaction.find({}, '-_id userId contentId interactionType timestamp duration deviceInfo');
  
      // Fetch content data
      const contents = await Content.find({}, '-_id _id message tags createdAt viewCount likeCount dislikeCount commentCount shareCount screenshotCount');
  
      // Fetch comments
      const comments = await Comment.find({}, '-_id userId contentId text createdAt likes');
  
      // Combine all data
      const exportData = {
        users,
        interactions,
        contents,
        comments
      };
  
      res.json(exportData);
    } catch (error) {
      console.error('Error exporting data:', error);
      res.status(500).json({ message: 'Error exporting data', error: error.message });
    }
  };