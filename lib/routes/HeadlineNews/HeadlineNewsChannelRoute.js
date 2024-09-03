import express from 'express'
import {getHeadlineNewsChannel,
    putHeadlineNewsChannelId,deleteHeadlineNewsChannelId,
    getHeadlineNewsChannelId,postHeadlineNewsChannel,subscribeToChannel,unsubscribeFromChannel
} from '../../Controllers/HeadlineNews/HeadlineNewsChannelController.js'

const router =express.Router();

router.get('/', getHeadlineNewsChannel)
router.get('/:id',getHeadlineNewsChannelId)
router.post('/',postHeadlineNewsChannel)
router.put('/:id',putHeadlineNewsChannelId)
router.delete('/:id',deleteHeadlineNewsChannelId)
router.post('/:id/subscribe', subscribeToChannel);
router.post('/:id/unsubscribe', unsubscribeFromChannel);

export default router