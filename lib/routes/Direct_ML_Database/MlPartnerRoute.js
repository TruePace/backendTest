import express from 'express'
import { BeyondArticle,ArticleInteraction } from '../../models/Beyond_article/BeyondArticleModel.js'
import { BeyondVideo,BeyondVideoInteraction } from '../../models/Beyond_Video/BeyondVideoModel.js'
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';
import { User } from '../../models/HeadlineNews/HeadlineModel.js';

const router = express.Router();

// Helper function for stratified sampling
const stratifiedSample = async (Model, sampleSize, timeRanges) => {
  let result = [];
  for (let range of timeRanges) {
    const sample = await Model.aggregate([
      { $match: { createdAt: { $gte: range.start, $lt: range.end } } },
      { $sample: { size: Math.floor(sampleSize / timeRanges.length) } }
    ]);
    result = result.concat(sample);
  }
  return result;
};

// Define time ranges for stratified sampling
const timeRanges = [
  { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() }, // Last 30 days
  { start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), end: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30-90 days ago
  { start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), end: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // 90-365 days ago
];

router.get('/articles', async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const skip = (page - 1) * limit;

  try {
    const articles = await stratifiedSample(BeyondArticle, limit, timeRanges);
    const total = await BeyondArticle.countDocuments();

    res.json({
      articles,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/videos', async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const skip = (page - 1) * limit;

  try {
    const videos = await stratifiedSample(BeyondVideo, limit, timeRanges);
    const total = await BeyondVideo.countDocuments();

    res.json({
      videos,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/interactions', async (req, res) => {
    const { page = 1, limit = 100 } = req.query;
    const skip = (page - 1) * limit;
  
    try {
      const articleInteractions = await ArticleInteraction.find()
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit / 2);
  
      const videoInteractions = await BeyondVideoInteraction.find()
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit / 2);
  
      res.json({
        articleInteractions,
        videoInteractions
      });
    } catch (error) {
      console.error('Error fetching interactions:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

router.get('/user-data', async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const skip = (page - 1) * limit;

  try {
    const users = await User.aggregate([
      { $sample: { size: parseInt(limit) } },
      { $project: { uid: 1, email: 1, createdAt: 1, subscriptions: 1, interests: 1 } }
    ]);

    const total = await User.countDocuments();

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/user-interaction-data', async (req, res) => {
  const { page = 1, limit = 200 } = req.query;
  const skip = (page - 1) * limit;

  try {
    const users = await User.aggregate([
      { $sample: { size: parseInt(limit) } }
    ]);

    const userInteractionData = await Promise.all(users.map(async (user) => {
      const articleInteractions = await ArticleInteraction.find({ userId: user.uid })
        .sort({ timestamp: -1 })
        .limit(10);
      const videoInteractions = await BeyondVideoInteraction.find({ userId: user.uid })
        .sort({ timestamp: -1 })
        .limit(10);

      return {
        user: {
          uid: user.uid,
          email: user.email,
          createdAt: user.createdAt,
          subscriptions: user.subscriptions,
          interests: user.interests
        },
        articleInteractions,
        videoInteractions
      };
    }));

    const total = await User.countDocuments();

    res.json({
      userInteractionData,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching user interaction data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;