import express from 'express';
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';
import {
  getUserHistory,
  addToHistory,
  clearHistory,
  removeFromHistory,
  addToHistoryHandler,
}  from '../../Controllers/User_History/UserHistoryController.js';

const router = express.Router();

router.get('/', verifyFirebaseToken, getUserHistory);
router.post('/add', verifyFirebaseToken, addToHistory);
router.post('/add', verifyFirebaseToken, addToHistoryHandler);
router.delete('/clear', verifyFirebaseToken, clearHistory);
router.delete('/:historyId', verifyFirebaseToken, removeFromHistory);

export default router;