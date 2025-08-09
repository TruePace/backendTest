// Fixed HeadlineNewsContentRoute.js - Correct route order
import express from 'express'
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js'; // Add this import
import {
    getHeadlineNewsContent,
    getHeadlineNewsContentId,
    postHeadlineNewsContent,
    postHeadlineNewsContentAction,
    getHeadlineNewsContentIdReaction,
    putHeadlineNewsContentId,
    deleteHeadlineNewsContentId,
    getHeadlineNewsContentByChannel,
    getUserInteraction,
    checkContentExists,
    checkExternalContentExists,
    cleanupOldExternalContent,
    getDuplicateExternalContent
} from '../../Controllers/HeadlineNews/HeadlineNewsContentController.js'

const router = express.Router();

// ✅ SPECIFIC ROUTES FIRST (before generic /:id)
router.get('/check/:id', checkContentExists) // Check by MongoDB _id
router.get('/check-external/:externalId', checkExternalContentExists) // Check by externalId
router.get('/duplicates/analyze', getDuplicateExternalContent);
router.get('/channel/:channelId', getHeadlineNewsContentByChannel);

// ✅ PROTECTED ROUTES (require authentication)
router.get('/:contentId/userInteraction', verifyFirebaseToken, getUserInteraction);
router.get('/:contentId/reactions', getHeadlineNewsContentIdReaction);

// ✅ GENERIC ROUTES LAST
router.get('/', getHeadlineNewsContent)
router.get('/:id', getHeadlineNewsContentId) // This should be near the end

// ✅ POST/PUT/DELETE ROUTES
router.post('/', postHeadlineNewsContent)
router.post('/action', postHeadlineNewsContentAction);
router.put('/:id', putHeadlineNewsContentId)
router.delete('/:id', deleteHeadlineNewsContentId)
router.delete('/cleanup-external', cleanupOldExternalContent)

export default router