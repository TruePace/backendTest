// Updated HeadlineNewsContentRoute.js - Add cleanup route
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
    checkContentExists,
    checkExternalContentExists,
    cleanupOldExternalContent ,getDuplicateExternalContent
} from '../../Controllers/HeadlineNews/HeadlineNewsContentController.js'

const router = express.Router();

router.get('/', getHeadlineNewsContent)
router.get('/check/:id', checkContentExists) // Check by MongoDB _id
router.get('/check-external/:externalId', checkExternalContentExists) // Check by externalId
router.delete('/cleanup-external', cleanupOldExternalContent) // Add cleanup route
router.get('/:id', getHeadlineNewsContentId)
router.get('/:contentId/reactions', getHeadlineNewsContentIdReaction)
router.get('/channel/:channelId', getHeadlineNewsContentByChannel);
router.get('/duplicates/analyze', getDuplicateExternalContent);
router.post('/', postHeadlineNewsContent)
router.post('/:action', postHeadlineNewsContentAction)
router.post('/action', postHeadlineNewsContentAction);
router.put('/:id', putHeadlineNewsContentId)
router.delete('/:id', deleteHeadlineNewsContentId)
router.get('/:contentId/userInteraction', getUserInteraction);

export default router