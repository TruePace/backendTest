import express from 'express';
import { verifyFirebaseToken } from '../../../Middlewares/AuthMiddleware.js';
import {
  getAllArticles,
  getArticleById,
  createArticle,
  postBeyondArticleComment,
  getBeyondArticleCommentCount,
  getBeyondArticleComments,
  likeBeyondArticleComment,
  likeArticle,
  viewArticle,getRecommendations
} from '../../../Controllers/Beyond_Headline/Beyond_article/BeyondArticleController.js';

const router = express.Router();

router.get('/', getAllArticles);
router.get('/:id', getArticleById);
router.get('/:articleId/comments', verifyFirebaseToken, getBeyondArticleComments);
router.get('/:articleId/count', verifyFirebaseToken, getBeyondArticleCommentCount);
router.post('/',  createArticle);
router.post('/:articleId/comment', verifyFirebaseToken, postBeyondArticleComment);
router.post('/:articleId/like', verifyFirebaseToken, likeArticle);
router.post('/:articleId/view', verifyFirebaseToken, viewArticle);
router.post('/:commentId/likecomment', verifyFirebaseToken, likeBeyondArticleComment);
router.get('/recommendations', verifyFirebaseToken, getRecommendations);

export default router;
