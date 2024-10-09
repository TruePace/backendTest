import fs from 'fs/promises'
import path from 'path'
import { exportUserData } from './ExportUserHeadlineDataEndpoint.js'


class DataExportService {
    constructor(exportDirectory = './exports') {
      this.exportDirectory = exportDirectory;
      this.currentExportJob = null;
    }
  
    async initialize() {
      try {
        await fs.mkdir(this.exportDirectory, { recursive: true });
      } catch (error) {
        console.error('Error creating export directory:', error);
      }
    }
  
    generateFilename() {
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      return path.join(this.exportDirectory, `user_data_export_${timestamp}.json`);
    }
  
    async exportAllData() {
      if (this.currentExportJob) {
        console.log('Export already in progress');
        return;
      }
  
      this.currentExportJob = (async () => {
        try {
          console.log('Starting full data export');
          const filename = this.generateFilename();
          
          let allData = {
            users: [],
            interactions: [],
            contents: [],
            comments: []
          };
          
          let page = 1;
          let hasMoreData = true;
          
          while (hasMoreData) {
            const data = await exportUserData(page, 1000);
            
            allData.users.push(...data.data.users);
            allData.interactions.push(...data.data.interactions);
            allData.contents.push(...data.data.contents);
            allData.comments.push(...data.data.comments);
            
            hasMoreData = page < data.pagination.totalPages;
            page++;
            
            // Optional: Add a small delay to prevent overwhelming the database
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          await fs.writeFile(filename, JSON.stringify(allData, null, 2));
          console.log(`Data exported successfully to ${filename}`);
          
          // Cleanup old exports
          await this.cleanupOldExports();
          
          return filename;
        } catch (error) {
          console.error('Error during data export:', error);
          throw error;
        } finally {
          this.currentExportJob = null;
        }
      })();
  
      return this.currentExportJob;
    }
  
    async cleanupOldExports() {
      try {
        const files = await fs.readdir(this.exportDirectory);
        const sortedFiles = files
          .filter(file => file.startsWith('user_data_export_'))
          .sort()
          .reverse();
  
        // Keep the 5 most recent exports, delete the rest
        const filesToDelete = sortedFiles.slice(5);
        
        for (const file of filesToDelete) {
          await fs.unlink(path.join(this.exportDirectory, file));
          console.log(`Deleted old export: ${file}`);
        }
      } catch (error) {
        console.error('Error cleaning up old exports:', error);
      }
    }
  }
  
  export default new DataExportService();