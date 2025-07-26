// ServerExternalNewsService.js - Cleaned version with external fetching logic removed
import { Content, Channel } from '../../models/HeadlineNews/HeadlineModel.js';

// Create or get channel for external source with retry logic
const createOrGetChannelForExternalSource = async (source, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const normalizedSourceName = source.trim();
      
      // Check for existing channel
      let channel = await Channel.findOne({ 
        name: normalizedSourceName,
        isExternal: true 
      });
      
      if (channel) {
        console.log(`✅ Found existing channel for ${normalizedSourceName}: ${channel._id}`);
        return channel;
      }
      
      // Create new channel
      channel = new Channel({
        name: normalizedSourceName,
        picture: '/NopicAvatar.png',
        description: `External news from ${normalizedSourceName}`,
        tags: ['external'],
        isExternal: true,
        contentCount: 0,
        totalViews: 0,
        avgEngagementRate: 0,
        subscriberCount: 0
      });
      
      const savedChannel = await channel.save();
      console.log(`✅ Created new channel: ${normalizedSourceName} (ID: ${savedChannel._id})`);
      return savedChannel;
      
    } catch (error) {
      console.error(`❌ Channel creation attempt ${attempt} failed:`, error);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } else {
        throw error;
      }
    }
  }
};

// Refresh external channels
export const refreshExternalChannelsServer = async () => {
  try {
    console.log('🔄 [SERVER] Refreshing external channels...');
    
    // Get all external content sources
    const externalSources = await Content.distinct('originalSource', { 
      source: 'external',
      originalSource: { $exists: true, $ne: null }
    });
    
    console.log(`📺 [SERVER] Found ${externalSources.length} external sources`);
    
    // Ensure channels exist for all sources
    for (const source of externalSources) {
      await createOrGetChannelForExternalSource(source);
    }
    
    console.log('✅ [SERVER] External channels refresh completed');
    return true;
  } catch (error) {
    console.error('❌ [SERVER] Error refreshing external channels:', error);
    return false;
  }
};

// Clean up expired external content
export const cleanupExpiredExternalContent = async () => {
  try {
    console.log('🧹 [SERVER] Cleaning up expired external content...');
    
    const now = new Date();
    
    // Remove expired Just In content
    const expiredJustIn = await Content.deleteMany({
      source: 'external',
      justInExpiresAt: { $lt: now }
    });
    
    // Remove expired Headline content
    const expiredHeadlines = await Content.deleteMany({
      source: 'external',
      headlineExpiresAt: { $lt: now }
    });
    
    console.log(`🗑️ [SERVER] Cleaned up ${expiredJustIn.deletedCount} expired Just In and ${expiredHeadlines.deletedCount} expired Headlines`);
    
    return {
      justInRemoved: expiredJustIn.deletedCount,
      headlinesRemoved: expiredHeadlines.deletedCount
    };
  } catch (error) {
    console.error('❌ [SERVER] Error cleaning up expired content:', error);
    return { justInRemoved: 0, headlinesRemoved: 0 };
  }
};

// Get external content statistics
export const getExternalContentStats = async () => {
  try {
    const stats = await Content.aggregate([
      { $match: { source: 'external' } },
      {
        $group: {
          _id: '$originalSource',
          count: { $sum: 1 },
          justInCount: {
            $sum: { $cond: [{ $ne: ['$justInExpiresAt', null] }, 1, 0] }
          },
          headlineCount: {
            $sum: { $cond: [{ $ne: ['$headlineExpiresAt', null] }, 1, 0] }
          }
        }
      }
    ]);
    
    return stats;
  } catch (error) {
    console.error('❌ [SERVER] Error getting external content stats:', error);
    return [];
  }
};

// Create minimal API routes for external content management
export const createExternalContentRoutes = (router) => {
  // Refresh channels endpoint
  router.post('/refresh-external-channels', async (req, res) => {
    try {
      const success = await refreshExternalChannelsServer();
      
      res.json({
        success,
        message: success ? 'External channels refreshed successfully' : 'Failed to refresh external channels'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Cleanup expired content endpoint
  router.post('/cleanup-expired-external', async (req, res) => {
    try {
      const result = await cleanupExpiredExternalContent();
      
      res.json({
        success: true,
        ...result,
        message: `Cleaned up ${result.justInRemoved + result.headlinesRemoved} expired external articles`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Get external content statistics
  router.get('/external-stats', async (req, res) => {
    try {
      const stats = await getExternalContentStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Status endpoint
  router.get('/status', async (req, res) => {
    try {
      const status = {
        serviceStatus: 'active - cleanup only',
        externalFetching: 'moved to frontend',
        environment: process.env.NODE_ENV || 'unknown',
        timestamp: new Date().toISOString()
      };
      
      res.json(status);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
};