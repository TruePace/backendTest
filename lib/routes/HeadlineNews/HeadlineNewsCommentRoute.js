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

// Routes with selective authentication
router.get('/:contentId', verifyFirebaseToken, getHeadlineNewsComments);

// Comment count route - make it accessible without auth for initial load
router.get('/:contentId/count', (req, res, next) => {
    // Try with auth first, if fails, allow without auth
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        verifyFirebaseToken(req, res, (err) => {
            if (err) {
                // If auth fails, continue without user context
                req.user = null;
            }
            getCommentCount(req, res, next);
        });
    } else {
        // No auth provided, continue without user context
        req.user = null;
        getCommentCount(req, res, next);
    }
});

router.post('/', verifyFirebaseToken, (req, res, next) => {
    const username = req.body.username || req.user.displayName || req.user.email || 'Anonymous';
    req.body.username = username;
    postHeadlineNewsComment(req, res, next);
});

router.post('/:commentId/like', verifyFirebaseToken, (req, res, next) => {
    req.body.username = req.user.displayName || req.user.email || 'Anonymous';
    likeComment(req, res, next);
});

export default router;