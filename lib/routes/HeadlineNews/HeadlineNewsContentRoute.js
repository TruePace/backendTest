// Updated HeadlineNewsContentRoute.js - Add content existence check route
import express from 'express'
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
    checkContentExists
} from '../../Controllers/HeadlineNews/HeadlineNewsContentController.js'

const router = express.Router();

router.get('/', getHeadlineNewsContent)
router.get('/check/:id', checkContentExists) // NEW: Add content existence check route
router.get('/:id', getHeadlineNewsContentId)
router.get('/:contentId/reactions', getHeadlineNewsContentIdReaction)
router.get('/channel/:channelId', getHeadlineNewsContentByChannel);
router.post('/', postHeadlineNewsContent)
router.post('/:action', postHeadlineNewsContentAction)
router.post('/action', postHeadlineNewsContentAction);
router.put('/:id', putHeadlineNewsContentId)
router.delete('/:id', deleteHeadlineNewsContentId)
router.get('/:contentId/userInteraction', getUserInteraction);

export default router