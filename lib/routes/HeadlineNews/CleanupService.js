import { Content,Channel } from "../../models/HeadlineNews/HeadlineModel.js";

export class CleanupService {
  
  // Remove duplicate external content based on URL similarity
  static async removeDuplicateExternalContent() {
    try {
      console.log('🧹 Starting duplicate external content cleanup...');
      
      const externalContent = await Content.find({ 
        source: 'external',
        originalUrl: { $exists: true }
      }).sort({ createdAt: -1 });
      
      const urlMap = new Map();
      const duplicatesToDelete = [];
      
      for (const content of externalContent) {
        // Normalize URL for comparison
        const normalizedUrl = content.originalUrl.replace(/[?#].*$/, '');
        
        if (urlMap.has(normalizedUrl)) {
          // Keep the newer one, mark older for deletion
          const existing = urlMap.get(normalizedUrl);
          if (content.createdAt < existing.createdAt) {
            duplicatesToDelete.push(content._id);
          } else {
            duplicatesToDelete.push(existing._id);
            urlMap.set(normalizedUrl, content);
          }
        } else {
          urlMap.set(normalizedUrl, content);
        }
      }
      
      if (duplicatesToDelete.length > 0) {
        const result = await Content.deleteMany({ _id: { $in: duplicatesToDelete } });
        console.log(`🗑️ Removed ${result.deletedCount} duplicate external articles`);
      } else {
        console.log('✅ No duplicate external content found');
      }
      
      return duplicatesToDelete.length;
    } catch (error) {
      console.error('❌ Error removing duplicate content:', error);
      throw error;
    }
  }
  
  // Clean up expired content
  static async removeExpiredContent() {
    try {
      console.log('🧹 Cleaning up expired content...');
      const now = new Date();
      
      const result = await Content.deleteMany({
        headlineExpiresAt: { $lte: now }
      });
      
      console.log(`🗑️ Removed ${result.deletedCount} expired articles`);
      return result.deletedCount;
    } catch (error) {
      console.error('❌ Error removing expired content:', error);
      throw error;
    }
  }
  
  // Update channel statistics
  static async updateChannelStats() {
    try {
      console.log('📊 Updating channel statistics...');
      
      const channels = await Channel.find();
      
      for (const channel of channels) {
        const contentCount = await Content.countDocuments({ channelId: channel._id });
        const contents = await Content.find({ channelId: channel._id });
        
        const totalEngagement = contents.reduce((sum, content) => 
          sum + (content.likeCount + content.commentCount + content.shareCount), 0
        );
        
        const avgEngagementRate = contents.length > 0 ? totalEngagement / contents.length : 0;
        
        await Channel.findByIdAndUpdate(channel._id, {
          contentCount: contentCount,
          avgEngagementRate: avgEngagementRate
        });
      }
      
      console.log(`📊 Updated statistics for ${channels.length} channels`);
    } catch (error) {
      console.error('❌ Error updating channel stats:', error);
      throw error;
    }
  }
  
  // Run full cleanup routine
  static async runFullCleanup() {
    console.log('🔧 Starting full database cleanup...');
    
    try {
      const duplicatesRemoved = await this.removeDuplicateExternalContent();
      const expiredRemoved = await this.removeExpiredContent();
      await this.updateChannelStats();
      
      console.log('✅ Full cleanup completed');
      return {
        duplicatesRemoved,
        expiredRemoved,
        success: true
      };
    } catch (error) {
      console.error('❌ Full cleanup failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Schedule cleanup to run periodically
  static startPeriodicCleanup() {
    // Run every 6 hours
    setInterval(async () => {
      console.log('⏰ Running scheduled cleanup...');
      await this.runFullCleanup();
    }, 6 * 60 * 60 * 1000);
    
    console.log('⏰ Periodic cleanup scheduled (every 6 hours)');
  }
}

// Express route for manual cleanup
export const cleanupRoutes = (router) => {
  router.post('/cleanup/duplicates', async (req, res) => {
    try {
      const removed = await CleanupService.removeDuplicateExternalContent();
      res.json({ success: true, duplicatesRemoved: removed });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  router.post('/cleanup/expired', async (req, res) => {
    try {
      const removed = await CleanupService.removeExpiredContent();
      res.json({ success: true, expiredRemoved: removed });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  router.post('/cleanup/full', async (req, res) => {
    try {
      const result = await CleanupService.runFullCleanup();
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
};