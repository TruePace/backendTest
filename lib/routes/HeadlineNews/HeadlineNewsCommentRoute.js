import express from 'express';
import admin from 'firebase-admin';
import { 
  postHeadlineNewsComment, 
  getHeadlineNewsComments, 
  likeComment,
  getCommentCount 
} from '../../Controllers/HeadlineNews/HeadlineNewsCommentController.js';

const router = express.Router();

// Middleware to verify Firebase token
export const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('No token provided');
        return res.status(401).json({ message: 'No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        console.log('Token verified for user:', decodedToken.uid);
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        res.status(403).json({ message: 'Invalid token' });
    }
};

// Apply Firebase authentication middleware to all routes
router.use(verifyFirebaseToken);

router.get('/:contentId', getHeadlineNewsComments);

// New route for getting comment count
router.get('/:contentId/count', getCommentCount);

router.post('/', verifyFirebaseToken, (req, res, next) => {
  // Use the username from the request body
  const username = req.body.username || req.user.displayName || req.user.email || 'Anonymous';
  req.body.username = username;
  postHeadlineNewsComment(req, res, next);
});
router.post('/:commentId/like', (req, res, next) => {
  // Set username from authenticated user, prioritizing displayName
  req.body.username = req.user.displayName || req.user.email || 'Anonymous';
  likeComment(req, res, next);
});

export default router;