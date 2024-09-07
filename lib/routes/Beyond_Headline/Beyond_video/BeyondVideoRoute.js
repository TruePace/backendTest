import express from 'express'
import { getAllVideos,getVideoById,createVideo   } from '../../../Controllers/Beyond_Headline/Beyond_video/BeyondVideoController.js'


const router = express.Router();

router.get('/', getAllVideos);
router.get('/:id', getVideoById);
router.post('/', createVideo);


// Add more routes as needed

export default router;