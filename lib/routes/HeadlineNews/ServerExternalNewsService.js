// ServerExternalNewsService.js - Optimized for NewsAPI free tier rate limits
import fetch from 'node-fetch'; 
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Content, Channel } from '../../models/HeadlineNews/HeadlineModel.js';

const activeRequests = new Map();
const recentlyProcessed = new Set();

// Get current directory for .env loading
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const loadEnvironmentVariables = () => {
  const possiblePaths = [
    path.join(__dirname, '../../../.env'),
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../.env'),
    path.join(process.cwd(), '.env'),
    '.env'
  ];
  
  for (const envPath of possiblePaths) {
    try {
      const result = dotenv.config({ path: envPath });
      if (!result.error && result.parsed?.PARTNER_API_URL) {
        console.log(`✅ Successfully loaded .env from: ${envPath}`);
        return result.parsed.PARTNER_API_URL;
      }
    } catch (error) {
      // Continue to next path
    }
  }
  
  return null;
};

let PARTNER_API_URL = process.env.PARTNER_API_URL;

if (!PARTNER_API_URL) {
  console.log('⚠️ PARTNER_API_URL not found in process.env, attempting to load from .env file...');
  PARTNER_API_URL = loadEnvironmentVariables();
}

if (!PARTNER_API_URL) {
  console.error('❌ CRITICAL: PARTNER_API_URL is not configured!');
} else {
  console.log('✅ PARTNER_API_URL configured successfully');
  
  try {
    new URL(PARTNER_API_URL);
    console.log('✅ PARTNER_API_URL format is valid');
  } catch (error) {
    console.error('❌ PARTNER_API_URL format is invalid:', error.message);
  }
}

// 🆕 Enhanced fetch with specific rate limit handling
const fetchWithRetry = async (url, options = {}, maxRetries = 2) => { // Reduced retries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 API attempt ${attempt}/${maxRetries}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`⏰ Request timeout after 30 seconds on attempt ${attempt}`);
        controller.abort();
      }, 30000); // Reduced timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TruePaceNewsApp/1.0',
          'Accept': 'application/json',
          'X-Client-Version': '1.0.0',
          'Cache-Control': 'no-cache',
          ...options.headers
        }
      });
      
      clearTimeout(timeoutId);
      
      console.log(`📡 Response: ${response.status} ${response.statusText}`);
      
      // 🆕 Specific rate limit detection
      if (response.status === 429 || response.status === 426) {
        const errorText = await response.text();
        console.error(`🚫 Rate limit detected: ${response.status} - ${errorText}`);
        throw new Error(`NewsAPI rate limit reached: ${errorText}`);
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // 🆕 Check for rate limit in error message
        if (errorText.toLowerCase().includes('rate limit') || 
            errorText.toLowerCase().includes('too many requests') ||
            errorText.toLowerCase().includes('quota exceeded')) {
          console.error(`🚫 Rate limit detected in error message: ${errorText}`);
          throw new Error(`NewsAPI rate limit reached: ${errorText}`);
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      return response;
      
    } catch (error) {
      console.error(`❌ Fetch attempt ${attempt} failed:`, error.message);
      
      // 🆕 Don't retry on rate limit errors
      if (error.message.toLowerCase().includes('rate limit') ||
          error.message.toLowerCase().includes('too many requests')) {
        console.error('🚫 Rate limit error - not retrying');
        throw error;
      }
      
      if (attempt < maxRetries) {
        const waitTime = Math.min(attempt * 3000, 10000); // Longer wait between retries
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error;
      }
    }
  }
};

// Create or get channel for external source
const createOrGetChannelForExternalSource = async (source, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const normalizedSourceName = source.trim();
      
      let channel = await Channel.findOne({ 
        name: normalizedSourceName,
        isExternal: true 
      });
      
      if (channel) {
        return channel;
      }
      
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

// Enhanced unique ID generation
const createStableHash = (url, title) => {
  const normalizedUrl = url.toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  
  const normalizedTitle = title.toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 80);
  
  const combined = `${normalizedUrl}||${normalizedTitle}`;
  return crypto.createHash('md5').update(combined).digest('hex').substring(0, 16);
};

// Enhanced duplicate detection
const isDuplicate = async (article) => {
  const stableId = createStableHash(article.url, article.title);
  
  // Properly escape special regex characters
  const escapedTitle = article.title.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const existing = await Content.findOne({
    $or: [
      { externalId: stableId },
      { originalUrl: article.url },
      {
        message: { $regex: `^${escapedTitle}`, $options: 'i' },
        source: 'external',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    ]
  }).lean();
  
  return { isDuplicate: !!existing, stableId, existingId: existing?._id };
};

// Cache cleanup function
const cleanupCaches = () => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [key, timestamp] of activeRequests.entries()) {
    if (now - timestamp > maxAge) {
      activeRequests.delete(key);
    }
  }
  
  console.log(`🧹 Cleaned up caches - Active: ${activeRequests.size}, Recent: ${recentlyProcessed.size}`);
};

// Call cleanup every 15 minutes
setInterval(cleanupCaches, 15 * 60 * 1000);

// 🆕 MAIN FUNCTION - Enhanced with better rate limit handling
export const fetchExternalNewsServer = async (ipInfo = { ip: '8.8.8.8' }) => {
  const startTime = Date.now();
  
  try {
    console.log('\n🚀 ============ EXTERNAL NEWS FETCH STARTED ============');
    console.log(`🔍 Using IP: ${ipInfo.ip}`);
    console.log(`⏰ Daily API usage: ${global.newsState?.dailyRequestCount || 0}/${global.newsState?.maxDailyRequests || 90}`);
    
    if (!PARTNER_API_URL) {
      console.error('❌ PARTNER_API_URL not configured');
      return [];
    }
    
    // Build API URL
    const url = new URL(PARTNER_API_URL);
    url.searchParams.set('ip', ipInfo.ip);
    url.searchParams.set('timestamp', Date.now().toString());
    
    console.log(`🌐 Fetching from: ${url.toString()}`);
    
    // Fetch with enhanced error handling
    const response = await fetchWithRetry(url.toString(), { method: 'GET' });
    const data = await response.json();
    
    if (!data.articles?.length) {
      console.log('ℹ️ No articles received from API');
      return [];
    }
    
    console.log(`📦 Received ${data.articles.length} articles from API`);
    
    // Process articles with rate limit awareness
    const results = [];
    const processedUrls = new Set();
    
    // 🆕 Limit processing to conserve resources
    const maxArticlesToProcess = 50; // Process max 50 articles per request
    
    const sortedArticles = data.articles
      .filter(article => article?.title && article?.url)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, maxArticlesToProcess); // Take only the most recent articles

    console.log(`📝 Processing ${sortedArticles.length}/${data.articles.length} articles`);

    for (let i = 0; i < sortedArticles.length; i++) {
      const article = sortedArticles[i];
      
      try {
        // Skip if already processed in this batch
        if (processedUrls.has(article.url.toLowerCase())) {
          continue;
        }
        
        // Check for duplicates
        const duplicateCheck = await isDuplicate(article);
        if (duplicateCheck.isDuplicate) {
          console.log(`⚠️ Duplicate skipped: ${article.title.substring(0, 40)}...`);
          continue;
        }
        
        processedUrls.add(article.url.toLowerCase());
        
        // Get or create channel
        const sourceName = article.source?.name || article.source || 'External News';
        const channel = await createOrGetChannelForExternalSource(sourceName);
        
        // Calculate timing with more conservative approach
        const now = new Date();
        const publishedAt = article.publishedAt ? new Date(article.publishedAt) : now;
        const timeSincePublished = now - publishedAt;
        
        // Skip very old articles to avoid clutter
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours max (reduced from 48)
        if (timeSincePublished > maxAge) {
          console.log(`⏰ Skipping old article: ${article.title.substring(0, 40)}...`);
          continue;
        }
        
        // More conservative Just In timing
        const justInDuration = 10 * 60 * 1000; // 10 minutes (reduced from 15)
        const isJustIn = timeSincePublished < justInDuration;
        const justInExpiresAt = isJustIn ? new Date(publishedAt.getTime() + justInDuration) : null;
        const headlineExpiresAt = new Date(publishedAt.getTime() + maxAge);
        
        // Create content with better error handling
        let message = article.title.trim();
        if (article.description?.trim()) {
          message += `\n\n${article.description.trim()}`;
        }
        
        const newsContent = await Content.create({
          externalId: duplicateCheck.stableId,
          message: message,
          picture: article.urlToImage || article.image || null,
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
        
        results.push(newsContent);
        
        const destination = isJustIn ? 'Just In' : 'Headlines';
        console.log(`✅ Saved to ${destination}: ${article.title.substring(0, 40)}...`);
        
        // 🆕 Add small delay to prevent overwhelming the database
        if (i < sortedArticles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️ Duplicate key error for: ${article.title.substring(0, 40)}...`);
          continue;
        }
        console.error(`❌ Error processing article "${article.title.substring(0, 40)}...":`, error.message);
        
        // Don't stop processing other articles
        continue;
      }
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ Processing completed: ${results.length}/${sortedArticles.length} articles saved in ${processingTime}ms`);
    console.log(`📊 Success rate: ${Math.round((results.length / sortedArticles.length) * 100)}%`);
    
    return results;
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('\n❌ EXTERNAL NEWS FETCH FAILED:', error.message);
    console.error(`❌ Processing time: ${processingTime}ms`);
    
    // 🆕 Update global state on rate limit
    if (error.message.toLowerCase().includes('rate limit')) {
      if (global.newsState) {
        global.newsState.rateLimitHit = true;
        global.newsState.dailyRequestCount = global.newsState.maxDailyRequests;
        console.error('🚫 Marked as rate limited in global state');
      }
    }
    
    return [];
  } finally {
    console.log('🏁 ============ EXTERNAL NEWS FETCH ENDED ============\n');
  }
};

// 🆕 Enhanced API test with rate limit awareness
export const testPartnerAPI = async (ipInfo = { ip: '8.8.8.8' }) => {
  try {
    console.log('\n🧪 ============ API CONNECTIVITY TEST ============');
    
    if (!PARTNER_API_URL) {
      return { 
        success: false, 
        error: 'PARTNER_API_URL not configured',
        configuredUrl: PARTNER_API_URL 
      };
    }
    
    // Check if we should even attempt the test
    if (global.newsState?.rateLimitHit) {
      return {
        success: false,
        error: 'Rate limit already hit today - test skipped',
        dailyRequests: global.newsState.dailyRequestCount,
        maxDaily: global.newsState.maxDailyRequests
      };
    }
    
    const url = new URL(PARTNER_API_URL);
    url.searchParams.set('ip', ipInfo.ip);
    url.searchParams.set('test', 'true');
    
    const fullUrl = url.toString();
    console.log(`🧪 Testing URL: ${fullUrl}`);
    
    const response = await fetchWithRetry(fullUrl, { method: 'GET' }, 1); // Only 1 retry for test
    const responseData = await response.json();
    
    const result = {
      success: true,
      status: response.status,
      statusText: response.statusText,
      articlesCount: responseData?.articles?.length || 0,
      hasArticles: !!responseData?.articles?.length,
      sampleArticle: responseData?.articles?.[0] || null,
      responseKeys: Object.keys(responseData),
      rateLimit: {
        dailyRequests: global.newsState?.dailyRequestCount || 0,
        maxDaily: global.newsState?.maxDailyRequests || 90,
        rateLimitHit: global.newsState?.rateLimitHit || false
      }
    };
    
    console.log('🧪 Test Results:', result);
    console.log('🏁 ============ API TEST COMPLETED ============\n');
    
    return result;
    
  } catch (error) {
    console.error('\n❌ ============ API TEST FAILED ============');
    console.error(`❌ Error: ${error.message}`);
    console.error('🏁 ============ API TEST FAILED ============\n');
    
    // Update rate limit status if needed
    if (error.message.toLowerCase().includes('rate limit') && global.newsState) {
      global.newsState.rateLimitHit = true;
      global.newsState.dailyRequestCount = global.newsState.maxDailyRequests;
    }
    
    return {
      success: false,
      error: error.message,
      configuredUrl: PARTNER_API_URL,
      isRateLimit: error.message.toLowerCase().includes('rate limit')
    };
  }
};

// Refresh external channels (no API calls)
export const refreshExternalChannelsServer = async () => {
  try {
    console.log('🔄 Refreshing external channels...');
    
    const externalSources = await Content.distinct('originalSource', { 
      source: 'external',
      originalSource: { $exists: true, $ne: null }
    });
    
    console.log(`📺 Found ${externalSources.length} external sources`);
    
    for (const source of externalSources) {
      await createOrGetChannelForExternalSource(source);
    }
    
    console.log('✅ External channels refresh completed');
    return true;
  } catch (error) {
    console.error('❌ Error refreshing external channels:', error);
    return false;
  }
};

// 🆕 Enhanced API routes with rate limit awareness
export const createExternalNewsRoute = (router) => {
  // Rate-limit aware test endpoint
  router.get('/test-api', async (req, res) => {
    try {
      const ipInfo = { ip: req.ipAddress || req.query.ip || '8.8.8.8' };
      
      // Check rate limits before testing
      if (global.newsState?.rateLimitHit) {
        return res.status(429).json({
          success: false,
          error: 'API rate limit already reached today',
          dailyRequests: global.newsState.dailyRequestCount,
          maxDaily: global.newsState.maxDailyRequests,
          resetTime: 'Tomorrow at midnight UTC'
        });
      }
      
      const testResult = await testPartnerAPI(ipInfo);
      
      res.json({
        ...testResult,
        timestamp: new Date().toISOString(),
        clientIp: ipInfo.ip
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Rate-limit protected manual trigger
  router.post('/fetch-external-news', async (req, res) => {
    try {
      // Check rate limits first
      if (global.newsState?.rateLimitHit || 
          (global.newsState?.dailyRequestCount || 0) >= (global.newsState?.maxDailyRequests || 90)) {
        return res.status(429).json({
          success: false,
          error: 'Daily API rate limit reached',
          dailyRequests: global.newsState?.dailyRequestCount || 0,
          maxDaily: global.newsState?.maxDailyRequests || 90,
          message: 'Please try again tomorrow or upload content manually'
        });
      }
      
      const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
      console.log('📡 Manual external news fetch triggered via API');
      
      const results = await fetchExternalNewsServer(ipInfo);
      
      res.json({
        success: true,
        articlesProcessed: results.length,
        message: `Successfully processed ${results.length} external news articles`,
        rateLimit: {
          dailyRequests: global.newsState?.dailyRequestCount || 0,
          maxDaily: global.newsState?.maxDailyRequests || 90,
          remaining: (global.newsState?.maxDailyRequests || 90) - (global.newsState?.dailyRequestCount || 0)
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error in manual fetch:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Enhanced status endpoint
  router.get('/status', async (req, res) => {
    try {
      const now = new Date();
      const rateLimitStatus = global.newsState ? {
        dailyRequests: global.newsState.dailyRequestCount,
        maxDaily: global.newsState.maxDailyRequests,
        remaining: global.newsState.maxDailyRequests - global.newsState.dailyRequestCount,
        rateLimitHit: global.newsState.rateLimitHit,
        lastFetch: global.newsState.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
        nextAllowed: global.newsState.lastFetch ? 
          new Date(global.newsState.lastFetch + (global.newsState.minimumInterval || 4*60*60*1000)).toISOString() : 
          'now',
        canFetchNow: !global.newsState.rateLimitHit && 
                     (now - global.newsState.lastFetch) > (global.newsState.minimumInterval || 4*60*60*1000)
      } : null;
      
      res.json({
        serviceStatus: 'active',
        partnerApiUrl: PARTNER_API_URL ? 'configured' : 'NOT CONFIGURED',
        partnerApiConfigured: !!PARTNER_API_URL,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        rateLimits: rateLimitStatus,
        recommendations: {
          message: 'NewsAPI free tier allows 100 requests/day. Use manual content upload for high-frequency updates.',
          manualUploadEndpoint: '/api/HeadlineNews/Content',
          maxRequestsPerDay: 100,
          currentStrategy: 'Max 4 requests/day via scheduled CRON jobs'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // 🆕 Rate limit reset endpoint (for testing)
  router.post('/reset-rate-limit', async (req, res) => {
    try {
      if (global.newsState) {
        global.newsState.dailyRequestCount = 0;
        global.newsState.rateLimitHit = false;
        global.newsState.lastResetDate = new Date().toDateString();
        console.log('🔄 Rate limit counters manually reset');
      }
      
      res.json({
        success: true,
        message: 'Rate limit counters reset',
        newStatus: {
          dailyRequests: 0,
          rateLimitHit: false,
          lastReset: new Date().toISOString()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
};

// Cleanup duplicates function (unchanged)
export const cleanupDuplicates = async () => {
  try {
    console.log('🧹 Cleaning up existing duplicates...');
    
    const duplicates = await Content.aggregate([
      { 
        $match: { 
          source: 'external',
          originalUrl: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$originalUrl',
          count: { $sum: 1 },
          docs: { $push: { _id: '$_id', createdAt: '$createdAt' } }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);
    
    let removedCount = 0;
    
    for (const group of duplicates) {
      const sortedDocs = group.docs.sort((a, b) => a.createdAt - b.createdAt);
      const toRemove = sortedDocs.slice(1);
      
      if (toRemove.length > 0) {
        await Content.deleteMany({
          _id: { $in: toRemove.map(doc => doc._id) }
        });
        removedCount += toRemove.length;
      }
    }
    
    console.log(`🗑️ Removed ${removedCount} duplicate articles`);
    return { removed: removedCount };
    
  } catch (error) {
    console.error('❌ Error cleaning duplicates:', error);
    return { error: error.message };
  }
};