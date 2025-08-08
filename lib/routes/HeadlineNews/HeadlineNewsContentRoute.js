// Updated HeadlineNewsContentRoute.js with proper order and new endpoints
import express from 'express';
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';
import {
    getHeadlineNewsContent,
    getHeadlineNewsContentId,
    postHeadlineNewsContent,
    putHeadlineNewsContentId,
    deleteHeadlineNewsContentId,
    getHeadlineNewsContentByChannel,
    getUserInteraction,
    checkContentExists,
    checkExternalContentExists,
    cleanupOldExternalContent,
    getDuplicateExternalContent,
    removeDuplicateExternalContent // NEW
} from '../../Controllers/HeadlineNews/HeadlineNewsContentController.js';

const router = express.Router();

// ✅ ADMIN/MAINTENANCE ROUTES (most specific first)
router.get('/admin/duplicates/analyze', getDuplicateExternalContent);
router.delete('/admin/duplicates/remove', removeDuplicateExternalContent);  // NEW
router.delete('/admin/cleanup-external', cleanupOldExternalContent);

// ✅ CHECK ROUTES (specific patterns)
router.get('/check/external/:externalId', checkExternalContentExists);
router.get('/check/:id', checkContentExists);

// ✅ CHANNEL ROUTES
router.get('/channel/:channelId', getHeadlineNewsContentByChannel);

// ✅ PROTECTED ROUTES (require authentication)
router.get('/:contentId/userInteraction', verifyFirebaseToken, getUserInteraction);

// ✅ GENERIC ROUTES (broader patterns last)
router.get('/', getHeadlineNewsContent);
router.get('/:id', getHeadlineNewsContentId);

// ✅ POST/PUT/DELETE ROUTES
router.post('/', postHeadlineNewsContent);
router.put('/:id', putHeadlineNewsContentId);
router.delete('/:id', deleteHeadlineNewsContentId);

export default router;