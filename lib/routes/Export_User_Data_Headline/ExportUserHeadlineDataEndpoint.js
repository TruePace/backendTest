import express from 'express';
import rateLimit from 'express-rate-limit'
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';
import { User,Content,Interaction,Comment } from '../../models/HeadlineNews/HeadlineModel.js';

const router = express.Router();

const exportLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 2 // limit each IP to 2 requests per day
  });

// Paginated export function
export const exportUserData = async (page = 1, limit = 200) => {
  const skip = (page - 1) * limit;
  
  try {
    const [users, interactions, contents, comments] = await Promise.all([
      User.find({}, '-_id uid email displayName interests lastActive deviceInfo location')
        .skip(skip)
        .limit(limit)
        .lean(),
      Interaction.find({}, '-_id userId contentId interactionType timestamp duration deviceInfo')
        .skip(skip)
        .limit(limit)
        .lean(),
      Content.find({}, '-_id _id message tags createdAt viewCount likeCount dislikeCount commentCount shareCount screenshotCount')
        .skip(skip)
        .limit(limit)
        .lean(),
      Comment.find({}, '-_id userId contentId text createdAt likes')
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const [totalUsers, totalInteractions, totalContents, totalComments] = await Promise.all([
      User.countDocuments(),
      Interaction.countDocuments(),
      Content.countDocuments(),
      Comment.countDocuments()
    ]);

    return {
      data: { users, interactions, contents, comments },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(Math.max(totalUsers, totalInteractions, totalContents, totalComments) / limit),
        totalItems: {
          users: totalUsers,
          interactions: totalInteractions,
          contents: totalContents,
          comments: totalComments
        }
      }
    };
  } catch (error) {
    console.error('Error exporting data:', error);
    throw error;
  }
};

// Endpoint with pagination
router.get('/export', verifyFirebaseToken, exportLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    
    const data = await exportUserData(page, limit);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Error exporting data', error: error.message });
  }
});

export default router;