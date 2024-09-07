import express from 'express'
import { verifyFirebaseToken } from '../../../Middlewares/AuthMiddleware.js';
import { getAllVideos,getVideoById,createVideo,postBeyondVideoComment,getBeyondVideoCommentCount,getBeyondVideoComments,likeBeyondVideoComment   } from '../../../Controllers/Beyond_Headline/Beyond_video/BeyondVideoController.js'


const router = express.Router();

// router.use(verifyFirebaseToken);

router.get('/', getAllVideos);
router.get('/:id', getVideoById);
router.post('/',verifyFirebaseToken, createVideo);
router.get('/:videoId/comments',verifyFirebaseToken, getBeyondVideoComments);
router.get('/:videoId/count',verifyFirebaseToken, getBeyondVideoCommentCount);
router.post('/comment',verifyFirebaseToken, postBeyondVideoComment);
router.post('/:videoId/like',verifyFirebaseToken ,likeBeyondVideoComment);




// Add more routes as needed

export default router;