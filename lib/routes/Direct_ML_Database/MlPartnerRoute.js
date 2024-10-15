import express from 'express'
import { BeyondArticle,ArticleInteraction } from '../../models/Beyond_article/BeyondArticleModel.js'
import { BeyondVideo,BeyondVideoInteraction } from '../../models/Beyond_Video/BeyondVideoModel.js'
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';

const router = express.Router();

router.get('/recent-articles', async (req, res) => {
  const recentArticles = await BeyondArticle.find()
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(recentArticles);
});

router.get('/recent-videos', async (req, res) => {
  const recentVideos = await BeyondVideo.find()
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(recentVideos);
});

router.get('/recent-interactions', async (req, res) => {
  const recentArticleInteractions = await ArticleInteraction.find()
    .sort({ timestamp: -1 })
    .limit(100);
  const recentVideoInteractions = await BeyondVideoInteraction.find()
    .sort({ timestamp: -1 })
    .limit(100);
  res.json({ articleInteractions: recentArticleInteractions, videoInteractions: recentVideoInteractions });
});

export default router;