import ApiKeyManager from "./ApiKeyManager.js";

console.log('Generating new API key...');
const newKey = ApiKeyManager.generateNewKey();
console.log('\nYour new ML Partner API Key:');
console.log('===============================');
console.log(newKey);
console.log('===============================');
console.log('\nStore this key securely and share it with your ML partner.');
console.log('They should include it in their API requests as follows:');
console.log('\nheaders: {');
console.log('  "x-api-key": "' + newKey + '"');
console.log('}');