
// Enhanced ServerExternalNewsService.js with partner server wake-up
import fetch from 'node-fetch'; 
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Content, Channel } from '../../models/HeadlineNews/HeadlineModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment setup
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// Load PARTNER_API_URL with fallbacks
let PARTNER_API_URL = process.env.PARTNER_API_URL;

if (!PARTNER_API_URL) {
  const possiblePaths = [
    path.join(__dirname, '../../../.env'),
    path.join(__dirname, '../../.env'),
    path.join(process.cwd(), '.env')
  ];
  
  for (const envPath of possiblePaths) {
    try {
      const result = dotenv.config({ path: envPath });
      if (result.parsed?.PARTNER_API_URL) {
        PARTNER_API_URL = result.parsed.PARTNER_API_URL;
        console.log(`✅ Loaded PARTNER_API_URL from: ${envPath}`);
        break;
      }
    } catch (error) {
      continue;
    }
  }
}

// Rate limiting state
const rateLimitState = {
  isRateLimited: false,
  rateLimitUntil: null,
  consecutiveFailures: 0
};

// Partner server wake-up state
const partnerState = {
  lastWakeAttempt: 0,
  isAwake: false,
  wakeupInProgress: false
};

// Check if we can make requests
const canMakeRequest = () => {
  if (!rateLimitState.isRateLimited) return true;
  
  const now = Date.now();
  if (now >= rateLimitState.rateLimitUntil) {
    rateLimitState.isRateLimited = false;
    rateLimitState.rateLimitUntil = null;
    console.log('✅ Rate limit expired');
    return true;
  }
  
  return false;
};

// Handle rate limit responses
const handleRateLimit = (response) => {
  const retryAfter = response.headers.get('retry-after');
  const waitTime = retryAfter ? parseInt(retryAfter) : 300; // Default 5 minutes
  
  rateLimitState.isRateLimited = true;
  rateLimitState.rateLimitUntil = Date.now() + (waitTime * 1000);
  rateLimitState.consecutiveFailures++;
  
  console.log(`🚫 Rate limited for ${waitTime} seconds`);
};

// Safer partner server wake-up function
const wakeUpPartnerServer = async () => {
  try {
    const partnerApiUrl = process.env.PARTNER_API_URL;
    if (!partnerApiUrl) {
      console.log('❌ No partner API URL configured for wake-up');
      return false;
    }

    // Create URL object to safely extract base URL
    const url = new URL(partnerApiUrl);
    const baseUrl = `${url.protocol}//${url.host}`; // Always gives clean base URL
    
    console.log('🔔 Original API URL:', partnerApiUrl);
    console.log('🔔 Extracted base URL for wake-up:', baseUrl);

    const response = await fetch(baseUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'TruePaceNewsApp-WakeUp/1.0',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    });

    if (response.ok || response.status < 500) {
      console.log(`✅ Partner server wake-up successful (${response.status})`);
      return true;
    } else {
      console.log(`⚠️ Partner server responded with ${response.status}, but it's awake`);
      return true; // Still counts as awake
    }

  } catch (error) {
    console.error(`❌ Partner wake-up failed: ${error.message}`);
    return false;
  }
};

// Enhanced fetch with retry logic and partner wake-up
const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 75000); // Increased timeout for slow wake-ups
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TruePaceNewsApp/1.0',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          ...options.headers
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.status === 429) {
        handleRateLimit(response);
        throw new Error(`Rate limit: ${response.status}`);
      }
      
      if (!response.ok) {
        // If it's a server error or timeout, try to wake up partner
        if ((response.status >= 500 || response.status === 503) && attempt === 1) {
          console.log(`🚨 Server error ${response.status} - attempting partner wake-up`);
          const wakeupSuccess = await wakeUpPartnerServer();
          
          if (wakeupSuccess && attempt < maxRetries) {
            console.log(`🔄 Retrying after wake-up...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
        }
        
        if (attempt < maxRetries && response.status >= 500) {
          console.log(`⏳ Server error ${response.status}, retrying attempt ${attempt + 1}...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 3000));
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      // Reset rate limit state on success
      rateLimitState.consecutiveFailures = 0;
      partnerState.isAwake = true;
      return response;
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      
      // If it's a connection error and first attempt, try wake-up
      if ((error.message.includes('ECONNREFUSED') || 
           error.message.includes('ETIMEDOUT') || 
           error.message.includes('fetch failed')) && attempt === 1) {
        
        console.log('🚨 Connection error - attempting partner wake-up');
        const wakeupSuccess = await wakeUpPartnerServer();
        
        if (wakeupSuccess && attempt < maxRetries) {
          console.log('🔄 Retrying after wake-up...');
          await new Promise(resolve => setTimeout(resolve, 8000)); // Longer wait after wake-up
          continue;
        }
      }
      
      if (attempt < maxRetries && !error.message.includes('Rate limit')) {
        await new Promise(resolve => setTimeout(resolve, attempt * 4000));
      } else {
        throw error;
      }
    }
  }
};

// API call with fallback IPs and wake-up logic
const makeAPICall = async (ipInfo) => {
  // First, try to ensure partner server is awake
  const now = Date.now();
  if (!partnerState.isAwake || (now - partnerState.lastWakeAttempt > 300000)) { // 5 minutes
    console.log('🔔 Pre-emptive partner server wake-up...');
    await wakeUpPartnerServer();
  }

  const fallbackIPs = [
    ipInfo.ip,
    '8.8.8.8',
    '1.1.1.1',
    '208.67.222.222'
  ];
  
  for (const ip of fallbackIPs) {
    try {
      const url = new URL(PARTNER_API_URL);
      url.searchParams.set('ip', ip);
      url.searchParams.set('timestamp', Date.now().toString());
      
      console.log(`🎯 Trying IP: ${ip}`);
      
      const response = await fetchWithRetry(url.toString());
      const data = await response.json();
      
      console.log(`✅ Success with IP ${ip}: ${data.articles?.length || 0} articles`);
      return data;
      
    } catch (error) {
      console.error(`❌ Failed with IP ${ip}:`, error.message);
      
      if (error.message.includes('Rate limit')) {
        await new Promise(resolve => setTimeout(resolve, 30000));
      } else {
        // Try next IP after a brief delay
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  
  throw new Error('All fallback IPs failed after wake-up attempts');
};

// Create or get external channel
const createOrGetChannel = async (sourceName) => {
  try {
    let channel = await Channel.findOne({ 
      name: sourceName,
      isExternal: true 
    });
    
    if (!channel) {
      channel = await Channel.create({
        name: sourceName,
        picture: '/NopicAvatar.png',
        description: `External news from ${sourceName}`,
        tags: ['external'],
        isExternal: true,
        contentCount: 0,
        totalViews: 0,
        avgEngagementRate: 0,
        subscriberCount: 0
      });
      console.log(`✅ Created channel: ${sourceName}`);
    }
    
    return channel;
  } catch (error) {
    console.error(`❌ Channel creation failed for ${sourceName}:`, error.message);
    throw error;
  }
};

// Generate stable hash for deduplication
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

// Check for duplicates
const isDuplicate = async (article) => {
  const stableId = createStableHash(article.url, article.title);
  
  const existing = await Content.findOne({
    $or: [
      { externalId: stableId },
      { originalUrl: article.url },
      {
        message: { $regex: `^${article.title.substring(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' },
        source: 'external',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    ]
  }).lean();
  
  return { isDuplicate: !!existing, stableId };
};

// MAIN FUNCTION: Fetch external news with enhanced error handling
export const fetchExternalNewsServer = async (ipInfo = { ip: '8.8.8.8' }) => {
  const startTime = Date.now();
  
  try {
    console.log('\n🚀 ============ EXTERNAL NEWS FETCH STARTED ============');
    console.log(`🔍 Using IP: ${ipInfo.ip}`);
    console.log(`🌐 Partner API: ${PARTNER_API_URL}`);
    
    if (!PARTNER_API_URL) {
      console.error('❌ PARTNER_API_URL not configured');
      return [];
    }
    
    if (!canMakeRequest()) {
      const waitTime = Math.ceil((rateLimitState.rateLimitUntil - Date.now()) / 1000);
      console.log(`⏳ Rate limited for ${waitTime} seconds`);
      return [];
    }
    
    const data = await makeAPICall(ipInfo);
    
    if (!data.articles?.length) {
      console.log('ℹ️ No articles received from partner API');
      return [];
    }
    
    console.log(`📦 Processing ${data.articles.length} articles from partner`);
    
    const results = [];
    const processedUrls = new Set();
    const maxArticles = isDevelopment ? 25 : 40;
    
    const validArticles = data.articles
      .filter(article => article?.title && article?.url && article.title.length > 5)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, maxArticles);

    for (const article of validArticles) {
      try {
        if (processedUrls.has(article.url.toLowerCase())) continue;
        
        const duplicateCheck = await isDuplicate(article);
        if (duplicateCheck.isDuplicate) {
          console.log(`⚠️ Duplicate: ${article.title.substring(0, 40)}...`);
          continue;
        }
        
        processedUrls.add(article.url.toLowerCase());
        
        const sourceName = article.source?.name || article.source || 'External News';
        const channel = await createOrGetChannel(sourceName);
        
        const now = new Date();
        const publishedAt = article.publishedAt ? new Date(article.publishedAt) : now;
        const timeSincePublished = now - publishedAt;
        
        // Skip articles older than 48 hours
        const maxAge = 48 * 60 * 60 * 1000;
        if (timeSincePublished > maxAge) {
          console.log(`⏰ Too old: ${article.title.substring(0, 40)}...`);
          continue;
        }
        
        // Just In for first 15 minutes
        const justInDuration = 15 * 60 * 1000;
        const isJustIn = timeSincePublished < justInDuration;
        const justInExpiresAt = isJustIn ? new Date(publishedAt.getTime() + justInDuration) : null;
        const headlineExpiresAt = new Date(publishedAt.getTime() + maxAge);
        
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
        console.log(`✅ ${destination}: ${article.title.substring(0, 40)}...`);
        
      } catch (error) {
        if (error.code === 11000) continue; // Duplicate key
        console.error(`❌ Error processing article: ${error.message}`);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Completed: ${results.length} articles saved in ${duration}ms`);
    console.log(`🏷️ Just In: ${results.filter(r => r.isJustIn).length}, Headlines: ${results.filter(r => !r.isJustIn).length}`);
    
    return results;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Fetch failed in ${duration}ms:`, error.message);
    
    // If we get repeated failures, mark partner as not awake
    if (error.message.includes('fetch failed') || error.message.includes('ETIMEDOUT')) {
      partnerState.isAwake = false;
      console.log('💤 Marking partner server as asleep due to connection failures');
    }
    
    return [];
  } finally {
    console.log('🏁 ============ EXTERNAL NEWS FETCH ENDED ============\n');
  }
};

// Test API connection with wake-up
export const testPartnerAPI = async (ipInfo = { ip: '8.8.8.8' }) => {
  try {
    if (!PARTNER_API_URL) {
      return { success: false, error: 'PARTNER_API_URL not configured' };
    }
    
    if (!canMakeRequest()) {
      const waitTime = Math.ceil((rateLimitState.rateLimitUntil - Date.now()) / 1000);
      return { success: false, error: `Rate limited for ${waitTime} seconds`, isRateLimited: true };
    }
    
    // Try to wake up partner first
    console.log('🔔 Testing API with wake-up...');
    await wakeUpPartnerServer();
    
    const url = new URL(PARTNER_API_URL);
    url.searchParams.set('ip', ipInfo.ip);
    url.searchParams.set('test', 'true');
    
    const response = await fetchWithRetry(url.toString());
    const data = await response.json();
    
    return {
      success: true,
      status: response.status,
      articlesCount: data?.articles?.length || 0,
      hasArticles: !!data?.articles?.length,
      sampleTitle: data?.articles?.[0]?.title || null,
      partnerServerAwake: partnerState.isAwake
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      isRateLimit: error.message.includes('Rate limit'),
      partnerServerAwake: partnerState.isAwake
    };
  }
};

// Refresh external channels
export const refreshExternalChannelsServer = async () => {
  try {
    console.log('🔄 Refreshing external channels...');
    
    const sources = await Content.distinct('originalSource', { 
      source: 'external',
      originalSource: { $exists: true, $ne: null }
    });
    
    for (const source of sources) {
      await createOrGetChannel(source);
    }
    
    console.log(`✅ Refreshed ${sources.length} external channels`);
    return true;
  } catch (error) {
    console.error('❌ Channel refresh failed:', error);
    return false;
  }
};

// Export wake up function for external use
export const wakeUpPartner = wakeUpPartnerServer;

// Enhanced API routes
export const createExternalNewsRoute = (router) => {
  // Wake up partner endpoint
  router.post('/wake-partner', async (req, res) => {
    try {
      console.log('🔔 Manual partner wake-up requested');
      const success = await wakeUpPartnerServer();
      
      res.json({
        success: success,
        message: success ? 'Partner server wake-up successful' : 'Partner server wake-up failed',
        partnerAwake: partnerState.isAwake,
        lastWakeAttempt: new Date(partnerState.lastWakeAttempt).toISOString(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Test API endpoint with wake-up
  router.get('/test-api', async (req, res) => {
    try {
      const ipInfo = { ip: req.ipAddress || req.query.ip || '8.8.8.8' };
      const result = await testPartnerAPI(ipInfo);
      
      res.json({
        ...result,
        timestamp: new Date().toISOString(),
        environment: isDevelopment ? 'development' : 'production',
        partnerState: {
          isAwake: partnerState.isAwake,
          lastWakeAttempt: partnerState.lastWakeAttempt ? 
            new Date(partnerState.lastWakeAttempt).toISOString() : 'never'
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
  
  // Manual fetch endpoint with wake-up
  router.post('/fetch', async (req, res) => {
    try {
      if (!canMakeRequest()) {
        const waitTime = Math.ceil((rateLimitState.rateLimitUntil - Date.now()) / 1000);
        return res.json({
          success: false,
          message: `Rate limited. Wait ${waitTime} seconds.`,
          isRateLimited: true,
          waitTime: waitTime
        });
      }
      
      const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
      const results = await fetchExternalNewsServer(ipInfo);
      
      res.json({
        success: true,
        articlesProcessed: results.length,
        justInCount: results.filter(r => r.isJustIn).length,
        headlineCount: results.filter(r => !r.isJustIn).length,
        partnerAwake: partnerState.isAwake,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Enhanced status endpoint
  router.get('/status', (req, res) => {
    const canFetch = canMakeRequest();
    const waitTime = rateLimitState.isRateLimited ? 
      Math.ceil((rateLimitState.rateLimitUntil - Date.now()) / 1000) : 0;
    
    res.json({
      serviceStatus: 'active',
      partnerApiConfigured: !!PARTNER_API_URL,
      partnerApiUrl: PARTNER_API_URL ? PARTNER_API_URL.replace(/\/[^/]*$/, '/***') : 'not_configured',
      environment: isDevelopment ? 'development' : 'production',
      canMakeRequest: canFetch,
      rateLimitStatus: {
        isRateLimited: rateLimitState.isRateLimited,
        waitTime: waitTime,
        consecutiveFailures: rateLimitState.consecutiveFailures
      },
      partnerStatus: {
        isAwake: partnerState.isAwake,
        lastWakeAttempt: partnerState.lastWakeAttempt ? 
          new Date(partnerState.lastWakeAttempt).toISOString() : 'never',
        wakeupInProgress: partnerState.wakeupInProgress
      },
      fetchStatus: {
        totalFetches: global.newsState?.fetchCount || 0,
        lastFetch: global.newsState?.lastFetch ? 
          new Date(global.newsState.lastFetch).toISOString() : 'never',
        currentlyFetching: global.newsState?.isFetching || false
      },
      timestamp: new Date().toISOString()
    });
  });
};