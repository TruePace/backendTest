import express from 'express';
import admin from 'firebase-admin';
import { postHeadlineNewsComment, getHeadlineNewsComments, likeComment } from '../Controllers/HeadlineNewsCommentController.js';

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

router.post('/', (req, res, next) => {
  // Set username from authenticated user
  req.body.username = req.user.name || req.user.email || 'Anonymous';
  postHeadlineNewsComment(req, res, next);
});

router.post('/:commentId/like', (req, res, next) => {
  // Set username from authenticated user
  req.body.username = req.user.name || req.user.email || 'Anonymous';
  likeComment(req, res, next);
});

export default router;