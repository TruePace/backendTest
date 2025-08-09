// ServerExternalNewsService.js - Enhanced with smart rate limit handling
import fetch from 'node-fetch'; 
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Content, Channel } from '../../models/HeadlineNews/HeadlineModel.js';

const activeRequests = new Map();
const recentlyProcessed = new Set();

// Rate limit tracking
const rateLimitState = {
  isRateLimited: false,
  rateLimitUntil: null,
  consecutiveRateLimits: 0,
  lastSuccessfulRequest: null,
  backoffMultiplier: 1
};

// Get current directory for .env loading
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// Load environment variables with multiple fallbacks
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

// Enhanced rate limit detection and handling
const checkRateLimit = () => {
  const now = Date.now();
  
  // Check if we're still in a rate limit period
  if (rateLimitState.isRateLimited && rateLimitState.rateLimitUntil) {
    if (now < rateLimitState.rateLimitUntil) {
      const waitTime = Math.ceil((rateLimitState.rateLimitUntil - now) / 1000);
      console.log(`⏳ Still rate limited for ${waitTime} seconds`);
      return { canProceed: false, waitTime };
    } else {
      // Rate limit period has passed
      console.log('✅ Rate limit period expired, resetting state');
      rateLimitState.isRateLimited = false;
      rateLimitState.rateLimitUntil = null;
    }
  }
  
  return { canProceed: true, waitTime: 0 };
};

const handleRateLimit = (response) => {
  const now = Date.now();
  rateLimitState.consecutiveRateLimits++;
  rateLimitState.isRateLimited = true;
  
  // Try to get rate limit info from headers
  const retryAfter = response.headers.get('retry-after');
  const rateLimitReset = response.headers.get('x-ratelimit-reset');
  
  let waitTime;
  
  if (retryAfter) {
    // Retry-After can be in seconds or HTTP date
    const retrySeconds = parseInt(retryAfter);
    waitTime = isNaN(retrySeconds) ? 900 : Math.min(retrySeconds, 3600); // Max 1 hour
  } else if (rateLimitReset) {
    const resetTime = parseInt(rateLimitReset) * 1000;
    waitTime = Math.max(0, Math.min((resetTime - now) / 1000, 3600));
  } else {
    // Dynamic backoff based on consecutive failures
    const baseWait = 300; // 5 minutes base
    const maxWait = 1800; // 30 minutes max
    waitTime = Math.min(baseWait * Math.pow(1.5, rateLimitState.consecutiveRateLimits - 1), maxWait);
  }
  
  rateLimitState.rateLimitUntil = now + (waitTime * 1000);
  rateLimitState.backoffMultiplier = Math.min(rateLimitState.backoffMultiplier * 1.5, 4);
  
  console.log(`🚫 Rate limited! Waiting ${Math.ceil(waitTime)} seconds. Consecutive failures: ${rateLimitState.consecutiveRateLimits}`);
  
  return { waitTime, rateLimitUntil: rateLimitState.rateLimitUntil };
};

const resetRateLimitState = () => {
  rateLimitState.consecutiveRateLimits = 0;
  rateLimitState.backoffMultiplier = 1;
  rateLimitState.lastSuccessfulRequest = Date.now();
  console.log('✅ Rate limit state reset after successful request');
};

// Enhanced fetch with intelligent retry and rate limit handling
const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
  // Check rate limit before making request
  const rateLimitCheck = checkRateLimit();
  if (!rateLimitCheck.canProceed) {
    throw new Error(`Rate limited for ${rateLimitCheck.waitTime} seconds`);
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 API attempt ${attempt}/${maxRetries} to: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`⏰ Request timeout after 60 seconds on attempt ${attempt}`);
        controller.abort();
      }, 60000); // Increased timeout for free hosting
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TruePaceNewsApp/1.0',
          'Accept': 'application/json',
          'X-Client-Version': '1.0.0',
          'Cache-Control': 'no-cache',
          'X-Forwarded-For': options.clientIp || '8.8.8.8',
          'X-Real-IP': options.clientIp || '8.8.8.8',
          ...options.headers
        }
      });
      
      clearTimeout(timeoutId);
      
      console.log(`📡 Response: ${response.status} ${response.statusText}`);
      
      // Handle rate limiting
      if (response.status === 429) {
        const errorText = await response.text();
        console.error(`🚫 Rate limit detected: ${response.status} - ${errorText}`);
        
        handleRateLimit(response);
        
        // Only retry if we have attempts left and backoff isn't too high
        if (attempt < maxRetries && rateLimitState.backoffMultiplier < 3) {
          const waitTime = Math.min(30 * attempt, 120); // 30s, 60s, 120s
          console.log(`⏳ Waiting ${waitTime}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          continue;
        }
        
        throw new Error(`Rate limit reached: ${errorText}`);
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // Server errors - retry
        if (attempt < maxRetries && (response.status >= 500 || response.status === 408)) {
          console.log(`⏳ Server error ${response.status}, retrying in ${attempt * 2}s...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
          continue;
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      // Success - reset rate limit state
      resetRateLimitState();
      return response;
      
    } catch (error) {
      console.error(`❌ Fetch attempt ${attempt} failed:`, error.message);
      
      // Network errors - don't retry
      if (error.name === 'AbortError' || error.code === 'ECONNREFUSED') {
        throw error;
      }
      
      // Rate limit errors - don't retry if we're backing off
      if (error.message.includes('Rate limited for') || error.message.includes('Rate limit reached')) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const waitTime = Math.min(attempt * 3000, 10000); // Progressive backoff
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw error;
      }
    }
  }
};

// Enhanced API call with multiple fallback strategies
const makeAPICallWithFallbacks = async (ipInfo) => {
  const strategies = [
    // Strategy 1: Use provided IP
    { ip: ipInfo.ip, description: 'Original IP' },
    
    // Strategy 2: Use common public IPs as fallback
    { ip: '8.8.8.8', description: 'Google DNS' },
    { ip: '1.1.1.1', description: 'Cloudflare DNS' },
    
    // Strategy 3: Use different IP ranges
    { ip: '208.67.222.222', description: 'OpenDNS' },
  ];
  
  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    
    try {
      console.log(`🎯 Trying strategy ${i + 1}: ${strategy.description} (${strategy.ip})`);
      
      const url = new URL(PARTNER_API_URL);
      url.searchParams.set('ip', strategy.ip);
      url.searchParams.set('timestamp', Date.now().toString());
      url.searchParams.set('environment', isDevelopment ? 'development' : 'production');
      url.searchParams.set('strategy', `fallback_${i + 1}`);
      
      const response = await fetchWithRetry(url.toString(), { 
        method: 'GET',
        clientIp: strategy.ip
      }, 2); // Reduced retries per strategy
      
      const data = await response.json();
      console.log(`✅ Strategy ${i + 1} succeeded with ${data.articles?.length || 0} articles`);
      
      return data;
      
    } catch (error) {
      console.error(`❌ Strategy ${i + 1} failed: ${error.message}`);
      
      // If it's a rate limit error, wait before trying next strategy
      if (error.message.includes('Rate limit') || error.message.includes('429')) {
        console.log('⏳ Rate limited, waiting 30s before next strategy...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
      
      // If this was the last strategy, throw the error
      if (i === strategies.length - 1) {
        throw error;
      }
      
      // Wait between strategies to avoid rapid requests
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

// Create or get channel for external source (unchanged but with better error handling)
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
      console.error(`❌ Channel creation attempt ${attempt} failed:`, error.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } else {
        throw error;
      }
    }
  }
};

// Enhanced unique ID generation (unchanged)
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

// Enhanced duplicate detection (unchanged)
const isDuplicate = async (article) => {
  const stableId = createStableHash(article.url, article.title);
  
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

// MAIN FUNCTION - Enhanced with better rate limit handling
export const fetchExternalNewsServer = async (ipInfo = { ip: '8.8.8.8' }) => {
  const startTime = Date.now();
  
  try {
    console.log('\n🚀 ============ EXTERNAL NEWS FETCH STARTED (ENHANCED) ============');
    console.log(`🔍 Using IP: ${ipInfo.ip}`);
    console.log(`🌍 Environment: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
    console.log(`⏰ Total API calls so far: ${global.newsState?.fetchCount || 0}`);
    console.log(`🚫 Rate limit state: ${rateLimitState.isRateLimited ? 'ACTIVE' : 'CLEAR'}`);
    
    if (!PARTNER_API_URL) {
      console.error('❌ PARTNER_API_URL not configured');
      return [];
    }
    
    // Check if we're rate limited
    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.canProceed) {
      console.log(`⏳ Skipping fetch - rate limited for ${rateLimitCheck.waitTime} seconds`);
      return [];
    }
    
    // Use fallback strategies for API calls
    const data = await makeAPICallWithFallbacks(ipInfo);
    
    if (!data.articles?.length) {
      console.log('ℹ️ No articles received from API');
      return [];
    }
    
    console.log(`📦 Received ${data.articles.length} articles from API`);
    
    // Process articles (same logic as before)
    const results = [];
    const processedUrls = new Set();
    
    const maxArticlesToProcess = isDevelopment ? 25 : 40;
    
    const sortedArticles = data.articles
      .filter(article => {
        if (!article?.title || !article?.url) return false;
        if (article.title.length < 5) return false;
        if (article.url.includes('localhost')) return false;
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, maxArticlesToProcess);

    console.log(`📝 Processing ${sortedArticles.length}/${data.articles.length} articles`);

    for (let i = 0; i < sortedArticles.length; i++) {
      const article = sortedArticles[i];
      
      try {
        if (processedUrls.has(article.url.toLowerCase())) {
          continue;
        }
        
        const duplicateCheck = await isDuplicate(article);
        if (duplicateCheck.isDuplicate) {
          console.log(`⚠️ Duplicate skipped: ${article.title.substring(0, 40)}...`);
          continue;
        }
        
        processedUrls.add(article.url.toLowerCase());
        
        const sourceName = article.source?.name || article.source || 'External News';
        const channel = await createOrGetChannelForExternalSource(sourceName);
        
        const now = new Date();
        const publishedAt = article.publishedAt ? new Date(article.publishedAt) : now;
        const timeSincePublished = now - publishedAt;
        
        // 48 hours for external news as per your requirement
        const maxAge = 48 * 60 * 60 * 1000;
          
        if (timeSincePublished > maxAge) {
          console.log(`⏰ Skipping old article (${Math.round(timeSincePublished / (60 * 60 * 1000))}h old): ${article.title.substring(0, 40)}...`);
          continue;
        }
        
        // Just In duration: 15 minutes as per your requirement
        const justInDuration = 15 * 60 * 1000;
        const isJustIn = timeSincePublished < justInDuration;
        const justInExpiresAt = isJustIn ? new Date(publishedAt.getTime() + justInDuration) : null;
        const headlineExpiresAt = new Date(publishedAt.getTime() + maxAge);
        
        let message = article.title.trim();
        if (article.description?.trim() && article.description.length > 5) {
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
        
        // Small delay to prevent overwhelming the database
        if (i < sortedArticles.length - 1 && i % 10 === 9) {
          await new Promise(resolve => setTimeout(resolve, 100));
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
    
    // Don't reset rate limit state on regular errors
    if (error.message.includes('Rate limit')) {
      console.log('⚠️ Rate limit error - state maintained');
    }
    
    return [];
  } finally {
    console.log('🏁 ============ EXTERNAL NEWS FETCH ENDED (ENHANCED) ============\n');
  }
};

// Enhanced API test function
export const testPartnerAPI = async (ipInfo = { ip: '8.8.8.8' }) => {
  try {
    console.log('\n🧪 ============ API CONNECTIVITY TEST (ENHANCED) ============');
    
    if (!PARTNER_API_URL) {
      return { 
        success: false, 
        error: 'PARTNER_API_URL not configured',
        configuredUrl: PARTNER_API_URL 
      };
    }
    
    console.log(`🧪 Rate limit state: ${rateLimitState.isRateLimited ? 'RATE LIMITED' : 'CLEAR'}`);
    
    // Check rate limit before test
    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.canProceed) {
      return {
        success: false,
        error: `Currently rate limited for ${rateLimitCheck.waitTime} seconds`,
        isRateLimited: true,
        waitTime: rateLimitCheck.waitTime
      };
    }
    
    const url = new URL(PARTNER_API_URL);
    url.searchParams.set('ip', ipInfo.ip);
    url.searchParams.set('test', 'true');
    url.searchParams.set('environment', isDevelopment ? 'development' : 'production');
    
    const fullUrl = url.toString();
    console.log(`🧪 Testing URL: ${fullUrl}`);
    
    const response = await fetchWithRetry(fullUrl, { 
      method: 'GET',
      clientIp: ipInfo.ip
    }, 1);
    
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
      rateLimitState: {
        isRateLimited: rateLimitState.isRateLimited,
        consecutiveFailures: rateLimitState.consecutiveRateLimits,
        lastSuccess: rateLimitState.lastSuccessfulRequest
      }
    };
    
    console.log('🧪 Test Results:', {
      success: result.success,
      articlesFound: result.articlesCount,
      rateLimited: rateLimitState.isRateLimited
    });
    console.log('🏁 ============ API TEST COMPLETED (ENHANCED) ============\n');
    
    return result;
    
  } catch (error) {
    console.error('\n❌ ============ API TEST FAILED ============');
    console.error(`❌ Error: ${error.message}`);
    console.error('🏁 ============ API TEST FAILED ============\n');
    
    return {
      success: false,
      error: error.message,
      configuredUrl: PARTNER_API_URL,
      isRateLimit: error.message.includes('Rate limit') || error.message.includes('429'),
      rateLimitState: {
        isRateLimited: rateLimitState.isRateLimited,
        consecutiveFailures: rateLimitState.consecutiveRateLimits
      }
    };
  }
};

// Refresh external channels (unchanged)
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

// Enhanced API routes with rate limit awareness
export const createExternalNewsRoute = (router) => {
  // Enhanced test endpoint
  router.get('/test-api', async (req, res) => {
    try {
      const ipInfo = { ip: req.ipAddress || req.query.ip || '8.8.8.8' };
      const testResult = await testPartnerAPI(ipInfo);
      
      res.json({
        ...testResult,
        timestamp: new Date().toISOString(),
        clientIp: ipInfo.ip,
        serverEnvironment: isDevelopment ? 'development' : 'production',
        rateLimitInfo: {
          isRateLimited: rateLimitState.isRateLimited,
          rateLimitUntil: rateLimitState.rateLimitUntil,
          consecutiveFailures: rateLimitState.consecutiveRateLimits
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        environment: isDevelopment ? 'development' : 'production'
      });
    }
  });
  
  // Manual trigger with rate limit check
  router.post('/fetch-external-news', async (req, res) => {
    try {
      const rateLimitCheck = checkRateLimit();
      if (!rateLimitCheck.canProceed) {
        return res.json({
          success: false,
          message: `Currently rate limited. Please wait ${rateLimitCheck.waitTime} seconds.`,
          isRateLimited: true,
          waitTime: rateLimitCheck.waitTime,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log('📡 Manual external news fetch requested');
      const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
      const results = await fetchExternalNewsServer(ipInfo);
      
      res.json({
        success: true,
        articlesProcessed: results.length,
        justInCount: results.filter(r => r.isJustIn).length,
        headlineCount: results.filter(r => !r.isJustIn).length,
        message: `Successfully processed ${results.length} external news articles`,
        environment: isDevelopment ? 'development' : 'production',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error in manual fetch:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        isRateLimit: error.message.includes('Rate limit'),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Enhanced status endpoint with rate limit info
  router.get('/status', async (req, res) => {
    try {
      res.json({
        serviceStatus: 'active',
        partnerApiUrl: PARTNER_API_URL ? 'configured' : 'NOT CONFIGURED',
        partnerApiConfigured: !!PARTNER_API_URL,
        environment: isDevelopment ? 'development' : 'production',
        timestamp: new Date().toISOString(),
        fetchStatus: {
          totalFetches: global.newsState?.fetchCount || 0,
          lastFetch: global.newsState?.lastFetch ? new Date(global.newsState.lastFetch).toISOString() : 'never',
          lastSuccess: global.newsState?.lastSuccessfulFetch ? new Date(global.newsState.lastSuccessfulFetch).toISOString() : 'never',
          consecutiveFailures: global.newsState?.consecutiveFailures || 0,
          currentlyFetching: global.newsState?.isFetching || false
        },
        rateLimitStatus: {
          isRateLimited: rateLimitState.isRateLimited,
          rateLimitUntil: rateLimitState.rateLimitUntil ? new Date(rateLimitState.rateLimitUntil).toISOString() : null,
          consecutiveRateLimits: rateLimitState.consecutiveRateLimits,
          lastSuccessfulRequest: rateLimitState.lastSuccessfulRequest ? new Date(rateLimitState.lastSuccessfulRequest).toISOString() : 'never',
          backoffMultiplier: rateLimitState.backoffMultiplier
        },
        timingConfig: {
          justInDuration: '15 minutes',
          headlineDuration: '48 hours',
          fetchStrategy: 'Multiple IP fallbacks with intelligent rate limiting'
        },
        recommendations: {
          message: rateLimitState.isRateLimited ? 
            `Currently rate limited. Wait ${Math.ceil((rateLimitState.rateLimitUntil - Date.now()) / 1000)}s before next attempt.` :
            'Service ready for requests',
          currentStrategy: 'Enhanced fallback system with rate limit handling'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        environment: isDevelopment ? 'development' : 'production',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Force reset rate limit endpoint
  router.post('/reset-rate-limit', async (req, res) => {
    try {
      const oldState = { ...rateLimitState };
      
      // Reset rate limit state
      rateLimitState.isRateLimited = false;
      rateLimitState.rateLimitUntil = null;
      rateLimitState.consecutiveRateLimits = 0;
      rateLimitState.backoffMultiplier = 1;
      
      // Also reset global news state
      if (global.newsState) {
        global.newsState.consecutiveFailures = 0;
        global.newsState.isFetching = false;
        global.newsState.activeFetchPromise = null;
      }
      
      console.log('🔄 Rate limit state forcefully reset');
      
      res.json({
        success: true,
        message: 'Rate limit state forcefully reset',
        previousState: {
          isRateLimited: oldState.isRateLimited,
          consecutiveFailures: oldState.consecutiveRateLimits,
          rateLimitUntil: oldState.rateLimitUntil ? new Date(oldState.rateLimitUntil).toISOString() : null
        },
        newState: {
          isRateLimited: rateLimitState.isRateLimited,
          consecutiveFailures: rateLimitState.consecutiveRateLimits,
          resetTime: new Date().toISOString()
        },
        environment: isDevelopment ? 'development' : 'production'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        environment: isDevelopment ? 'development' : 'production'
      });
    }
  });
  
  // Get rate limit status endpoint
  router.get('/rate-limit-status', (req, res) => {
    const now = Date.now();
    const canProceed = checkRateLimit().canProceed;
    
    res.json({
      rateLimitStatus: {
        isRateLimited: rateLimitState.isRateLimited,
        canMakeRequest: canProceed,
        rateLimitUntil: rateLimitState.rateLimitUntil,
        waitTime: rateLimitState.rateLimitUntil ? Math.max(0, Math.ceil((rateLimitState.rateLimitUntil - now) / 1000)) : 0,
        consecutiveRateLimits: rateLimitState.consecutiveRateLimits,
        backoffMultiplier: rateLimitState.backoffMultiplier,
        lastSuccessfulRequest: rateLimitState.lastSuccessfulRequest
      },
      recommendations: canProceed ? 
        'Ready for API requests' : 
        `Wait ${Math.ceil((rateLimitState.rateLimitUntil - now) / 1000)} seconds before next request`,
      timestamp: new Date().toISOString()
    });
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

