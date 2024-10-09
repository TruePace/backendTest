// import fs from 'fs/promises';
// import path from 'path';
// import { createWriteStream } from 'fs';
// import  { EXPORT_CONFIG } from './ExportConfig.js'

// export class FileUtils {
//     static async ensureDirectories() {
//       await fs.mkdir(EXPORT_CONFIG.EXPORT_DIRECTORY, { recursive: true });
//       await fs.mkdir(EXPORT_CONFIG.TEMP_DIRECTORY, { recursive: true });
//     }
  
//     static async cleanupOldExports() {
//       const files = await fs.readdir(EXPORT_CONFIG.EXPORT_DIRECTORY);
//       const exportFiles = await Promise.all(
//         files.map(async (file) => {
//           const filePath = path.join(EXPORT_CONFIG.EXPORT_DIRECTORY, file);
//           const stats = await fs.stat(filePath);
//           return { name: file, path: filePath, created: stats.birthtime };
//         })
//       );
  
//       exportFiles.sort((a, b) => b.created - a.created);
  
//       for (let i = EXPORT_CONFIG.MAX_STORED_EXPORTS; i < exportFiles.length; i++) {
//         await fs.unlink(exportFiles[i].path);
//       }
//     }
  
//     static async writeChunkToFile(data, filename) {
//       const filePath = path.join(EXPORT_CONFIG.TEMP_DIRECTORY, filename);
//       await fs.writeFile(filePath, JSON.stringify(data, null, 2));
//       return filePath;
//     }
  
//     static async combineChunks(chunkFiles, finalFilename) {
//       const finalPath = path.join(EXPORT_CONFIG.EXPORT_DIRECTORY, finalFilename);
//       const combinedStream = fs.createWriteStream(finalPath);
  
//       combinedStream.write('[\n');
      
//       for (let i = 0; i < chunkFiles.length; i++) {
//         const chunkContent = await fs.readFile(chunkFiles[i], 'utf-8');
//         const parsedChunk = JSON.parse(chunkContent);
        
//         parsedChunk.forEach((item, index) => {
//           combinedStream.write(JSON.stringify(item));
//           if (i < chunkFiles.length - 1 || index < parsedChunk.length - 1) {
//             combinedStream.write(',\n');
//           }
//         });
        
//         await fs.unlink(chunkFiles[i]); // Clean up chunk file
//       }
      
//       combinedStream.write('\n]');
//       combinedStream.end();
  
//       return finalPath;
//     }
//   }


import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { EXPORT_CONFIG } from './ExportConfig.js';

export class FileUtils {
  static async ensureDirectories() {
    await fs.mkdir(EXPORT_CONFIG.EXPORT_DIRECTORY, { recursive: true });
    await fs.mkdir(EXPORT_CONFIG.TEMP_DIRECTORY, { recursive: true });
  }

  static async cleanupOldExports() {
    const files = await fs.readdir(EXPORT_CONFIG.EXPORT_DIRECTORY);
    const exportFiles = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(EXPORT_CONFIG.EXPORT_DIRECTORY, file);
        const stats = await fs.stat(filePath);
        return { name: file, path: filePath, created: stats.birthtime };
      })
    );

    exportFiles.sort((a, b) => b.created - a.created);

    for (let i = EXPORT_CONFIG.MAX_STORED_EXPORTS; i < exportFiles.length; i++) {
      await fs.unlink(exportFiles[i].path);
    }
  }

  static async writeChunkToFile(data, filename) {
    const filePath = path.join(EXPORT_CONFIG.TEMP_DIRECTORY, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  static async combineChunks(chunkFiles, finalFilename) {
    const finalPath = path.join(EXPORT_CONFIG.EXPORT_DIRECTORY, finalFilename);
    return new Promise((resolve, reject) => {
      const combinedStream = createWriteStream(finalPath);
      
      combinedStream.write('[\n');

      let processedChunks = 0;
      
      const processNextChunk = async () => {
        if (processedChunks >= chunkFiles.length) {
          combinedStream.write('\n]');
          combinedStream.end();
          resolve(finalPath);
          return;
        }

        try {
          const chunkContent = await fs.readFile(chunkFiles[processedChunks], 'utf-8');
          const parsedChunk = JSON.parse(chunkContent);
          
          parsedChunk.forEach((item, index) => {
            combinedStream.write(JSON.stringify(item));
            if (processedChunks < chunkFiles.length - 1 || index < parsedChunk.length - 1) {
              combinedStream.write(',\n');
            }
          });
          
          await fs.unlink(chunkFiles[processedChunks]); // Clean up chunk file
          processedChunks++;
          processNextChunk();
        } catch (error) {
          reject(error);
        }
      };

      combinedStream.on('error', reject);
      processNextChunk();
    });
  }
}