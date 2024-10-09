import express from 'express';
// import rateLimit from 'express-rate-limit';
// import { exportMiddleware, handleExportRequest } from './ExportService.js';
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';
import path from 'path';
import fs from 'fs';
import { EXPORT_CONFIG } from './ExportConfig.js';
import { ExportService } from './ExportService.js';

const router = express.Router();

// Modify the export request handler to be more efficient
router.post('/', verifyFirebaseToken, async (req, res) => {
  const exportId = Date.now().toString();
  res.json({
    success: true,
    message: 'Export started',
    exportId: exportId
  });

  // Start the export process in the background
  ExportService.exportData()
    .then(files => {
      console.log('Export completed:', files);
    })
    .catch(error => {
      console.error('Export failed:', error);
    });
});

// Add a new route to get a list of available export files
router.get('/files', verifyFirebaseToken, (req, res) => {
  const exportPath = EXPORT_CONFIG.EXPORT_DIRECTORY;
  
  fs.readdir(exportPath, (err, files) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Failed to read export directory',
        error: err.message
      });
    }

    const exportFiles = files.map(file => ({
      filename: file,
      path: `/api/export/download/${file}`,
      type: file.startsWith('video_') ? 'video' :
            file.startsWith('article_') ? 'article' :
            file.startsWith('user_') ? 'user' : 'unknown'
    }));

    res.json({
      success: true,
      files: exportFiles
    });
  });
});

// Add a route to download specific export files
router.get('/download/:filename', verifyFirebaseToken, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(EXPORT_CONFIG.EXPORT_DIRECTORY, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  res.download(filePath);
});

export default router;