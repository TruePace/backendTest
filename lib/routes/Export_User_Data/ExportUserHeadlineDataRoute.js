import express from 'express';
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';
import { exportUserData } from '../../Controllers/Beyond_Headline/Export_UserData/ExportUserHeadlineData.js';

const router = express.Router();

// Secure the endpoint with Firebase authentication
router.get('/export', verifyFirebaseToken, exportUserData);

export default router;