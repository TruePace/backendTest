import path from 'path';
import { fileURLToPath } from 'url';


const __dirname = path.dirname(fileURLToPath(import.meta.url));

 export const EXPORT_CONFIG = {
  EXPORT_DIRECTORY: path.join(__dirname, '../../exports'),
  TEMP_DIRECTORY: path.join(__dirname, '../../temp'),
  MAX_STORED_EXPORTS: 5,
  CHUNK_SIZE: 100, // Number of records to process at once
  FILE_PREFIX: {
    VIDEO: 'video_interactions_',
    ARTICLE: 'article_interactions_',
    USER: 'user_data_',
    COMBINED: 'combined_data_'
  },
  RATE_LIMIT: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5 // 5 requests per hour
  }
};