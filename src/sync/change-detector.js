import { db } from '../utils/database.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Change Detector
 * Detects changes between Confluence pages and locally synced pages
 */
export class ChangeDetector {
  /**
   * Detect which pages have changed since last sync
   * @param {Array<Object>} confluencePages - Pages from Confluence API
   * @returns {Array<Object>} Pages that need to be synced
   */
  detectChanges(confluencePages) {
    const changedPages = [];
    const stats = {
      total: confluencePages.length,
      new: 0,
      updated: 0,
      unchanged: 0
    };

    console.log(`\nDetecting changes for ${confluencePages.length} pages...`);

    for (const page of confluencePages) {
      const syncedPage = db.getPage(page.id);

      if (!syncedPage) {
        // Page is new - never synced before
        changedPages.push(page);
        stats.new++;
      } else if (this.hasPageChanged(page, syncedPage)) {
        // Page has been updated
        changedPages.push(page);
        stats.updated++;
      } else {
        // Page is unchanged
        stats.unchanged++;
      }
    }

    console.log(`  New: ${stats.new}`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Unchanged: ${stats.unchanged}`);
    console.log(`  → ${changedPages.length} pages need syncing\n`);

    return changedPages;
  }

  /**
   * Check if a page has changed
   * @param {Object} confluencePage - Page from Confluence API
   * @param {Object} syncedPage - Page from local database
   * @returns {boolean} True if page has changed
   */
  hasPageChanged(confluencePage, syncedPage) {
    // Compare version numbers (most reliable indicator)
    if (confluencePage.version.number > syncedPage.version) {
      return true;
    }

    // Compare titles (in case of rename)
    if (confluencePage.title !== syncedPage.title) {
      return true;
    }

    // Version numbers match and title matches - no changes
    return false;
  }

  /**
   * Detect pages that have been deleted from Confluence
   * IMPORTANT: Only compares pages within the same spaces as confluencePages
   * to avoid false positives when syncing a subset of spaces
   * @param {Array<Object>} confluencePages - Current pages from Confluence
   * @returns {Array<Object>} Pages that were deleted
   */
  detectDeletedPages(confluencePages) {
    const deletedPages = [];
    
    // Extract unique space keys from Confluence pages
    const spaceKeys = [...new Set(confluencePages.map(p => p.space.key))];
    
    // Get synced pages only from the spaces we're checking
    const syncedPages = [];
    for (const spaceKey of spaceKeys) {
      syncedPages.push(...db.getPagesBySpace(spaceKey));
    }
    
    // Create a Set of current Confluence page IDs for fast lookup
    const confluencePageIds = new Set(confluencePages.map(p => p.id));
    
    // Find synced pages that are no longer in Confluence
    for (const syncedPage of syncedPages) {
      if (!confluencePageIds.has(syncedPage.page_id)) {
        deletedPages.push(syncedPage);
      }
    }

    if (deletedPages.length > 0) {
      console.log(`\nDetected ${deletedPages.length} deleted pages:`);
      deletedPages.forEach(page => {
        console.log(`  - ${page.title} (${page.page_id})`);
      });
    }

    return deletedPages;
  }

  /**
   * Detect pages deleted from a specific space
   * @param {string} spaceKey - Space key to check
   * @param {Array<Object>} confluencePages - Current pages from Confluence for this space
   * @returns {Array<Object>} Pages that were deleted from this space
   */
  detectDeletedPagesInSpace(spaceKey, confluencePages) {
    const deletedPages = [];
    
    // Get synced pages for this space
    const syncedPages = db.getPagesBySpace(spaceKey);
    
    // Create a Set of current Confluence page IDs for fast lookup
    const confluencePageIds = new Set(confluencePages.map(p => p.id));
    
    // Find synced pages that are no longer in Confluence
    for (const syncedPage of syncedPages) {
      if (!confluencePageIds.has(syncedPage.page_id)) {
        deletedPages.push(syncedPage);
      }
    }

    return deletedPages;
  }

  /**
   * Check if a local file exists for a synced page
   * @param {Object} syncedPage - Page from database
   * @returns {boolean} True if file exists
   */
  fileExists(syncedPage) {
    if (!syncedPage.file_path) {
      return false;
    }
    return fs.existsSync(syncedPage.file_path);
  }

  /**
   * Find orphaned files (files that exist but aren't in database)
   * @param {string} contentDir - Content directory path
   * @returns {Array<string>} Paths to orphaned files
   */
  findOrphanedFiles(contentDir) {
    const orphanedFiles = [];
    
    if (!fs.existsSync(contentDir)) {
      return orphanedFiles;
    }

    // Get all synced page file paths from database
    const syncedPages = db.getAllPages();
    const syncedFilePaths = new Set(syncedPages.map(p => p.file_path));

    // Recursively find all markdown files in content directory
    const findMarkdownFiles = (dir) => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          findMarkdownFiles(fullPath);
        } else if (file.endsWith('.md')) {
          // Check if this file is tracked in database
          if (!syncedFilePaths.has(fullPath)) {
            orphanedFiles.push(fullPath);
          }
        }
      }
    };

    findMarkdownFiles(contentDir);
    return orphanedFiles;
  }

  /**
   * Find missing files (database records with no corresponding file)
   * @returns {Array<Object>} Synced pages with missing files
   */
  findMissingFiles() {
    const missingFiles = [];
    const syncedPages = db.getAllPages();

    for (const page of syncedPages) {
      if (!this.fileExists(page)) {
        missingFiles.push(page);
      }
    }

    return missingFiles;
  }

  /**
   * Generate change summary report
   * @param {Array<Object>} confluencePages - Current Confluence pages
   * @returns {Object} Detailed change summary
   */
  generateChangeSummary(confluencePages) {
    const changedPages = this.detectChanges(confluencePages);
    const deletedPages = this.detectDeletedPages(confluencePages);
    const missingFiles = this.findMissingFiles();

    const summary = {
      total: confluencePages.length,
      synced: db.getAllPages().length,
      changes: {
        new: changedPages.filter(p => !db.getPage(p.id)).length,
        updated: changedPages.filter(p => db.getPage(p.id)).length,
        deleted: deletedPages.length
      },
      issues: {
        missingFiles: missingFiles.length
      },
      needsSync: changedPages.length > 0 || deletedPages.length > 0 || missingFiles.length > 0
    };

    return summary;
  }

  /**
   * Clean up resources (remove deleted pages and orphaned files)
   * Note: This method is typically not used directly - SyncService.handleDeletedPages() 
   * is preferred for consistency. Kept for backward compatibility and testing.
   * @param {Array<Object>} deletedPages - Pages to clean up
   * @param {string} contentDir - Content directory
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanup(deletedPages, contentDir) {
    const results = {
      deletedPages: 0,
      deletedFiles: 0,
      orphanedFiles: 0,
      errors: []
    };

    // Remove deleted pages from database and filesystem
    for (const page of deletedPages) {
      try {
        // Delete from database
        db.deletePage(page.page_id);
        results.deletedPages++;

        // Delete file if it exists
        // Note: Using fs.unlinkSync directly here for orphaned file cleanup
        // SyncService uses PageStorage.deletePage() for consistency
        if (page.file_path && fs.existsSync(page.file_path)) {
          fs.unlinkSync(page.file_path);
          results.deletedFiles++;
        }
      } catch (error) {
        results.errors.push({
          pageId: page.page_id,
          error: error.message
        });
      }
    }

    // Find and remove orphaned files
    const orphanedFiles = this.findOrphanedFiles(contentDir);
    for (const filePath of orphanedFiles) {
      try {
        fs.unlinkSync(filePath);
        results.orphanedFiles++;
      } catch (error) {
        results.errors.push({
          file: filePath,
          error: error.message
        });
      }
    }

    return results;
  }
}
