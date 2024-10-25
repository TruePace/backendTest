import crypto from 'crypto';

class ApiKeyManager {
  constructor() {
    // Initialize with environment variable
    const keysString = process.env.ML_PARTNER_API_KEYS || '[]';
    this.keys = this.parseApiKeys(keysString);
  }

  parseApiKeys(keysString) {
    try {
      return JSON.parse(keysString);
    } catch (error) {
      console.error('Error parsing API keys:', error);
      return [];
    }
  }

  generateNewKey() {
    const newKey = crypto.randomBytes(32).toString('hex');
    return newKey;
  }

  verifyKey(apiKey) {
    // Check if the provided key exists in the parsed keys array
    return this.keys.some(keyObj => keyObj.key === apiKey);
  }
}

export default new ApiKeyManager();