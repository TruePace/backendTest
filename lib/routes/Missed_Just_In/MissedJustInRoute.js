import express from 'express'
import { getMissedJustInContent, markMissedContentAsViewed } from '../../Controllers/Missed_Just_In/MissedJustInController.js'

const router = express.Router()

router.get('/MissedJustIn/:userId', getMissedJustInContent);
router.post('/MissedJustIn/:userId/mark-viewed', markMissedContentAsViewed);

export default router