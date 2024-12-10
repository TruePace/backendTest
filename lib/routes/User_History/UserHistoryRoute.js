import express from 'express';
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';
import {
  getUserHistory,
  clearHistory,
  removeFromHistory,
  addToHandler,
} from '../../Controllers/User_History/UserHistoryController.js';

const router = express.Router();

router.get('/', verifyFirebaseToken, getUserHistory);
router.post('/add', verifyFirebaseToken, addToHandler); 
router.delete('/clear', verifyFirebaseToken, clearHistory);
router.delete('/:historyId', verifyFirebaseToken, removeFromHistory);

export default router;