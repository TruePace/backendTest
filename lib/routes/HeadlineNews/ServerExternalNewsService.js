// ServerExternalNewsService.js - Enhanced version with better environment variable handling
import fetch from 'node-fetch'; 
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Content, Channel } from '../../models/HeadlineNews/HeadlineModel.js';

const activeRequests = new Map(); // Track ongoing requests
const recentlyProcessed = new Set(); // Cache recently processed items

// Get current directory for .env loading
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force reload environment variables with multiple path attempts
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
        console.log('🔍 PARTNER_API_URL loaded:', result.parsed.PARTNER_API_URL);
        return result.parsed.PARTNER_API_URL;
      }
    } catch (error) {
      // Continue to next path
    }
  }
  
  return null;
};

// Try to load from environment or .env file
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
  console.error('📋 All environment variables related to API:');
  Object.keys(process.env).forEach(key => {
    if (key.includes('PARTNER') || key.includes('API') || key.includes('URL')) {
      console.error(`${key}: ${process.env[key]}`);
    }
  });
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

// Enhanced fetch with better error handling and retry logic
const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 Fetch attempt ${attempt}/${maxRetries} to: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`⏰ Request timeout after 45 seconds on attempt ${attempt}`);
        controller.abort();
      }, 45000);
      
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
      
      console.log(`📡 Response received - Status: ${response.status} ${response.statusText}`);
      console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      return response;
      
    } catch (error) {
      console.error(`❌ Fetch attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        const waitTime = Math.min(attempt * 2000, 10000); // Max 10 second wait
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




// Enhanced unique ID generation with normalization
const createUniqueId = (url, title) => {
  const normalizeUrl = (url) => {
    try {
      const urlObj = new URL(url);
      // Remove tracking parameters and fragments
      const paramsToRemove = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'ref', 'source', 'campaign', '_source'
      ];
      paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
      urlObj.hash = '';
      
      // Normalize path (remove trailing slashes, convert to lowercase)
      urlObj.pathname = urlObj.pathname.toLowerCase().replace(/\/+$/, '') || '/';
      
      return urlObj.toString().toLowerCase();
    } catch {
      return url.toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
    }
  };

  const normalizeTitle = (title) => {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, '') // Remove all spaces
      .substring(0, 100); // Limit length
  };

  const normalizedUrl = normalizeUrl(url);
  const normalizedTitle = normalizeTitle(title);
  const combinedString = `${normalizedUrl}::${normalizedTitle}`;
  
  // Create hash
  let hash = 0;
  for (let i = 0; i < combinedString.length; i++) {
    const char = combinedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `ext-${Math.abs(hash).toString(36)}`;
};

// Enhanced duplicate detection with multiple strategies
const isDuplicateArticle = async (article, processedInBatch = new Set()) => {
  try {
    const uniqueId = createUniqueId(article.url, article.title);
    const normalizedUrl = article.url.toLowerCase().trim();
    const normalizedTitle = article.title.toLowerCase().trim();
    
    // Strategy 1: Check against current batch processing
    if (processedInBatch.has(uniqueId) || 
        processedInBatch.has(normalizedUrl) || 
        processedInBatch.has(normalizedTitle)) {
      return { isDuplicate: true, reason: 'duplicate_in_batch', uniqueId };
    }
    
    // Strategy 2: Check recently processed cache
    if (recentlyProcessed.has(uniqueId)) {
      return { isDuplicate: true, reason: 'recently_processed', uniqueId };
    }
    
    // Strategy 3: Check active requests
    if (activeRequests.has(uniqueId)) {
      return { isDuplicate: true, reason: 'currently_processing', uniqueId };
    }
    
    // Strategy 4: Database check with multiple conditions
    const existingContent = await Content.findOne({
      $or: [
        { externalId: uniqueId },
        { originalUrl: article.url },
        { originalUrl: normalizedUrl },
        // Title similarity check (exact match)
        { 
          message: { 
            $regex: `^${article.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            $options: 'i'
          },
          source: 'external'
        },
        // URL domain + title combination
        {
          $and: [
            { originalUrl: { $regex: new URL(article.url).hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { message: { $regex: normalizedTitle.substring(0, 30), $options: 'i' } },
            { source: 'external' }
          ]
        }
      ]
    }).lean(); // Use lean() for faster queries
    
    if (existingContent) {
      return { 
        isDuplicate: true, 
        reason: 'exists_in_database', 
        uniqueId,
        existingId: existingContent._id 
      };
    }
    
    return { isDuplicate: false, uniqueId };
    
  } catch (error) {
    console.error('Error in duplicate detection:', error);
    return { isDuplicate: false, uniqueId: null, error: error.message };
  }
};



// Process articles with enhanced error handling
const processArticlesBatch = async (articles, batchSize = 3) => {
  if (!Array.isArray(articles) || articles.length === 0) {
    console.log('⚠️ No articles to process');
    return [];
  }

  console.log(`📦 Processing ${articles.length} articles in batches of ${batchSize}`);
  
  const results = [];
  const processedInCurrentBatch = new Set();
  const processedUrls = new Set();
  const processedTitles = new Set();
  
  // Process in smaller batches to prevent race conditions
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(articles.length/batchSize)}`);
    
    // Process articles in sequence within each batch to avoid race conditions
    for (let j = 0; j < batch.length; j++) {
      const article = batch[j];
      const globalIndex = i + j;
      
      try {
        // Enhanced validation
        if (!article || typeof article !== 'object') {
          console.log(`⚠️ Skipping article ${globalIndex + 1}: Invalid article object`);
          results.push({ success: false, reason: 'invalid_object' });
          continue;
        }

        if (!article.title || !article.url) {
          console.log(`⚠️ Skipping article ${globalIndex + 1}: Missing title or URL`);
          results.push({ success: false, reason: 'missing_essential_fields' });
          continue;
        }

        // Comprehensive duplicate check
        const duplicateCheck = await isDuplicateArticle(article, processedInCurrentBatch);
        
        if (duplicateCheck.isDuplicate) {
          console.log(`⚠️ Skipping article ${globalIndex + 1}: ${duplicateCheck.reason} - "${article.title?.substring(0, 30)}..."`);
          results.push({ 
            success: false, 
            reason: duplicateCheck.reason,
            uniqueId: duplicateCheck.uniqueId 
          });
          continue;
        }

        const uniqueId = duplicateCheck.uniqueId;
        
        // Mark as being processed
        activeRequests.set(uniqueId, Date.now());
        processedInCurrentBatch.add(uniqueId);
        processedInCurrentBatch.add(article.url.toLowerCase());
        processedInCurrentBatch.add(article.title.toLowerCase());
        
        try {
          // Get or create channel
          const sourceName = article.source?.name || article.source || 'External News';
          const channel = await createOrGetChannelForExternalSource(sourceName);
          
          if (!channel?._id) {
            console.error(`❌ Failed to get channel for article ${globalIndex + 1}`);
            results.push({ success: false, reason: 'channel_failed' });
            continue;
          }
          
          // Calculate timing
          const now = new Date();
          const publishedAt = article.publishedAt ? new Date(article.publishedAt) : now;
          const timeSincePublished = now - publishedAt;
          const justInDuration = 15 * 60 * 1000; // 15 minutes
          const headlineDuration = 48 * 60 * 60 * 1000; // 48 hours
          
          // Skip very old articles
          if (timeSincePublished > headlineDuration) {
            const hoursOld = Math.round(timeSincePublished / (60 * 60 * 1000));
            console.log(`⚠️ Article ${globalIndex + 1} too old: ${hoursOld} hours`);
            results.push({ success: false, reason: 'too_old' });
            continue;
          }
          
          const isJustIn = timeSincePublished < justInDuration;
          const justInExpiresAt = isJustIn ? new Date(publishedAt.getTime() + justInDuration) : null;
          const headlineExpiresAt = new Date(publishedAt.getTime() + headlineDuration);
          
          // Create content message
          let message = article.title.trim();
          if (article.description && article.description.trim()) {
            message += `\n\n${article.description.trim()}`;
          }
          
          // Final database check right before saving
          const finalCheck = await Content.findOne({ externalId: uniqueId });
          if (finalCheck) {
            console.log(`⚠️ Article ${globalIndex + 1} created during processing - skipping`);
            results.push({ success: false, reason: 'created_during_processing' });
            continue;
          }
          
          // Create content object
          const newsContent = new Content({
            externalId: uniqueId,
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
          
          const savedContent = await newsContent.save();
          
          // Add to recently processed cache
          recentlyProcessed.add(uniqueId);
          
          const destination = isJustIn ? 'Just In' : 'Headlines';
          console.log(`✅ Article ${globalIndex + 1} saved to ${destination}: "${article.title?.substring(0, 40)}..." from ${sourceName}`);
          
          results.push({ success: true, content: savedContent, uniqueId });
          
        } finally {
          // Always remove from active requests
          activeRequests.delete(uniqueId);
        }
        
      } catch (error) {
        console.error(`❌ Error processing article ${globalIndex + 1}:`, error.message);
        results.push({ success: false, reason: 'processing_error', error: error.message });
      }
      
      // Small delay between articles in the same batch
      if (j < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Pause between batches
    if (i + batchSize < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Clean up recently processed cache (keep only last 1000 items)
  if (recentlyProcessed.size > 1000) {
    const items = Array.from(recentlyProcessed);
    recentlyProcessed.clear();
    items.slice(-500).forEach(item => recentlyProcessed.add(item));
  }
  
  return results;
};

// Add this cleanup function to be called periodically
const cleanupCaches = () => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  // Clean up active requests older than 30 minutes
  for (const [key, timestamp] of activeRequests.entries()) {
    if (now - timestamp > maxAge) {
      activeRequests.delete(key);
    }
  }
  
  console.log(`🧹 Cleaned up caches - Active: ${activeRequests.size}, Recent: ${recentlyProcessed.size}`);
};

// Call cleanup every 15 minutes
setInterval(cleanupCaches, 15 * 60 * 1000);




// MAIN FUNCTION - Enhanced with better error handling and logging
export const fetchExternalNewsServer = async (ipInfo = { ip: '8.8.8.8' }) => {
  const startTime = Date.now();
  
  try {
    console.log('\n🚀 ============ EXTERNAL NEWS FETCH STARTED ============');
    console.log(`🔍 Using IP: ${ipInfo.ip}`);
    console.log(`🔍 PARTNER_API_URL: ${PARTNER_API_URL || 'NOT CONFIGURED'}`);
    console.log(`🔍 Current time: ${new Date().toISOString()}`);
    
    if (!PARTNER_API_URL) {
      console.error('❌ PARTNER_API_URL not configured - aborting fetch');
      return [];
    }
    
    // Build URL with parameters
    const url = new URL(PARTNER_API_URL);
    url.searchParams.set('ip', ipInfo.ip);
    url.searchParams.set('timestamp', Date.now().toString());
    url.searchParams.set('client', 'truepace-backend');
    
    const fullUrl = url.toString();
    console.log(`🌐 Full API URL: ${fullUrl}`);
    
    // Fetch data with retry logic
    console.log('📡 Making API request...');
    const response = await fetchWithRetry(fullUrl, { method: 'GET' });
    
    console.log('📄 Parsing response...');
    const data = await response.json();
    
    // Log response structure
    console.log('📊 API Response Analysis:');
    console.log(`- Response type: ${typeof data}`);
    console.log(`- Has articles: ${!!data.articles}`);
    console.log(`- Articles count: ${data.articles?.length || 0}`);
    console.log(`- Response keys: [${Object.keys(data).join(', ')}]`);
    
    if (data.articles?.length > 0) {
      console.log('📄 Sample article structure:');
      const sample = data.articles[0];
      console.log(`- Title: ${sample.title || 'N/A'}`);
      console.log(`- URL: ${sample.url || 'N/A'}`);
      console.log(`- Source: ${sample.source?.name || sample.source || 'N/A'}`);
      console.log(`- Published: ${sample.publishedAt || 'N/A'}`);
      console.log(`- Has image: ${!!(sample.urlToImage || sample.image)}`);
      console.log(`- Has description: ${!!sample.description}`);
    }

    if (!data.articles || !Array.isArray(data.articles)) {
      console.log('⚠️ No articles array in response');
      console.log('📋 Full response sample:', JSON.stringify(data, null, 2).substring(0, 500));
      return [];
    }

    if (data.articles.length === 0) {
      console.log('ℹ️ API returned empty articles array');
      return [];
    }

    // Process articles
    console.log(`\n📦 Processing ${data.articles.length} articles...`);
    const results = await processArticlesBatch(data.articles);
    
    // Generate summary
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      reasons: {}
    };
    
    results.filter(r => !r.success).forEach(r => {
      summary.reasons[r.reason] = (summary.reasons[r.reason] || 0) + 1;
    });
    
    const processingTime = Date.now() - startTime;
    
    console.log('\n📊 ============ PROCESSING SUMMARY ============');
    console.log(`✅ Successfully processed: ${summary.successful}`);
    console.log(`❌ Failed to process: ${summary.failed}`);
    console.log(`⏱️ Total processing time: ${processingTime}ms`);
    console.log('📋 Failure reasons:', summary.reasons);
    console.log('🏁 ============ EXTERNAL NEWS FETCH COMPLETED ============\n');
    
    return results.filter(r => r.success).map(r => r.content);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('\n❌ ============ EXTERNAL NEWS FETCH FAILED ============');
    console.error(`❌ Error: ${error.message}`);
    console.error(`❌ Processing time: ${processingTime}ms`);
    console.error(`❌ Stack trace:`, error.stack);
    
    if (error.name === 'AbortError') {
      console.error('⏰ Request was aborted due to timeout');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('🌐 Network connectivity issue - partner API may be down');
    }
    
    console.error('🏁 ============ EXTERNAL NEWS FETCH FAILED ============\n');
    return [];
  }
};

// Test API connectivity
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
    
    const url = new URL(PARTNER_API_URL);
    url.searchParams.set('ip', ipInfo.ip);
    url.searchParams.set('test', 'true');
    
    const fullUrl = url.toString();
    console.log(`🧪 Testing URL: ${fullUrl}`);
    
    const response = await fetchWithRetry(fullUrl, { method: 'GET' }, 2);
    const responseData = await response.json();
    
    const result = {
      success: true,
      status: response.status,
      statusText: response.statusText,
      articlesCount: responseData?.articles?.length || 0,
      hasArticles: !!responseData?.articles?.length,
      sampleArticle: responseData?.articles?.[0] || null,
      responseKeys: Object.keys(responseData)
    };
    
    console.log('🧪 Test Results:', result);
    console.log('🏁 ============ API TEST COMPLETED ============\n');
    
    return result;
    
  } catch (error) {
    console.error('\n❌ ============ API TEST FAILED ============');
    console.error(`❌ Error: ${error.message}`);
    console.error('🏁 ============ API TEST FAILED ============\n');
    
    return {
      success: false,
      error: error.message,
      configuredUrl: PARTNER_API_URL
    };
  }
};

// Refresh external channels
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

// Create API routes for testing and manual triggering
export const createExternalNewsRoute = (router) => {
  // Enhanced test endpoint
  router.get('/test-api', async (req, res) => {
    try {
      const ipInfo = { ip: req.ipAddress || req.query.ip || '8.8.8.8' };
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
  
  // Manual trigger endpoint
  router.post('/fetch-external-news', async (req, res) => {
    try {
      const ipInfo = { ip: req.ipAddress || req.body.ip || '8.8.8.8' };
      console.log('📡 Manual external news fetch triggered via API');
      
      const results = await fetchExternalNewsServer(ipInfo);
      
      res.json({
        success: true,
        articlesProcessed: results.length,
        message: `Successfully processed ${results.length} external news articles`,
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
  
  // Status endpoint with environment diagnostics
  router.get('/status', async (req, res) => {
    try {
      res.json({
        serviceStatus: 'active',
        partnerApiUrl: PARTNER_API_URL || 'NOT CONFIGURED',
        partnerApiConfigured: !!PARTNER_API_URL,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        environmentDiagnostics: {
          availableEnvVars: Object.keys(process.env).filter(key => 
            key.includes('PARTNER') || key.includes('API') || key.includes('URL')
          ),
          processEnvPartnerUrl: process.env.PARTNER_API_URL,
          loadedPartnerUrl: PARTNER_API_URL
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
};