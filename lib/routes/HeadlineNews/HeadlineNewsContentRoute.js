import express from 'express'
import {getHeadlineNewsContent,
    getHeadlineNewsContentId,postHeadlineNewsContent,
    postHeadlineNewsContentAction,
    getHeadlineNewsContentIdReaction,
    putHeadlineNewsContentId,
    deleteHeadlineNewsContentId
} from '../../Controllers/HeadlineNews/HeadlineNewsContentController.js'

const router =express.Router();

router.get('/', getHeadlineNewsContent)
router.get('/:id',getHeadlineNewsContentId)
router.get('/:contentId/reactions',getHeadlineNewsContentIdReaction)
router.post('/',postHeadlineNewsContent)
router.post('/:action',postHeadlineNewsContentAction)
router.post('/action', postHeadlineNewsContentAction);
router.put('/:id',putHeadlineNewsContentId)
router.delete('/:id',deleteHeadlineNewsContentId)



export default router