
import { verifyFirebaseToken } from '../../Middlewares/AuthMiddleware.js';
import { BeyondVideoInteraction } from '../../models/Beyond_Video/BeyondVideoModel.js';
import { FileUtils } from './FileUtils.js';
import { ArticleInteraction } from '../../models/Beyond_article/BeyondArticleModel.js';
import { User } from '../../models/HeadlineNews/HeadlineModel.js';
import { EXPORT_CONFIG } from './ExportConfig.js';


export class ExportService {
  static async initializeExportService() {
    await FileUtils.ensureDirectories();
    await FileUtils.cleanupOldExports();
  }

  static async exportData(options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');
    const chunkFiles = {
      video: [],
      article: [],
      user: []
    };

    // Export video interactions with pagination
    let videoPage = 0;
    while (true) {
      const videoInteractions = await BeyondVideoInteraction.find()
        .populate('videoId', 'title tags')
        .skip(videoPage * EXPORT_CONFIG.CHUNK_SIZE)
        .limit(EXPORT_CONFIG.CHUNK_SIZE)
        .lean();

      if (videoInteractions.length === 0) break;

      const formattedVideoData = videoInteractions.map(interaction => ({
        userId: interaction.userId,
        videoTitle: interaction.videoId?.title || 'Unknown',
        interactionType: interaction.interactionType,
        timestamp: interaction.timestamp,
        watchDuration: interaction.watchDuration || 0,
        tags: interaction.videoId?.tags?.join('|') || '',
        deviceInfo: interaction.deviceInfo,
        location: interaction.location
      }));

      const chunkFile = await FileUtils.writeChunkToFile(
        formattedVideoData,
        `${EXPORT_CONFIG.FILE_PREFIX.VIDEO}${timestamp}_${videoPage}.json`
      );
      chunkFiles.video.push(chunkFile);
      videoPage++;
    }

    // Similar pagination for article interactions
    let articlePage = 0;
    while (true) {
      const articleInteractions = await ArticleInteraction.find()
        .populate('articleId', 'title tags')
        .skip(articlePage * EXPORT_CONFIG.CHUNK_SIZE)
        .limit(EXPORT_CONFIG.CHUNK_SIZE)
        .lean();

      if (articleInteractions.length === 0) break;

      const formattedArticleData = articleInteractions.map(interaction => ({
        userId: interaction.userId,
        articleTitle: interaction.articleId?.title || 'Unknown',
        interactionType: interaction.interactionType,
        timestamp: interaction.timestamp,
        duration: interaction.duration || 0,
        tags: interaction.articleId?.tags?.join('|') || '',
        deviceInfo: interaction.deviceInfo,
        location: interaction.location
      }));

      const chunkFile = await FileUtils.writeChunkToFile(
        formattedArticleData,
        `${EXPORT_CONFIG.FILE_PREFIX.ARTICLE}${timestamp}_${articlePage}.json`
      );
      chunkFiles.article.push(chunkFile);
      articlePage++;
    }

    // Export user data with pagination
    let userPage = 0;
    while (true) {
      const users = await User.find()
        .skip(userPage * EXPORT_CONFIG.CHUNK_SIZE)
        .limit(EXPORT_CONFIG.CHUNK_SIZE)
        .lean();

      if (users.length === 0) break;

      const formattedUserData = users.map(user => ({
        uid: user.uid,
        interests: user.interests?.join('|') || '',
        lastActive: user.lastActive
      }));

      const chunkFile = await FileUtils.writeChunkToFile(
        formattedUserData,
        `${EXPORT_CONFIG.FILE_PREFIX.USER}${timestamp}_${userPage}.json`
      );
      chunkFiles.user.push(chunkFile);
      userPage++;
    }

    // Combine all chunks into final files
    const finalFiles = {
      video: await FileUtils.combineChunks(
        chunkFiles.video,
        `${EXPORT_CONFIG.FILE_PREFIX.VIDEO}${timestamp}.json`
      ),
      article: await FileUtils.combineChunks(
        chunkFiles.article,
        `${EXPORT_CONFIG.FILE_PREFIX.ARTICLE}${timestamp}.json`
      ),
      user: await FileUtils.combineChunks(
        chunkFiles.user,
        `${EXPORT_CONFIG.FILE_PREFIX.USER}${timestamp}.json`
      )
    };

    return finalFiles;
  }
}

// Middleware for handling exports
export function exportMiddleware(req, res, next) {
  res.setHeader('Content-Type', 'application/json');
  next();
}

// Request handler
export async function handleExportRequest(req, res) {
  try {
    const exportFiles = await ExportService.exportData();
    res.json({
      success: true,
      message: 'Export completed successfully',
      files: exportFiles
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Export failed',
      error: error.message
    });
  }
}