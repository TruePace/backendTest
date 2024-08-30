import express from 'express';
import { postHeadlineNewsComment, getHeadlineNewsComments,likeComment } from '../Controllers/HeadlineNewsCommentController.js';

const router = express.Router();


router.get('/:contentId', (req, res, next) => {
  console.log(`GET request received for contentId: ${req.params.contentId}`);
  getHeadlineNewsComments(req, res, next);
});

router.post('/', (req, res, next) => {
  console.log('POST request received');
  console.log('Request body:', req.body);
  postHeadlineNewsComment(req, res, next);
});

router.post('/:commentId/like', likeComment);


export default router;