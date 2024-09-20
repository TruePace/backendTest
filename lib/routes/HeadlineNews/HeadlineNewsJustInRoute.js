import express from 'express';
import { getJustInContent, getHeadlineContent, postNewContent,updateHeadlineContent } from '../../Controllers/HeadlineNews/HeadlineNewsJustInController.js'
const router = express.Router();

router.get('/just-in', getJustInContent);
router.get('/headline', getHeadlineContent);
router.post('/', postNewContent);
// Route for getting content by ID
// router.get('/headline/:id', getHeadlineNewsContentId);
router.put('/headline/:id', updateHeadlineContent)

// / Update engagement score
router.put('/:contentId/engagement', async (req, res) => {
  try {
    await updateEngagementScore(req.params.contentId);
    res.status(200).json({ message: 'Engagement score updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating engagement score', error: err.message });
  }
});
           
export default router;