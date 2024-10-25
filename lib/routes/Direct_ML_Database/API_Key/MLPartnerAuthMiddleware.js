import ApiKeyManager from "./ApiKeyManager.js";

export const verifyMLPartnerApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        message: 'API key is required',
        error: 'Please provide an API key in the x-api-key header'
      });
    }
  
    // Get the API keys from environment variable
    const apiKeys = JSON.parse(process.env.ML_PARTNER_API_KEYS || '[]');
    
    // Check if the provided key exists in the allowed keys
    const isValidKey = apiKeys.some(keyObj => keyObj.key === apiKey);
  
    if (!isValidKey) {
      return res.status(403).json({
        message: 'Invalid API key',
        error: 'The provided API key is not valid'
      });
    }
  
    next();
  };