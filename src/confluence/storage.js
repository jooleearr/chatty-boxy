import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config.js';
import { db } from '../utils/database.js';

/**
 * Page Storage Manager
 * Handles saving converted pages to disk and tracking in database
 */
export class PageStorage {
  constructor() {
    this.contentDir = config.storage.contentDir;
    this.ensureContentDirExists();
  }

  /**
   * Ensure content directory exists
   */
  ensureContentDirExists() {
    if (!fs.existsSync(this.contentDir)) {
      fs.mkdirSync(this.contentDir, { recursive: true });
    }
  }

  /**
   * Sanitize filename to be safe for filesystem
   * @param {string} filename - Original filename
   * @returns {string} Safe filename
   */
  sanitizeFilename(filename) {
    return filename
      // Replace spaces with hyphens
      .replace(/\s+/g, '-')
      // Remove or replace special characters
      .replace(/[^a-zA-Z0-9-_]/g, '')
      // Remove consecutive hyphens
      .replace(/-+/g, '-')
      // Trim hyphens from start/end
      .replace(/^-|-$/g, '')
      // Lowercase for consistency
      .toLowerCase()
      // Limit length
      .substring(0, 100);
  }

  /**
   * Generate unique filename for a page
   * @param {Object} page - Confluence page object
   * @returns {string} Filename without extension
   */
  generateFilename(page) {
    const sanitizedTitle = this.sanitizeFilename(page.title);
    const pageId = page.id;
    
    // Format: {space-key}_{page-id}_{title}
    // This ensures uniqueness even if title changes
    return `${page.space.key.toLowerCase()}_${pageId}_${sanitizedTitle}`;
  }

  /**
   * Get full file path for a page
   * @param {Object} page - Confluence page object
   * @returns {string} Full file path
   */
  getPageFilePath(page) {
    const filename = this.generateFilename(page);
    return path.join(this.contentDir, `${filename}.md`);
  }

  /**
   * Save page content to file
   * @param {Object} page - Confluence page object
   * @param {string} markdown - Converted markdown content
   * @returns {Object} Result with filePath and success status
   */
  savePage(page, markdown) {
    try {
      const filePath = this.getPageFilePath(page);
      
      // Write markdown to file
      fs.writeFileSync(filePath, markdown, 'utf-8');
      
      return {
        success: true,
        filePath,
        error: null,
      };
    } catch (error) {
      console.error(`Error saving page ${page.id}:`, error.message);
      return {
        success: false,
        filePath: null,
        error: error.message,
      };
    }
  }

  /**
   * Delete page file from disk
   * @param {string} filePath - Path to file to delete
   * @returns {boolean} Success status
   */
  deletePage(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Save page and update database
   * @param {Object} page - Confluence page object
   * @param {string} markdown - Converted markdown content
   * @param {string} fileSearchStoreName - File search store name (optional)
   * @returns {Object} Result object
   */
  savePageWithMetadata(page, markdown, fileSearchStoreName = null) {
    // Save to file
    const saveResult = this.savePage(page, markdown);
    
    if (!saveResult.success) {
      return {
        success: false,
        error: saveResult.error,
      };
    }

    try {
      // Update database
      db.upsertPage({
        pageId: page.id,
        spaceKey: page.space.key,
        title: page.title,
        version: page.version.number,
        lastSynced: new Date().toISOString(),
        filePath: saveResult.filePath,
        fileSearchStoreName,
        url: page._links?.webui 
          ? `${config.confluence.baseUrl}/wiki${page._links.webui}`
          : null,
      });

      return {
        success: true,
        filePath: saveResult.filePath,
        pageId: page.id,
        error: null,
      };
    } catch (error) {
      console.error(`Error updating database for page ${page.id}:`, error.message);
      return {
        success: false,
        filePath: saveResult.filePath,
        error: `File saved but database update failed: ${error.message}`,
      };
    }
  }

  /**
   * Get storage statistics
   * @returns {Object} Statistics about stored pages
   */
  getStorageStats() {
    const files = fs.existsSync(this.contentDir) 
      ? fs.readdirSync(this.contentDir).filter(f => f.endsWith('.md'))
      : [];

    let totalSize = 0;
    files.forEach(file => {
      const stats = fs.statSync(path.join(this.contentDir, file));
      totalSize += stats.size;
    });

    return {
      totalFiles: files.length,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      contentDir: this.contentDir,
    };
  }

  /**
   * Clean up orphaned files (files not in database)
   * @returns {Object} Cleanup statistics
   */
  cleanupOrphanedFiles() {
    const allPages = db.getAllPages();
    const knownPaths = new Set(allPages.map(p => p.file_path));
    
    const files = fs.existsSync(this.contentDir)
      ? fs.readdirSync(this.contentDir).filter(f => f.endsWith('.md'))
      : [];

    let deletedCount = 0;
    files.forEach(file => {
      const fullPath = path.join(this.contentDir, file);
      if (!knownPaths.has(fullPath)) {
        if (this.deletePage(fullPath)) {
          deletedCount++;
        }
      }
    });

    return {
      filesChecked: files.length,
      filesDeleted: deletedCount,
    };
  }
}

// Export default instance
export const pageStorage = new PageStorage();
