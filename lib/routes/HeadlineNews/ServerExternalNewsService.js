import fetch from 'node-fetch'; 
import { Content, Channel } from '../../models/HeadlineNews/HeadlineModel.js';

// Debug the environment variable loading
console.log('🔍 PARTNER_API_URL in service file:', process.env.PARTNER_API_URL);

// const PARTNER_API_URL = process.env.PARTNER_API_URL;
const PARTNER_API_URL = process.env.PARTNER_API_URL || 'https://truepace.onrender.com/api/news/local'; ;

// Validate API URL at startup
if (!PARTNER_API_URL) {
  console.error('❌ CRITICAL: PARTNER_API_URL is not configured!');
  console.error('📋 Available environment variables:');
  console.error(Object.keys(process.env).filter(key => key.includes('PARTNER') || key.includes('API')));
} else {
  console.log('✅ PARTNER_API_URL configured:', PARTNER_API_URL);
}

// Create unique ID generation (same as your client-side version)
const createUniqueId = (url, title) => {
  const normalizeUrl = (url) => {
    try {
      const urlObj = new URL(url);
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
      paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
      urlObj.hash = '';
      return urlObj.toString();
    } catch {
      return url.replace(/#.*$/, '');
    }
  };

  const normalizedUrl = normalizeUrl(url);
  const titleSlug = title ? title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50) : '';
  const combinedString = `${normalizedUrl}::${titleSlug}`;
  
  let hash = 0;
  for (let i = 0; i < combinedString.length; i++) {
    const char = combinedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const uniqueId = `ext-${Math.abs(hash).toString(36)}`;
  console.log(`🔑 Generated unique ID for "${title?.substring(0, 30)}...": ${uniqueId}`);
  
  return uniqueId;
};

// Create or get channel for external source
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

// Process articles batch
const processArticlesBatch = async (articles, batchSize = 5) => {
  const results = [];
  const processedIds = new Set();
  
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (article, index) => {
      try {
        const globalIndex = i + index;
        console.log(`📄 Processing article ${globalIndex + 1}/${articles.length}: ${article.title?.substring(0, 50)}...`);
        
        // Skip articles without essential content
        if (!article.title || !article.url) {
          console.log(`⚠️ Skipping article ${globalIndex + 1}: Missing title or URL`);
          return { success: false, reason: 'missing_content' };
        }

        // Create unique ID
        const uniqueId = createUniqueId(article.url, article.title);
        
        // Check if this unique ID is already processed in this batch
        if (processedIds.has(uniqueId)) {
          console.log(`⚠️ Skipping article ${globalIndex + 1}: Duplicate ID in current batch - ${uniqueId}`);
          return { success: false, reason: 'duplicate_id_in_batch' };
        }
        processedIds.add(uniqueId);
        
        // Check database for existing content by externalId
        const existingContent = await Content.findOne({ externalId: uniqueId });
        if (existingContent) {
          console.log(`⚠️ Article ${globalIndex + 1} already exists in database: ${uniqueId}`);
          return { success: false, reason: 'exists_in_database' };
        }
        
        // Create/get channel
        const sourceName = article.source?.name || 'External News';
        const channel = await createOrGetChannelForExternalSource(sourceName);
        
        if (!channel || !channel._id) {
          console.error(`❌ Failed to get channel for article ${globalIndex + 1}`);
          return { success: false, reason: 'channel_failed' };
        }
        
        // Calculate timing
        const now = new Date();
        const publishedAt = new Date(article.publishedAt || now);
        const timeSincePublished = now - publishedAt;
        const justInDuration = 15 * 60 * 1000; // 15 minutes
        const headlineDuration = 48 * 60 * 60 * 1000; // 48 hours
        
        // Check if content is too old
        if (timeSincePublished > headlineDuration) {
          console.log(`⚠️ Article ${globalIndex + 1} too old: ${Math.round(timeSincePublished / (60 * 60 * 1000))} hours`);
          return { success: false, reason: 'too_old' };
        }
        
        const isJustIn = timeSincePublished < justInDuration;
        const justInExpiresAt = isJustIn ? new Date(publishedAt.getTime() + justInDuration) : null;
        const headlineExpiresAt = new Date(publishedAt.getTime() + headlineDuration);
        
        // Create content object
        let message = article.title;
        if (article.description && article.description.trim()) {
          message += `\n\n${article.description.trim()}`;
        }
        
        const newsContent = new Content({
          externalId: uniqueId,
          message: message,
          picture: article.urlToImage || null,
          channelId: channel._id,
          isJustIn: isJustIn,
          justInExpiresAt: justInExpiresAt,
          headlineExpiresAt: headlineExpiresAt,
          uploadedAt: publishedAt,
          createdAt: publishedAt,
          likeCount: 0,
          dislikeCount: 0,
          commentCount: 0,
          shareCount: 0,
          tags: article.category ? [article.category] : ['external'],
          source: 'external',
          originalSource: sourceName,
          originalUrl: article.url,
          fetchedAt: now,
          engagementScore: 0,
          viralScore: 0,
          showInAllChannels: !isJustIn
        });
        
        console.log(`💾 Attempting to save article ${globalIndex + 1} with ID: ${uniqueId}`);
        
        // Save to database
        const savedContent = await newsContent.save();
        const destination = isJustIn ? 'Just In' : 'Headlines';
        console.log(`✅ Article ${globalIndex + 1} saved to ${destination}: ${sourceName} (ID: ${uniqueId})`);
        return { success: true, content: savedContent, uniqueId };
        
      } catch (error) {
        console.error(`❌ Error processing article ${globalIndex + 1}:`, error);
        return { success: false, reason: 'processing_error', error: error.message };
      }
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : { success: false, reason: 'promise_rejected' }));
    
    // Small delay between batches
    if (i + batchSize < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
};

// Enhanced main function with better error handling and debugging
export const fetchExternalNewsServer = async (ipInfo = { ip: '8.8.8.8' }) => {
  try {
    console.log('🔄 [SERVER] Starting external news fetch...');
    console.log('🔍 [SERVER] Using IP:', ipInfo.ip);
    console.log('🔍 [SERVER] PARTNER_API_URL:', PARTNER_API_URL);
    
    if (!PARTNER_API_URL) {
      console.error('❌ [SERVER] PARTNER_API_URL not configured');
      console.error('📋 [SERVER] Current environment variables:');
      console.error('PORT:', process.env.PORT);
      console.error('NODE_ENV:', process.env.NODE_ENV);
      console.error('Available env vars:', Object.keys(process.env).filter(key => 
        key.includes('PARTNER') || key.includes('API') || key.includes('URL')
      ));
      return [];
    }
    
    // Build the full URL
    const fullUrl = `${PARTNER_API_URL}?ip=${encodeURIComponent(ipInfo.ip)}`;
    console.log('🌐 [SERVER] Full API URL:', fullUrl);
    
    // Make the API request with additional headers and timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NewsApp/1.0',
        'Accept': 'application/json',
        'X-Client-Version': '1.0.0',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log('📡 [SERVER] API Response status:', response.status);
    console.log('📡 [SERVER] API Response headers:', Object.fromEntries(response.headers));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [SERVER] API Error Response:', errorText);
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('📰 [SERVER] API Response structure:', {
      hasArticles: !!data.articles,
      articlesCount: data.articles?.length || 0,
      responseKeys: Object.keys(data),
      firstArticleKeys: data.articles?.[0] ? Object.keys(data.articles[0]) : 'No articles'
    });

    if (!data.articles || !Array.isArray(data.articles)) {
      console.log('❌ [SERVER] No articles in response or invalid format');
      console.log('📋 [SERVER] Full response:', JSON.stringify(data, null, 2));
      return [];
    }

    if (data.articles.length === 0) {
      console.log('ℹ️ [SERVER] API returned empty articles array');
      return [];
    }

    // Log sample article for debugging
    console.log('📄 [SERVER] Sample article:', JSON.stringify(data.articles[0], null, 2));

    // Process articles in batches
    const results = await processArticlesBatch(data.articles);
    
    // Generate detailed summary
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      reasons: {},
      savedIds: results.filter(r => r.success).map(r => r.uniqueId)
    };
    
    results.filter(r => !r.success).forEach(r => {
      summary.reasons[r.reason] = (summary.reasons[r.reason] || 0) + 1;
    });
    
    console.log('\n📊 [SERVER] PROCESSING SUMMARY:');
    console.log(`✅ Successful: ${summary.successful}`);
    console.log(`❌ Failed: ${summary.failed}`);
    console.log('📋 Failure reasons:', summary.reasons);
    
    return results.filter(r => r.success).map(r => r.content);
    
  } catch (error) {
    console.error('❌ [SERVER] Error fetching external news:', error);
    console.error('❌ [SERVER] Error stack:', error.stack);
    
    // If it's an abort error, log it differently
    if (error.name === 'AbortError') {
      console.error('⏰ [SERVER] Request timed out after 30 seconds');
    }
    
    return [];
  }
};

// Refresh external channels (unchanged)
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

// Test function to validate API connectivity
export const testPartnerAPI = async (ipInfo = { ip: '8.8.8.8' }) => {
  try {
    console.log('🧪 [TEST] Testing partner API connectivity...');
    
    if (!PARTNER_API_URL) {
      return { success: false, error: 'PARTNER_API_URL not configured' };
    }
    
    const fullUrl = `${PARTNER_API_URL}?ip=${encodeURIComponent(ipInfo.ip)}`;
    console.log('🧪 [TEST] Testing URL:', fullUrl);
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NewsApp-Test/1.0',
      }
    });
    
    const isOk = response.ok;
    const status = response.status;
    const statusText = response.statusText;
    
    let responseData = null;
    try {
      responseData = await response.json();
    } catch (e) {
      responseData = await response.text();
    }
    
    console.log('🧪 [TEST] API Test Results:', {
      success: isOk,
      status,
      statusText,
      hasArticles: responseData?.articles?.length > 0,
      articlesCount: responseData?.articles?.length || 0
    });
    
    return {
      success: isOk,
      status,
      statusText,
      articlesCount: responseData?.articles?.length || 0,
      sampleData: responseData?.articles?.[0] || null
    };
    
  } catch (error) {
    console.error('🧪 [TEST] API Test Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Add API endpoint for manual triggering with enhanced debugging
export const createExternalNewsRoute = (router) => {
  // Test API connectivity
  router.get('/test-api', async (req, res) => {
    try {
      const ipInfo = { ip: req.ipAddress || '8.8.8.8' };
      const testResult = await testPartnerAPI(ipInfo);
      res.json(testResult);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Manual trigger endpoint
  router.post('/fetch-external-news', async (req, res) => {
    try {
      const ipInfo = { ip: req.ipAddress || req.body.ipInfo?.ip || '8.8.8.8' };
      console.log('📡 [ROUTE] Manual external news fetch triggered with IP:', ipInfo.ip);
      
      const results = await fetchExternalNewsServer(ipInfo);
      
      res.json({
        success: true,
        articlesProcessed: results.length,
        message: `Successfully processed ${results.length} external news articles`
      });
    } catch (error) {
      console.error('❌ [ROUTE] Error in manual fetch:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
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
  
  // Enhanced status endpoint
  router.get('/status', async (req, res) => {
    try {
      const status = {
        serviceStatus: 'active',
        partnerApiUrl: PARTNER_API_URL || 'not configured',
        partnerApiConfigured: !!PARTNER_API_URL,
        lastCronRun: new Date(),
        environment: process.env.NODE_ENV || 'unknown',
        availableEnvVars: Object.keys(process.env).filter(key => 
          key.includes('PARTNER') || key.includes('API') || key.includes('URL')
        )
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