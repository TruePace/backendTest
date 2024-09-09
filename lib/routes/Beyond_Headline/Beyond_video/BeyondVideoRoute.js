import express from 'express';
import { verifyFirebaseToken } from '../../../Middlewares/AuthMiddleware.js';
import {
  getAllVideos,
  getVideoById,
  createVideo,
  postBeyondVideoComment,
  getBeyondVideoCommentCount,
  getBeyondVideoComments,
  likeBeyondVideoComment,
  likeVideo,viewVideo
} from '../../../Controllers/Beyond_Headline/Beyond_video/BeyondVideoController.js';

const router = express.Router();

router.get('/', getAllVideos);
router.get('/:id', getVideoById);
router.post('/', verifyFirebaseToken, createVideo);
router.get('/:videoId/comments', verifyFirebaseToken, getBeyondVideoComments);
router.get('/:videoId/count', verifyFirebaseToken, getBeyondVideoCommentCount);
router.post('/:videoId/comment', verifyFirebaseToken, postBeyondVideoComment);
router.post('/:commentId/like', verifyFirebaseToken, likeBeyondVideoComment);
router.post('/:videoId/like', verifyFirebaseToken, likeVideo);
router.post('/:videoId/view', verifyFirebaseToken, viewVideo);


export default router;