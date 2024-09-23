import express from 'express'
import { getMissedJustInContent } from '../../Controllers/Missed_Just_In/MissedJustInController.js'

const router= express.Router()

router.get('/MissedJustIn/:userId', getMissedJustInContent);


export default router