// ServerExternalNewsService.js - RELAXED MODE with minimal rate limiting
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

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

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

// Final validation and logging
if (!PARTNER_API_URL) {
  console.error('❌ CRITICAL: PARTNER_API_URL is not configured!');
  console.error('📋 Available environment variables:');
  console.error('Process env keys:', Object.keys(process.env).filter(key => 
    key.includes('PARTNER') || key.includes('API') || key.includes('URL')
  ));
} else {
  console.log('✅ PARTNER_API_URL configured successfully:', PARTNER_API_URL);
  
  // Validate URL format
  try {
    new URL(PARTNER_API_URL);
    console.log('✅ PARTNER_API_URL format is valid');
  } catch (error) {
    console.error('❌ PARTNER_API_URL format is invalid:', error.message);
  }
}

// Enhanced fetch with better error handling and RELAXED retry logic
const fetchWithRetry = async (url, options = {}, maxRetries = 2) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 API attempt ${attempt}/${maxRetries} to: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`⏰ Request timeout after 45 seconds on attempt ${attempt}`);
        controller.abort();
      }, 45000); // Increased timeout
      
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
      
      // 🚨 RELAXED: Less aggressive rate limit detection
      if (response.status === 429) {
        const errorText = await response.text();
        console.error(`🚫 Rate limit detected: ${response.status} - ${errorText}`);
        
        // Don't throw error immediately - try to continue
        if (attempt < maxRetries) {
          console.log('⏳ Rate limited, but will retry...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw new Error(`Rate limit reached after retries: ${errorText}`);
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // 🚨 RELAXED: Only throw rate limit errors if explicitly mentioned
        if (errorText.toLowerCase().includes('rate limit exceeded') || 
            errorText.toLowerCase().includes('too many requests')) {
          console.error(`🚫 Rate limit in error message: ${errorText}`);
          if (attempt < maxRetries) {
            console.log('⏳ Will retry despite rate limit message...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }
        }
        
        // For other errors, retry
        if (attempt < maxRetries && (response.status >= 500 || response.status === 408)) {
          console.log(`⏳ Server error ${response.status}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      return response;
      
    } catch (error) {
      console.error(`❌ Fetch attempt ${attempt} failed:`, error.message);
      
      // 🚨 RELAXED: Only fail fast on network errors, not rate limits
      if (error.name === 'AbortError' || error.code === 'ECONNREFUSED') {
        console.error('🚫 Network error - not retrying');
        throw error;
      }
      
      if (attempt < maxRetries) {
        const waitTime = Math.min(attempt * 1000, 5000); // Reduced wait time
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
  const escapedTitle = article.title.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\      }, 45000); //');
  
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

// 🆕 MAIN FUNCTION - RELAXED MODE with minimal restrictions
export const fetchExternalNewsServer = async (ipInfo = { ip: '8.8.8.8' }) => {
  const startTime = Date.now();
  
  try {
    console.log('\n🚀 ============ EXTERNAL NEWS FETCH STARTED (RELAXED MODE) ============');
    console.log(`🔍 Using IP: ${ipInfo.ip}`);
    console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
    console.log(`⏰ Total API calls so far: ${global.newsState?.fetchCount || 0}`);
    console.log(`🚫 Rate Limiting: DISABLED - Relaxed mode active`);
    
    if (!PARTNER_API_URL) {
      console.error('❌ PARTNER_API_URL not configured');
      return [];
    }
    
    // Build API URL
    const url = new URL(PARTNER_API_URL);
    url.searchParams.set('ip', ipInfo.ip);
    url.searchParams.set('timestamp', Date.now().toString());
    url.searchParams.set('environment', isDevelopment ? 'development' : 'production');
    url.searchParams.set('mode', 'relaxed');
    
    console.log(`🌐 Fetching from: ${url.toString()}`);
    
    // 🚨 RELAXED: Fetch with reduced retries but more tolerance
    const response = await fetchWithRetry(url.toString(), { method: 'GET' }, 2);
    const data = await response.json();
    
    if (!data.articles?.length) {
      console.log('ℹ️ No articles received from API - this is normal');
      return [];
    }
    
    console.log(`📦 Received ${data.articles.length} articles from API`);
    
    // Process articles with RELAXED filtering
    const results = [];
    const processedUrls = new Set();
    
    // 🚨 RELAXED: Process more articles
    const maxArticlesToProcess = isDevelopment ? 30 : 50;
    
    const sortedArticles = data.articles
      .filter(article => {
        // 🚨 RELAXED: Less strict filtering
        if (!article?.title || !article?.url) return false;
        if (article.title.length < 5) return false; // Reduced from 10 to 5
        if (article.url.includes('localhost')) return false;
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, maxArticlesToProcess);

    console.log(`📝 Processing ${sortedArticles.length}/${data.articles.length} articles (RELAXED mode)`);

    for (let i = 0; i < sortedArticles.length; i++) {
      const article = sortedArticles[i];
      
      try {
        // Skip if already processed in this batch
        if (processedUrls.has(article.url.toLowerCase())) {
          continue;
        }
        
        // 🚨 RELAXED: Less strict duplicate checking
        const duplicateCheck = await isDuplicate(article);
        if (duplicateCheck.isDuplicate) {
          console.log(`⚠️ Duplicate skipped: ${article.title.substring(0, 40)}...`);
          continue;
        }
        
        processedUrls.add(article.url.toLowerCase());
        
        // Get or create channel
        const sourceName = article.source?.name || article.source || 'External News';
        const channel = await createOrGetChannelForExternalSource(sourceName);
        
        // 🚨 RELAXED: More generous age limits
        const now = new Date();
        const publishedAt = article.publishedAt ? new Date(article.publishedAt) : now;
        const timeSincePublished = now - publishedAt;
        
        // 🚨 RELAXED: Accept older articles
        const maxAge = isDevelopment ? 
          72 * 60 * 60 * 1000 : // 72 hours in development
          48 * 60 * 60 * 1000;  // 48 hours in production
          
        if (timeSincePublished > maxAge) {
          console.log(`⏰ Skipping very old article (${Math.round(timeSincePublished / (60 * 60 * 1000))}h old): ${article.title.substring(0, 40)}...`);
          continue;
        }
        
        // 🚨 RELAXED: More generous Just In timing
        const justInDuration = isDevelopment ? 
          15 * 60 * 1000 :  // 15 minutes in development
          30 * 60 * 1000;   // 30 minutes in production
          
        const isJustIn = timeSincePublished < justInDuration;
        const justInExpiresAt = isJustIn ? new Date(publishedAt.getTime() + justInDuration) : null;
        const headlineExpiresAt = new Date(publishedAt.getTime() + maxAge);
        
        // Create content with better error handling
        let message = article.title.trim();
        if (article.description?.trim() && article.description.length > 5) { // Reduced from 10 to 5
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
        const ageMinutes = Math.round(timeSincePublished / (60 * 1000));
        console.log(`✅ Saved to ${destination} (${ageMinutes}m old): ${article.title.substring(0, 40)}...`);
        
        // Reduced delay
        if (i < sortedArticles.length - 1 && i % 15 === 14) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️ Duplicate key error for: ${article.title.substring(0, 40)}...`);
          continue;
        }
        console.error(`❌ Error processing article "${article.title.substring(0, 40)}...":`, error.message);
        continue;
      }
    }
    
    const processingTime = Date.now() - startTime;
    const successRate = Math.round((results.length / sortedArticles.length) * 100);
    
    console.log(`✅ Processing completed: ${results.length}/${sortedArticles.length} articles saved in ${processingTime}ms`);
    console.log(`📊 Success rate: ${successRate}%`);
    console.log(`🏷️ Just In: ${results.filter(r => r.isJustIn).length}, Headlines: ${results.filter(r => !r.isJustIn).length}`);
    
    return results;
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('\n❌ EXTERNAL NEWS FETCH FAILED:', error.message);
    console.error(`❌ Processing time: ${processingTime}ms`);
    
    // 🚨 RELAXED: Don't update global state aggressively on errors
    console.log('⚠️ RELAXED MODE: Not updating rate limit state on error');
    
    return [];
  } finally {
    console.log('🏁 ============ EXTERNAL NEWS FETCH ENDED (RELAXED MODE) ============\n');
  }
};

// Enhanced API test with RELAXED error handling
export const testPartnerAPI = async (ipInfo = { ip: '8.8.8.8' }) => {
  try {
    console.log('\n🧪 ============ API CONNECTIVITY TEST (RELAXED MODE) ============');
    
    if (!PARTNER_API_URL) {
      return { 
        success: false, 
        error: 'PARTNER_API_URL not configured',
        configuredUrl: PARTNER_API_URL 
      };
    }
    
    // 🚨 RELAXED: Always attempt test
    console.log('🧪 RELAXED MODE: Bypassing rate limit checks for test');
    
    const url = new URL(PARTNER_API_URL);
    url.searchParams.set('ip', ipInfo.ip);
    url.searchParams.set('test', 'true');
    url.searchParams.set('environment', isDevelopment ? 'development' : 'production');
    url.searchParams.set('mode', 'relaxed');
    
    const fullUrl = url.toString();
    console.log(`🧪 Testing URL: ${fullUrl}`);
    
    const response = await fetchWithRetry(fullUrl, { method: 'GET' }, 1);
    const responseData = await response.json();
    
    const result = {
      success: true,
      status: response.status,
      statusText: response.statusText,
      articlesCount: responseData?.articles?.length || 0,
      hasArticles: !!responseData?.articles?.length,
      sampleArticle: responseData?.articles?.[0] || null,
      responseKeys: Object.keys(responseData),
      environment: isDevelopment ? 'development' : 'production',
      mode: 'RELAXED',
      totalFetches: global.newsState?.fetchCount || 0
    };
    
    console.log('🧪 Test Results:', {
      success: result.success,
      articlesFound: result.articlesCount,
      environment: result.environment,
      mode: 'RELAXED'
    });
    console.log('🏁 ============ API TEST COMPLETED (RELAXED MODE) ============\n');
    
    return result;
    
  } catch (error) {
    console.error('\n❌ ============ API TEST FAILED ============');
    console.error(`❌ Error: ${error.message}`);
    console.error('🏁 ============ API TEST FAILED ============\n');
    
    // 🚨 RELAXED: Don't update rate limit status on test failures
    console.log('⚠️ RELAXED MODE: Not updating rate limit state on test failure');
    
    return {
      success: false,
      error: error.message,
      configuredUrl: PARTNER_API_URL,
      environment: isDevelopment ? 'development' : 'production',
      mode: 'RELAXED',
      isRateLimit: false // Always false in relaxed mode
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

// Enhanced API routes with RELAXED restrictions
export const createExternalNewsRoute = (router) => {
  // Enhanced test endpoint - RELAXED
  router.get('/test-api', async (req, res) => {
    try {
      const ipInfo = { ip: req.ipAddress || req.query.ip || '8.8.8.8' };
      
      console.log('🧪 RELAXED MODE: API test requested - no rate limit checks');
      
      const testResult = await testPartnerAPI(ipInfo);
      
      res.json({
        ...testResult,
        timestamp: new Date().toISOString(),
        clientIp: ipInfo.ip,
        serverEnvironment: isDevelopment ? 'development' : 'production',
        mode: 'RELAXED - Rate limits disabled'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        environment: isDevelopment ? 'development' : 'production',
        mode: 'RELAXED'
      });
    }
  });
  
  // Manual trigger with RELAXED restrictions
  router.post('/fetch-external-news', async (req, res) => {
    try {
      console.log('📡 RELAXED MODE: Manual external news fetch - bypassing rate limits');
      
      const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
      
      const results = await fetchExternalNewsServer(ipInfo);
      
      res.json({
        success: true,
        articlesProcessed: results.length,
        justInCount: results.filter(r => r.isJustIn).length,
        headlineCount: results.filter(r => !r.isJustIn).length,
        message: `Successfully processed ${results.length} external news articles`,
        environment: isDevelopment ? 'development' : 'production',
        mode: 'RELAXED - No rate limits',
        totalFetches: global.newsState?.fetchCount || 0,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error in manual fetch:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        environment: isDevelopment ? 'development' : 'production',
        mode: 'RELAXED',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Enhanced status endpoint - RELAXED
  router.get('/status', async (req, res) => {
    try {
      res.json({
        serviceStatus: 'active',
        partnerApiUrl: PARTNER_API_URL ? 'configured' : 'NOT CONFIGURED',
        partnerApiConfigured: !!PARTNER_API_URL,
        environment: isDevelopment ? 'development' : 'production',
        timestamp: new Date().toISOString(),
        mode: 'RELAXED MODE - Rate limits disabled',
        fetchStatus: {
          totalFetches: global.newsState?.fetchCount || 0,
          lastFetch: global.newsState?.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
          lastSuccess: global.newsState?.lastSuccessfulFetch ? new Date(global.newsState.lastSuccessfulFetch).toISOString() : 'never',
          consecutiveFailures: global.newsState?.consecutiveFailures || 0,
          currentlyFetching: global.newsState?.isFetching || false
        },
        timingConfig: {
          justInDuration: isDevelopment ? '15 minutes' : '30 minutes',
          headlineDuration: isDevelopment ? '72 hours' : '48 hours',
          fetchInterval: 'No minimum - relaxed mode'
        },
        recommendations: {
          message: 'RELAXED MODE: Rate limiting disabled for debugging',
          currentStrategy: 'Unlimited requests with minimal timing restrictions'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        environment: isDevelopment ? 'development' : 'production',
        mode: 'RELAXED',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Force reset endpoint
  router.post('/force-reset', async (req, res) => {
    try {
      if (global.newsState) {
        global.newsState.consecutiveFailures = 0;
        global.newsState.isFetching = false;
        global.newsState.activeFetchPromise = null;
        console.log('🔄 Force reset completed - all states cleared');
      }
      
      res.json({
        success: true,
        message: 'All fetch states forcefully reset',
        environment: isDevelopment ? 'development' : 'production',
        mode: 'RELAXED',
        newStatus: {
          consecutiveFailures: 0,
          isFetching: false,
          resetTime: new Date().toISOString()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        environment: isDevelopment ? 'development' : 'production'
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