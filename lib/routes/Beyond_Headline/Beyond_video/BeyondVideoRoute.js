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
router.get('/:videoId/comments', verifyFirebaseToken, getBeyondVideoComments);
router.get('/:videoId/count', verifyFirebaseToken, getBeyondVideoCommentCount);
router.post('/', verifyFirebaseToken, createVideo);
router.post('/:videoId/comment', verifyFirebaseToken, postBeyondVideoComment);
router.post('/:videoId/likevideo', verifyFirebaseToken, (req, res, next) => {
  console.log(`Received like request for video: ${req.params.videoId}`);
  next();
}, likeVideo);
router.post('/:videoId/view', verifyFirebaseToken, viewVideo);

router.post('/:commentId/likecomment', verifyFirebaseToken, likeBeyondVideoComment);





export default router;