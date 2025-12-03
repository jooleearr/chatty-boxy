# Task 9: Change Detection & Incremental Updates

**Phase**: 3 - File Search Store Management  
**Estimated Time**: 45 minutes  
**Prerequisites**: Tasks 1-8 completed

## Objective

Create a change detection system that compares Confluence pages with locally synced pages to identify what needs updating. This enables incremental syncs that only process changed/new/deleted pages, significantly reducing sync time and API calls.

## File to Create

`src/sync/change-detector.js` - ~200 lines

## Implementation

Create `src/sync/change-detector.js`:

```javascript
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
```

## Testing

### Manual Testing

Create a test script `test-change-detector.js` in the project root:

```javascript
import { ChangeDetector } from './src/sync/change-detector.js';
import { ConfluenceClient } from './src/confluence/client.js';
import { db } from './src/utils/database.js';
import { config } from './src/config.js';

async function testChangeDetector() {
  console.log('Testing Change Detector...\n');

  const detector = new ChangeDetector();
  const confluenceClient = new ConfluenceClient();

  // Test 1: Fetch current pages from Confluence
  console.log('Test 1: Fetching current pages from Confluence');
  const spaceKey = config.confluence.spaceKeys[0];
  const confluencePages = await confluenceClient.getPages(spaceKey);
  console.log(`✓ Fetched ${confluencePages.length} pages from ${spaceKey}\n`);

  // Test 2: Detect changes
  console.log('Test 2: Detecting changes');
  const changedPages = detector.detectChanges(confluencePages);
  console.log(`✓ Found ${changedPages.length} pages that need syncing\n`);

  // Test 3: Detect deleted pages
  console.log('Test 3: Detecting deleted pages');
  const deletedPages = detector.detectDeletedPages(confluencePages);
  console.log(`✓ Found ${deletedPages.length} deleted pages\n`);

  // Test 4: Generate summary
  console.log('Test 4: Generating change summary');
  const summary = detector.generateChangeSummary(confluencePages);
  console.log('Summary:', JSON.stringify(summary, null, 2));
  console.log('✓ Summary generated\n');

  // Test 5: Find missing files
  console.log('Test 5: Finding missing files');
  const missingFiles = detector.findMissingFiles();
  console.log(`✓ Found ${missingFiles.length} pages with missing files\n`);

  // Test 6: Find orphaned files
  console.log('Test 6: Finding orphaned files');
  const orphanedFiles = detector.findOrphanedFiles(config.storage.contentDir);
  console.log(`✓ Found ${orphanedFiles.length} orphaned files\n`);

  // Test 7: Test individual page change detection
  console.log('Test 7: Testing individual page change detection');
  if (confluencePages.length > 0) {
    const testPage = confluencePages[0];
    const syncedPage = db.getPage(testPage.id);
    
    if (syncedPage) {
      const hasChanged = detector.hasPageChanged(testPage, syncedPage);
      console.log(`Page "${testPage.title}" has changed: ${hasChanged}`);
    } else {
      console.log(`Page "${testPage.title}" is new (not in database)`);
    }
  }
  console.log('✓ Individual change detection works\n');

  console.log('All tests completed! ✓');
}

testChangeDetector().catch(console.error);
```

Run the test:
```bash
node test-change-detector.js
```

### Unit Tests

Add tests to the test suite in `tests/change-detector.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetector } from '../src/sync/change-detector.js';
import { db } from '../src/utils/database.js';
import * as fs from 'fs';
import * as path from 'path';

describe('ChangeDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new ChangeDetector();
  });

  describe('hasPageChanged', () => {
    it('should detect version number changes', () => {
      const confluencePage = {
        id: '123',
        title: 'Test Page',
        version: { number: 5 }
      };

      const syncedPage = {
        page_id: '123',
        title: 'Test Page',
        version: 3
      };

      expect(detector.hasPageChanged(confluencePage, syncedPage)).toBe(true);
    });

    it('should detect title changes', () => {
      const confluencePage = {
        id: '123',
        title: 'New Title',
        version: { number: 3 }
      };

      const syncedPage = {
        page_id: '123',
        title: 'Old Title',
        version: 3
      };

      expect(detector.hasPageChanged(confluencePage, syncedPage)).toBe(true);
    });

    it('should return false when nothing changed', () => {
      const confluencePage = {
        id: '123',
        title: 'Test Page',
        version: { number: 3 }
      };

      const syncedPage = {
        page_id: '123',
        title: 'Test Page',
        version: 3
      };

      expect(detector.hasPageChanged(confluencePage, syncedPage)).toBe(false);
    });
  });

  describe('detectChanges', () => {
    it('should identify new pages', () => {
      const confluencePages = [
        {
          id: '999',
          title: 'New Page',
          version: { number: 1 }
        }
      ];

      vi.spyOn(db, 'getPage').mockReturnValue(null);

      const changes = detector.detectChanges(confluencePages);
      
      expect(changes).toHaveLength(1);
      expect(changes[0].id).toBe('999');
    });

    it('should identify updated pages', () => {
      const confluencePages = [
        {
          id: '123',
          title: 'Updated Page',
          version: { number: 5 }
        }
      ];

      vi.spyOn(db, 'getPage').mockReturnValue({
        page_id: '123',
        title: 'Updated Page',
        version: 3
      });

      const changes = detector.detectChanges(confluencePages);
      
      expect(changes).toHaveLength(1);
      expect(changes[0].id).toBe('123');
    });

    it('should skip unchanged pages', () => {
      const confluencePages = [
        {
          id: '123',
          title: 'Unchanged Page',
          version: { number: 3 }
        }
      ];

      vi.spyOn(db, 'getPage').mockReturnValue({
        page_id: '123',
        title: 'Unchanged Page',
        version: 3
      });

      const changes = detector.detectChanges(confluencePages);
      
      expect(changes).toHaveLength(0);
    });

    it('should handle mixed changes', () => {
      const confluencePages = [
        { id: '1', title: 'New', version: { number: 1 } },
        { id: '2', title: 'Updated', version: { number: 5 } },
        { id: '3', title: 'Unchanged', version: { number: 2 } }
      ];

      vi.spyOn(db, 'getPage').mockImplementation((id) => {
        if (id === '1') return null; // New page
        if (id === '2') return { page_id: '2', title: 'Updated', version: 3 }; // Updated
        if (id === '3') return { page_id: '3', title: 'Unchanged', version: 2 }; // Unchanged
      });

      const changes = detector.detectChanges(confluencePages);
      
      expect(changes).toHaveLength(2);
      expect(changes.map(p => p.id)).toEqual(['1', '2']);
    });
  });

  describe('detectDeletedPages', () => {
    it('should detect deleted pages', () => {
      const confluencePages = [
        { id: '1', title: 'Page 1', space: { key: 'DEV' } },
        { id: '2', title: 'Page 2', space: { key: 'DEV' } }
      ];

      vi.spyOn(db, 'getPagesBySpace').mockReturnValue([
        { page_id: '1', title: 'Page 1', space_key: 'DEV' },
        { page_id: '2', title: 'Page 2', space_key: 'DEV' },
        { page_id: '3', title: 'Deleted Page', space_key: 'DEV' }
      ]);

      const deleted = detector.detectDeletedPages(confluencePages);
      
      expect(deleted).toHaveLength(1);
      expect(deleted[0].page_id).toBe('3');
    });

    it('should return empty array when no pages deleted', () => {
      const confluencePages = [
        { id: '1', title: 'Page 1', space: { key: 'DEV' } }
      ];

      vi.spyOn(db, 'getPagesBySpace').mockReturnValue([
        { page_id: '1', title: 'Page 1', space_key: 'DEV' }
      ]);

      const deleted = detector.detectDeletedPages(confluencePages);
      
      expect(deleted).toHaveLength(0);
    });

    it('should not flag pages from other spaces as deleted', () => {
      const confluencePages = [
        { id: '1', title: 'Dev Page', space: { key: 'DEV' } }
      ];

      // Mock database to return DEV pages only (no PROD pages)
      vi.spyOn(db, 'getPagesBySpace').mockImplementation((spaceKey) => {
        if (spaceKey === 'DEV') {
          return [{ page_id: '1', title: 'Dev Page', space_key: 'DEV' }];
        }
        return [];
      });

      const deleted = detector.detectDeletedPages(confluencePages);
      
      // Should NOT include pages from PROD space
      expect(deleted).toHaveLength(0);
    });

    it('should handle multiple spaces correctly', () => {
      const confluencePages = [
        { id: '1', title: 'Dev Page', space: { key: 'DEV' } },
        { id: '3', title: 'Prod Page', space: { key: 'PROD' } }
      ];

      vi.spyOn(db, 'getPagesBySpace').mockImplementation((spaceKey) => {
        if (spaceKey === 'DEV') {
          return [
            { page_id: '1', title: 'Dev Page', space_key: 'DEV' },
            { page_id: '2', title: 'Deleted Dev Page', space_key: 'DEV' }
          ];
        }
        if (spaceKey === 'PROD') {
          return [
            { page_id: '3', title: 'Prod Page', space_key: 'PROD' },
            { page_id: '4', title: 'Deleted Prod Page', space_key: 'PROD' }
          ];
        }
        return [];
      });

      const deleted = detector.detectDeletedPages(confluencePages);
      
      // Should detect deleted pages from both spaces
      expect(deleted).toHaveLength(2);
      expect(deleted.map(p => p.page_id).sort()).toEqual(['2', '4']);
    });
  });

  describe('detectDeletedPagesInSpace', () => {
    it('should detect deleted pages in specific space', () => {
      const confluencePages = [
        { id: '1', title: 'Page 1' }
      ];

      vi.spyOn(db, 'getPagesBySpace').mockReturnValue([
        { page_id: '1', title: 'Page 1', space_key: 'TEST' },
        { page_id: '2', title: 'Deleted', space_key: 'TEST' }
      ]);

      const deleted = detector.detectDeletedPagesInSpace('TEST', confluencePages);
      
      expect(deleted).toHaveLength(1);
      expect(deleted[0].page_id).toBe('2');
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', () => {
      const syncedPage = { file_path: '/path/to/file.md' };
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      expect(detector.fileExists(syncedPage)).toBe(true);
    });

    it('should return false when file does not exist', () => {
      const syncedPage = { file_path: '/path/to/file.md' };
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(detector.fileExists(syncedPage)).toBe(false);
    });

    it('should return false when file_path is missing', () => {
      const syncedPage = {};

      expect(detector.fileExists(syncedPage)).toBe(false);
    });
  });

  describe('findMissingFiles', () => {
    it('should find pages with missing files', () => {
      vi.spyOn(db, 'getAllPages').mockReturnValue([
        { page_id: '1', file_path: '/exists.md' },
        { page_id: '2', file_path: '/missing.md' }
      ]);

      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path === '/exists.md';
      });

      const missing = detector.findMissingFiles();
      
      expect(missing).toHaveLength(1);
      expect(missing[0].page_id).toBe('2');
    });
  });

  describe('generateChangeSummary', () => {
    it('should generate complete change summary', () => {
      const confluencePages = [
        { id: '1', title: 'New', version: { number: 1 }, space: { key: 'DEV' } },
        { id: '2', title: 'Updated', version: { number: 5 }, space: { key: 'DEV' } }
      ];

      vi.spyOn(db, 'getPage').mockImplementation((id) => {
        if (id === '1') return null;
        if (id === '2') return { page_id: '2', title: 'Updated', version: 3 };
      });

      vi.spyOn(db, 'getPagesBySpace').mockReturnValue([
        { page_id: '2', title: 'Updated', version: 3, file_path: '/test.md', space_key: 'DEV' }
      ]);

      vi.spyOn(db, 'getAllPages').mockReturnValue([
        { page_id: '2', title: 'Updated', version: 3, file_path: '/test.md', space_key: 'DEV' }
      ]);

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const summary = detector.generateChangeSummary(confluencePages);
      
      expect(summary.total).toBe(2);
      expect(summary.changes.new).toBe(1);
      expect(summary.changes.updated).toBe(1);
      expect(summary.needsSync).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up deleted pages', async () => {
      const deletedPages = [
        { page_id: '1', title: 'Deleted', file_path: '/deleted.md' }
      ];

      vi.spyOn(db, 'deletePage').mockReturnValue({});
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'unlinkSync').mockReturnValue();

      const results = await detector.cleanup(deletedPages, '/content');
      
      expect(results.deletedPages).toBe(1);
      expect(results.deletedFiles).toBe(1);
      expect(db.deletePage).toHaveBeenCalledWith('1');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/deleted.md');
    });

    it('should handle cleanup errors', async () => {
      const deletedPages = [
        { page_id: '1', title: 'Deleted', file_path: '/deleted.md' }
      ];

      vi.spyOn(db, 'deletePage').mockImplementation(() => {
        throw new Error('Database error');
      });

      const results = await detector.cleanup(deletedPages, '/content');
      
      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].error).toBe('Database error');
    });
  });
});
```

Run the tests:
```bash
npm test tests/change-detector.test.js
```

## Verification Checklist

- [ ] `src/sync/change-detector.js` created with all methods
- [ ] Change detection works by comparing version numbers
- [ ] New pages are correctly identified
- [ ] Updated pages are correctly identified
- [ ] Unchanged pages are skipped
- [ ] Deleted pages are detected across all spaces
- [ ] Deleted pages can be detected per space
- [ ] Missing files are identified
- [ ] Orphaned files are found
- [ ] Change summary generates correct statistics
- [ ] Cleanup removes deleted pages and files
- [ ] Unit tests added to test suite
- [ ] All tests pass (`npm test`)
- [ ] Manual test script runs successfully
- [ ] Changes committed with conventional commit format

## Expected Output

When running change detection, you should see:

```
Detecting changes for 38 pages...
  New: 5
  Updated: 8
  Unchanged: 25
  → 13 pages need syncing

Detected 2 deleted pages:
  - Old Documentation (12345)
  - Archived Page (67890)

Change Summary:
{
  "total": 38,
  "synced": 40,
  "changes": {
    "new": 5,
    "updated": 8,
    "deleted": 2
  },
  "issues": {
    "missingFiles": 0
  },
  "needsSync": true
}
```

## Integration with Previous Tasks

The ChangeDetector integrates with:
- **Task 3 (Database)**: Uses `db.getPage()`, `db.getAllPages()`, `db.getPagesBySpace()`, `db.deletePage()`
- **Task 6 (PageStorage)**: Checks file existence using file paths from database
- **Task 10 (Sync Service)**: Will be used to optimize sync by skipping unchanged pages

Example integration:
```javascript
import { ChangeDetector } from './src/sync/change-detector.js';
import { ConfluenceClient } from './src/confluence/client.js';
import { config } from './src/config.js';

const detector = new ChangeDetector();
const client = new ConfluenceClient();

// Single space sync
const confluencePages = await client.getPages('DEV');
const changedPages = detector.detectChanges(confluencePages);
console.log(`Syncing ${changedPages.length} of ${confluencePages.length} pages`);

// Detect deletions (safe for multi-space - only checks DEV space)
const deletedPages = detector.detectDeletedPages(confluencePages);
await detector.cleanup(deletedPages, config.storage.contentDir);

// Multi-space sync (preferred approach)
const spaceKeys = ['DEV', 'PROD'];
const allPages = [];

for (const spaceKey of spaceKeys) {
  const pages = await client.getPages(spaceKey);
  allPages.push(...pages);
}

// Detect changes across all spaces
const allChanges = detector.detectChanges(allPages);

// Detect deletions (automatically scoped to DEV and PROD spaces only)
const allDeleted = detector.detectDeletedPages(allPages);
```

## Usage Example

```javascript
import { ChangeDetector } from './src/sync/change-detector.js';

const detector = new ChangeDetector();

// Detect changes (synchronous - no await needed)
const changedPages = detector.detectChanges(confluencePages);

// Detect deletions (synchronous - automatically scoped to relevant spaces)
const deletedPages = detector.detectDeletedPages(confluencePages);

// Generate full summary (synchronous)
const summary = detector.generateChangeSummary(confluencePages);

// Clean up if needed (async - needs await)
if (summary.needsSync) {
  const cleanupResults = await detector.cleanup(
    deletedPages,
    config.storage.contentDir
  );
  console.log(`Cleaned up: ${cleanupResults.deletedPages} pages, ${cleanupResults.deletedFiles} files`);
}
```

## Commit Instructions

After completing this task and verifying all tests pass, commit with:

```bash
git add src/sync/change-detector.js tests/change-detector.test.js
git commit -m "feat(sync): add change detection for incremental updates

- Create ChangeDetector class for comparing Confluence and local pages
- Add detectChanges() to identify new, updated, and unchanged pages
- Add hasPageChanged() using version number comparison
- Add detectDeletedPages() to find removed Confluence pages
- Add detectDeletedPagesInSpace() for per-space deletion detection
- Add findMissingFiles() to identify database records without files
- Add findOrphanedFiles() to identify untracked files
- Add generateChangeSummary() for detailed sync statistics
- Add cleanup() method to remove deleted pages and orphaned files
- Add fileExists() helper for file validation
- Add comprehensive unit tests with mocking
- Add manual test script for validation

All tests passing"
```

## Files Created

- ✅ `src/sync/change-detector.js` - Change detection implementation
- ✅ `tests/change-detector.test.js` - Unit tests
- ✅ `test-change-detector.js` - Manual test script (optional, can delete after testing)

## Next Task

Continue to [Task 10: Full Sync Implementation](./task-10-full-sync.md)

## Notes

- Version number comparison is the most reliable way to detect changes
- Confluence increments version numbers on every edit
- Title changes are also checked in case pages are renamed
- The detector handles both new pages and updates to existing pages
- **IMPORTANT**: `detectDeletedPages()` is space-aware - it only checks spaces present in the confluencePages parameter to avoid false positives
- When syncing multiple spaces, pass all pages together or use `detectDeletedPagesInSpace()` for per-space checks
- Orphaned files can occur if pages are deleted outside the sync process
- Missing files indicate database corruption or manual file deletion
- **File Deletion**: The `cleanup()` method is mainly for testing and orphaned file cleanup. In production, `SyncService.handleDeletedPages()` is preferred as it uses `PageStorage.deletePage()` for consistency
- Change detection significantly reduces sync time for large spaces
- Statistics help users understand what changed since last sync
- Most methods are synchronous except `cleanup()` which needs async for file operations
- All database operations use the DatabaseManager API (`db.getPage()`, `db.getPagesBySpace()`, etc.)
- File operations use `path.join()` for cross-platform compatibility
- Consider adding content hash comparison in the future for better accuracy
- The `path` module must be imported for proper file path handling
