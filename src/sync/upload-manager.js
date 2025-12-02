import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import * as fs from 'fs';

/**
 * Upload Manager
 * Handles uploading files to File Search store and polling operations
 */
export class UploadManager {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.pollInterval = config.sync.operationPollInterval || 2000; // 2 seconds default
    this.maxPollTime = 5 * 60 * 1000; // 5 minutes max
  }

  /**
   * Upload a file to File Search store
   * @param {string} filePath - Local file path
   * @param {string} storeName - File Search store name
   * @param {Object} options - Upload options (displayName, mimeType)
   * @returns {Promise<Object>} Completed operation result
   */
  async uploadFile(filePath, storeName, options = {}) {
    try {
      // Verify file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      console.log(`  Uploading: ${options.displayName || filePath}`);

      // Start upload operation
      let operation = await this.ai.fileSearchStores.uploadToFileSearchStore({
        file: filePath,
        fileSearchStoreName: storeName,
        config: {
          displayName: options.displayName || filePath,
          mimeType: options.mimeType || 'text/markdown',
        }
      });

      // Poll until operation completes
      operation = await this.pollOperation(operation);

      console.log(`  ✓ Upload complete: ${options.displayName || filePath}`);
      
      return operation;
    } catch (error) {
      console.error(`  ✗ Upload failed: ${options.displayName || filePath}`, error.message);
      throw error;
    }
  }

  /**
   * Upload multiple files with progress tracking
   * @param {Array<Object>} files - Array of {filePath, displayName, mimeType}
   * @param {string} storeName - File Search store name
   * @returns {Promise<Object>} Upload results with counts
   */
  async uploadFiles(files, storeName) {
    const results = {
      total: files.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`\nUploading ${files.length} files to File Search store...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        console.log(`[${i + 1}/${files.length}]`, '');
        await this.uploadFile(file.filePath, storeName, {
          displayName: file.displayName,
          mimeType: file.mimeType || 'text/markdown'
        });
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          file: file.displayName || file.filePath,
          error: error.message
        });
      }
    }

    console.log(`\n✓ Upload complete: ${results.successful} successful, ${results.failed} failed`);
    
    return results;
  }

  /**
   * Poll an operation until it completes or times out
   * @param {Object} operation - Initial operation object
   * @returns {Promise<Object>} Completed operation
   */
  async pollOperation(operation) {
    const startTime = Date.now();
    
    while (!operation.done) {
      // Check for timeout
      if (Date.now() - startTime > this.maxPollTime) {
        throw new Error('Operation timed out after 5 minutes');
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));

      // Get updated operation status
      try {
        operation = await this.ai.operations.get({ operation });
      } catch (error) {
        // If polling fails, throw with context
        throw new Error(`Operation polling failed: ${error.message}`);
      }
    }

    // Check if operation completed successfully
    if (operation.error) {
      throw new Error(`Operation failed: ${operation.error.message || 'Unknown error'}`);
    }

    return operation;
  }

  /**
   * Get operation status
   * @param {Object} operation - Operation object
   * @returns {Promise<Object>} Operation status
   */
  async getOperationStatus(operation) {
    try {
      return await this.ai.operations.get({ operation });
    } catch (error) {
      throw new Error(`Failed to get operation status: ${error.message}`);
    }
  }

  /**
   * Upload a batch of files with retry logic
   * @param {Array<Object>} files - Files to upload
   * @param {string} storeName - Store name
   * @param {number} maxRetries - Max retries per file (default 3)
   * @returns {Promise<Object>} Upload results
   */
  async uploadFilesWithRetry(files, storeName, maxRetries = 3) {
    const results = {
      total: files.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`\nUploading ${files.length} files with retry (max ${maxRetries} attempts)...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
        try {
          attempt++;
          if (attempt > 1) {
            console.log(`[${i + 1}/${files.length}] Retry ${attempt}/${maxRetries}:`, file.displayName);
          } else {
            console.log(`[${i + 1}/${files.length}]`, '');
          }

          await this.uploadFile(file.filePath, storeName, {
            displayName: file.displayName,
            mimeType: file.mimeType || 'text/markdown'
          });
          
          success = true;
          results.successful++;
        } catch (error) {
          if (attempt >= maxRetries) {
            results.failed++;
            results.errors.push({
              file: file.displayName || file.filePath,
              error: error.message,
              attempts: attempt
            });
          } else {
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
          }
        }
      }
    }

    console.log(`\n✓ Upload complete: ${results.successful} successful, ${results.failed} failed`);
    
    return results;
  }
}
