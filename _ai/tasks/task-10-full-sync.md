# Task 10: Full Sync Implementation

**Phase**: 4 - Sync Service  
**Estimated Time**: 45 minutes  
**Prerequisites**: Tasks 1-9 completed

## Objective

Create a complete sync service that orchestrates the entire workflow: fetching pages from Confluence, converting to markdown, saving locally, uploading to File Search store, and updating the database. This is the main entry point that ties together all previous components.

## File to Create

`src/sync/sync-service.js` - ~300 lines

## Implementation

**Important Implementation Notes:**
- Use `db` from `../utils/database.js` (not `../database.js`)
- Follow the `db.startSync()` → `db.completeSync()` / `db.failSync()` pattern
- Use DatabaseManager methods: `db.upsertPage()`, `db.deletePage()`, `db.getPage()`, `db.getStats()`
- `PageStorage.savePage()` returns `{ success, filePath }` object
- `PageStorage.deletePage()` takes `filePath` parameter (not `pageId`)
- `ChangeDetector` methods are synchronous (no `await` needed except `cleanup()`)
- Change detection is space-aware - safe for multi-space syncs

Create `src/sync/sync-service.js`:

```javascript
import { ConfluenceClient } from '../confluence/client.js';
import { MarkdownConverter } from '../confluence/converter.js';
import { PageStorage } from '../confluence/storage.js';
import { StoreManager } from './store-manager.js';
import { UploadManager } from './upload-manager.js';
import { ChangeDetector } from './change-detector.js';
import { db } from '../utils/database.js';
import { config } from '../config.js';

/**
 * Sync Service
 * Orchestrates the complete sync workflow from Confluence to File Search
 */
export class SyncService {
  constructor() {
    this.confluenceClient = new ConfluenceClient();
    this.converter = new MarkdownConverter();
    this.storage = new PageStorage();
    this.storeManager = new StoreManager();
    this.uploadManager = new UploadManager();
    this.changeDetector = new ChangeDetector();
  }

  /**
   * Run full sync process
   * @param {Object} options - Sync options
   * @param {boolean} options.forceFullSync - Force full sync even if pages haven't changed
   * @param {Array<string>} options.spaceKeys - Specific space keys to sync (null for all)
   * @returns {Promise<Object>} Sync results with statistics
   */
  async sync(options = {}) {
    const startTime = Date.now();
    const stats = {
      pagesProcessed: 0,
      pagesAdded: 0,
      pagesUpdated: 0,
      pagesDeleted: 0,
      pagesSkipped: 0,
      pagesErrored: 0,
      errors: []
    };

    // Start sync in database
    const syncId = db.startSync();

    try {
      console.log('\n╔════════════════════════════════════════════╗');
      console.log('║   Confluence → File Search Sync Service   ║');
      console.log('╚════════════════════════════════════════════╝\n');

      // Step 1: Get or create File Search store
      console.log('Step 1: Initializing File Search store...');
      const store = await this.storeManager.getOrCreateStore();
      console.log(`✓ Store ready: ${store.name}\n`);

      // Step 2: Determine which spaces to sync
      const spaceKeys = options.spaceKeys || config.confluence.spaceKeys;
      console.log(`Step 2: Syncing ${spaceKeys.length} space(s): ${spaceKeys.join(', ')}\n`);

      // Step 3: Fetch all pages from Confluence
      console.log('Step 3: Fetching pages from Confluence...');
      const allPages = [];
      
      for (const spaceKey of spaceKeys) {
        try {
          const pages = await this.confluenceClient.getPages(spaceKey);
          console.log(`  ✓ ${spaceKey}: ${pages.length} pages`);
          allPages.push(...pages);
        } catch (error) {
          console.error(`  ✗ ${spaceKey}: Failed to fetch pages`, error.message);
          stats.errors.push({
            stage: 'fetch',
            spaceKey,
            error: error.message
          });
        }
      }

      console.log(`\n✓ Total pages fetched: ${allPages.length}\n`);

      // Step 4: Detect changes (unless force full sync)
      const pagesToProcess = options.forceFullSync 
        ? allPages 
        : this.changeDetector.detectChanges(allPages);

      const skippedCount = allPages.length - pagesToProcess.length;
      if (skippedCount > 0) {
        console.log(`Step 4: Change detection - ${pagesToProcess.length} changed, ${skippedCount} unchanged\n`);
        stats.pagesSkipped = skippedCount;
      } else {
        console.log(`Step 4: Processing all ${allPages.length} pages (${options.forceFullSync ? 'force sync' : 'first sync'})\n`);
      }

      // Step 5: Process each page
      console.log('Step 5: Processing pages...');
      const filesToUpload = [];

      for (let i = 0; i < pagesToProcess.length; i++) {
        const page = pagesToProcess[i];
        const pageNum = i + 1;
        
        try {
          console.log(`[${pageNum}/${pagesToProcess.length}] ${page.title}`);
          
          // Convert HTML to Markdown
          const markdown = this.converter.convert(page.body.storage.value);
          
          // Save to local storage (returns object with filePath)
          const saveResult = this.storage.savePage(page, markdown);
          
          if (!saveResult.success) {
            throw new Error(saveResult.error || 'Failed to save page');
          }

          // Queue for upload
          filesToUpload.push({
            filePath: saveResult.filePath,
            displayName: `${page.space.key}/${page.title}`,
            mimeType: 'text/markdown',
            pageId: page.id,
            title: page.title,
            spaceKey: page.space.key,
            version: page.version.number,
            url: `${config.confluence.baseUrl}/wiki/spaces/${page.space.key}/pages/${page.id}`
          });

          stats.pagesProcessed++;
          console.log(`  ✓ Converted and saved`);

        } catch (error) {
          console.error(`  ✗ Failed to process: ${error.message}`);
          stats.pagesErrored++;
          stats.errors.push({
            stage: 'process',
            pageId: page.id,
            title: page.title,
            error: error.message
          });
        }
      }

      console.log(`\n✓ Processed ${stats.pagesProcessed} pages\n`);

      // Step 6: Upload to File Search store
      if (filesToUpload.length > 0) {
        console.log('Step 6: Uploading to File Search store...');
        const uploadResults = await this.uploadManager.uploadFilesWithRetry(
          filesToUpload,
          store.name,
          3 // max retries
        );

        stats.pagesErrored += uploadResults.failed;
        stats.errors.push(...uploadResults.errors.map(e => ({
          stage: 'upload',
          ...e
        })));

        console.log(`✓ Upload complete: ${uploadResults.successful} successful, ${uploadResults.failed} failed\n`);
      }

      // Step 7: Update database
      console.log('Step 7: Updating database...');
      this.updateDatabase(filesToUpload, stats);
      console.log('✓ Database updated\n');

      // Step 8: Detect and handle deletions
      console.log('Step 8: Checking for deleted pages...');
      const deletedPages = this.changeDetector.detectDeletedPages(allPages);
      
      if (deletedPages.length > 0) {
        await this.handleDeletedPages(deletedPages);
        stats.pagesDeleted = deletedPages.length;
        console.log(`✓ Removed ${deletedPages.length} deleted pages\n`);
      } else {
        console.log('✓ No deleted pages\n');
      }

      // Calculate duration
      const duration = Math.round((Date.now() - startTime) / 1000);

      // Complete sync in database
      db.completeSync(syncId, {
        added: stats.pagesAdded,
        updated: stats.pagesUpdated,
        deleted: stats.pagesDeleted,
        skipped: stats.pagesSkipped
      });

      // Log summary
      this.logSyncSummary(stats, duration);

      return {
        success: true,
        stats,
        duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('\n✗ Sync failed:', error.message);
      
      // Mark sync as failed in database
      db.failSync(syncId, error.message);
      
      return {
        success: false,
        error: error.message,
        stats,
        duration: Math.round((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Update database with sync results
   * @param {Array<Object>} pages - Processed pages
   * @param {Object} stats - Sync statistics
   */
  updateDatabase(pages, stats) {
    for (const page of pages) {
      try {
        // Check if page exists in database
        const existing = db.getPage(page.pageId);

        if (existing) {
          // Update existing page using upsertPage
          db.upsertPage({
            pageId: page.pageId,
            spaceKey: page.spaceKey,
            title: page.title,
            version: page.version,
            lastSynced: new Date().toISOString(),
            filePath: page.filePath,
            fileSearchStoreName: null, // Will be set by store manager if needed
            url: page.url
          });
          
          stats.pagesUpdated++;
        } else {
          // Insert new page using upsertPage
          db.upsertPage({
            pageId: page.pageId,
            spaceKey: page.spaceKey,
            title: page.title,
            version: page.version,
            lastSynced: new Date().toISOString(),
            filePath: page.filePath,
            fileSearchStoreName: null,
            url: page.url
          });
          
          stats.pagesAdded++;
        }
      } catch (error) {
        console.error(`  Warning: Failed to update database for page ${page.pageId}:`, error.message);
      }
    }
  }

  /**
   * Handle deleted pages
   * @param {Array<Object>} deletedPages - Pages that were deleted from Confluence
   */
  async handleDeletedPages(deletedPages) {
    for (const page of deletedPages) {
      try {
        // Remove from database
        db.deletePage(page.page_id);

        // Remove local file if it exists
        if (page.file_path) {
          this.storage.deletePage(page.file_path);
        }

        console.log(`  ✓ Removed: ${page.title}`);
      } catch (error) {
        console.error(`  ✗ Failed to remove page ${page.page_id}:`, error.message);
      }
    }
  }

  /**
   * Log sync summary
   * @param {Object} stats - Sync statistics
   * @param {number} duration - Duration in seconds
   */
  logSyncSummary(stats, duration) {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║            Sync Summary                    ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log(`Total processed:  ${stats.pagesProcessed}`);
    console.log(`Added:            ${stats.pagesAdded || 0}`);
    console.log(`Updated:          ${stats.pagesUpdated || 0}`);
    console.log(`Deleted:          ${stats.pagesDeleted || 0}`);
    console.log(`Skipped:          ${stats.pagesSkipped || 0}`);
    console.log(`Errored:          ${stats.pagesErrored || 0}`);
    console.log(`Duration:         ${duration}s`);
    
    if (stats.errors.length > 0) {
      console.log(`\nErrors encountered: ${stats.errors.length}`);
      stats.errors.slice(0, 5).forEach((err, i) => {
        console.log(`  ${i + 1}. [${err.stage}] ${err.error}`);
      });
      if (stats.errors.length > 5) {
        console.log(`  ... and ${stats.errors.length - 5} more`);
      }
    }
    
    console.log('════════════════════════════════════════════\n');
  }

  /**
   * Get sync status
   * @returns {Object} Current sync status
   */
  getSyncStatus() {
    try {
      // Use DatabaseManager's getStats method
      return db.getStats();
    } catch (error) {
      console.error('Failed to get sync status:', error.message);
      return null;
    }
  }
}
```

## Testing

### Manual Testing

Create a test script `test-sync-service.js` in the project root:

```javascript
import { SyncService } from './src/sync/sync-service.js';

async function testSyncService() {
  console.log('Testing Sync Service...\n');

  const syncService = new SyncService();

  // Test 1: Full sync
  console.log('Test 1: Running full sync\n');
  const result = await syncService.sync({ forceFullSync: true });
  
  console.log('\nSync Result:');
  console.log('Success:', result.success);
  console.log('Statistics:', result.stats);
  console.log('Duration:', result.duration, 'seconds');

  // Test 2: Get sync status
  console.log('\n\nTest 2: Getting sync status');
  const status = syncService.getSyncStatus();
  console.log('Status:', status);

  // Test 3: Incremental sync
  console.log('\n\nTest 3: Running incremental sync (should skip unchanged pages)');
  const incrementalResult = await syncService.sync({ forceFullSync: false });
  console.log('Skipped pages:', incrementalResult.stats.pagesSkipped);

  console.log('\n✓ All tests completed');
}

testSyncService().catch(console.error);
```

Run the test:
```bash
node test-sync-service.js
```

### Unit Tests

Add tests to the test suite in `tests/sync-service.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService } from '../src/sync/sync-service.js';

describe('SyncService', () => {
  let service;

  beforeEach(() => {
    service = new SyncService();
    
    // Mock all dependencies
    vi.spyOn(service.confluenceClient, 'getPages').mockResolvedValue([]);
    vi.spyOn(service.storeManager, 'getOrCreateStore').mockResolvedValue({
      name: 'fileSearchStores/test-store-123'
    });
    vi.spyOn(service.changeDetector, 'detectChanges').mockImplementation(pages => pages);
    vi.spyOn(service.changeDetector, 'detectDeletedPages').mockResolvedValue([]);
    vi.spyOn(service, 'updateDatabase').mockResolvedValue();
  });

  describe('Full sync', () => {
    it('should complete successful sync with no pages', async () => {
      const result = await service.sync({ forceFullSync: true });

      expect(result.success).toBe(true);
      expect(result.stats.pagesProcessed).toBe(0);
      expect(result.stats.pagesErrored).toBe(0);
    });

    it('should process pages successfully', async () => {
      const mockPages = [
        {
          id: '123',
          title: 'Test Page',
          space: { key: 'TEST' },
          version: { number: 1 },
          body: { storage: { value: '<p>Content</p>' } }
        }
      ];

      vi.spyOn(service.confluenceClient, 'getPages').mockResolvedValue(mockPages);
      vi.spyOn(service.converter, 'convert').mockReturnValue('# Test Page\n\nContent');
      vi.spyOn(service.storage, 'savePage').mockReturnValue({
        success: true,
        filePath: '/path/to/file.md'
      });
      vi.spyOn(service.uploadManager, 'uploadFilesWithRetry').mockResolvedValue({
        successful: 1,
        failed: 0,
        errors: []
      });
      vi.spyOn(db, 'startSync').mockReturnValue(1);
      vi.spyOn(db, 'completeSync').mockReturnValue();

      const result = await service.sync({ forceFullSync: true });

      expect(result.success).toBe(true);
      expect(result.stats.pagesProcessed).toBe(1);
      expect(service.converter.convert).toHaveBeenCalled();
      expect(service.storage.savePage).toHaveBeenCalled();
      expect(service.uploadManager.uploadFilesWithRetry).toHaveBeenCalled();
    });

    it('should handle page processing errors', async () => {
      const mockPages = [
        {
          id: '123',
          title: 'Test Page',
          space: { key: 'TEST' },
          version: { number: 1 },
          body: { storage: { value: '<p>Content</p>' } }
        }
      ];

      vi.spyOn(service.confluenceClient, 'getPages').mockResolvedValue(mockPages);
      vi.spyOn(service.converter, 'convert').mockImplementation(() => {
        throw new Error('Conversion failed');
      });
      vi.spyOn(db, 'startSync').mockReturnValue(1);
      vi.spyOn(db, 'completeSync').mockReturnValue();

      const result = await service.sync({ forceFullSync: true });

      expect(result.success).toBe(true); // Sync continues despite errors
      expect(result.stats.pagesErrored).toBe(1);
      expect(result.stats.errors).toHaveLength(1);
    });

    it('should handle upload failures', async () => {
      const mockPages = [
        {
          id: '123',
          title: 'Test Page',
          space: { key: 'TEST' },
          version: { number: 1 },
          body: { storage: { value: '<p>Content</p>' } }
        }
      ];

      vi.spyOn(service.confluenceClient, 'getPages').mockResolvedValue(mockPages);
      vi.spyOn(service.converter, 'convert').mockReturnValue('# Test');
      vi.spyOn(service.storage, 'savePage').mockReturnValue({
        success: true,
        filePath: '/path/to/file.md'
      });
      vi.spyOn(service.uploadManager, 'uploadFilesWithRetry').mockResolvedValue({
        successful: 0,
        failed: 1,
        errors: [{ file: 'test.md', error: 'Upload failed' }]
      });
      vi.spyOn(db, 'startSync').mockReturnValue(1);
      vi.spyOn(db, 'completeSync').mockReturnValue();

      const result = await service.sync({ forceFullSync: true });

      expect(result.success).toBe(true);
      expect(result.stats.pagesErrored).toBe(1);
    });
  });

  describe('Incremental sync', () => {
    it('should skip unchanged pages', async () => {
      const mockPages = [
        {
          id: '123',
          title: 'Test Page',
          space: { key: 'TEST' },
          version: { number: 1 },
          body: { storage: { value: '<p>Content</p>' } }
        },
        {
          id: '456',
          title: 'Another Page',
          space: { key: 'TEST' },
          version: { number: 1 },
          body: { storage: { value: '<p>More content</p>' } }
        }
      ];

      vi.spyOn(service.confluenceClient, 'getPages').mockResolvedValue(mockPages);
      vi.spyOn(service.changeDetector, 'detectChanges').mockReturnValue([mockPages[0]]); // Only first page changed
      vi.spyOn(service.converter, 'convert').mockReturnValue('# Test');
      vi.spyOn(service.storage, 'savePage').mockReturnValue({
        success: true,
        filePath: '/path/to/file.md'
      });
      vi.spyOn(service.uploadManager, 'uploadFilesWithRetry').mockResolvedValue({
        successful: 1,
        failed: 0,
        errors: []
      });
      vi.spyOn(db, 'startSync').mockReturnValue(1);
      vi.spyOn(db, 'completeSync').mockReturnValue();

      const result = await service.sync({ forceFullSync: false });

      expect(result.stats.pagesSkipped).toBe(1);
      expect(result.stats.pagesProcessed).toBe(1);
    });

    it('should handle deleted pages', async () => {
      const deletedPages = [
        { page_id: '789', title: 'Deleted Page', file_path: '/path/to/file.md' }
      ];

      vi.spyOn(service.confluenceClient, 'getPages').mockResolvedValue([]);
      vi.spyOn(service.changeDetector, 'detectDeletedPages').mockReturnValue(deletedPages);
      vi.spyOn(service.storage, 'deletePage').mockReturnValue(true);
      vi.spyOn(db, 'deletePage').mockReturnValue();
      vi.spyOn(db, 'startSync').mockReturnValue(1);
      vi.spyOn(db, 'completeSync').mockReturnValue();

      const result = await service.sync({ forceFullSync: false });

      expect(result.stats.pagesDeleted).toBe(1);
      expect(service.storage.deletePage).toHaveBeenCalledWith('789');
    });
  });

  describe('Multiple spaces', () => {
    it('should sync pages from multiple spaces', async () => {
      const mockPagesSpace1 = [
        {
          id: '1',
          title: 'Page 1',
          space: { key: 'SPACE1' },
          version: { number: 1 },
          body: { storage: { value: '<p>Content 1</p>' } }
        }
      ];

      const mockPagesSpace2 = [
        {
          id: '2',
          title: 'Page 2',
          space: { key: 'SPACE2' },
          version: { number: 1 },
          body: { storage: { value: '<p>Content 2</p>' } }
        }
      ];

      vi.spyOn(service.confluenceClient, 'getPages')
        .mockResolvedValueOnce(mockPagesSpace1)
        .mockResolvedValueOnce(mockPagesSpace2);
      
      vi.spyOn(service.converter, 'convert').mockReturnValue('# Test');
      vi.spyOn(service.storage, 'savePage').mockReturnValue({
        success: true,
        filePath: '/path/to/file.md'
      });
      vi.spyOn(service.uploadManager, 'uploadFilesWithRetry').mockResolvedValue({
        successful: 2,
        failed: 0,
        errors: []
      });
      vi.spyOn(db, 'startSync').mockReturnValue(1);
      vi.spyOn(db, 'completeSync').mockReturnValue();

      // Mock config
      const originalConfig = { ...service.confluenceClient.config };
      service.confluenceClient.config = { confluence: { spaceKeys: ['SPACE1', 'SPACE2'] } };

      const result = await service.sync({ 
        forceFullSync: true,
        spaceKeys: ['SPACE1', 'SPACE2']
      });

      expect(result.stats.pagesProcessed).toBe(2);
      expect(service.confluenceClient.getPages).toHaveBeenCalledTimes(2);
    });

    it('should continue if one space fails', async () => {
      vi.spyOn(service.confluenceClient, 'getPages')
        .mockRejectedValueOnce(new Error('Space not found'))
        .mockResolvedValueOnce([]);

      const result = await service.sync({ 
        forceFullSync: true,
        spaceKeys: ['BAD_SPACE', 'GOOD_SPACE']
      });

      expect(result.success).toBe(true);
      expect(result.stats.errors).toHaveLength(1);
      expect(result.stats.errors[0].stage).toBe('fetch');
    });
  });

  describe('Sync status', () => {
    it('should return sync status', () => {
      const mockStats = {
        totalPages: 10,
        pagesBySpace: { DEV: 5, PROD: 5 },
        lastSync: { status: 'completed' }
      };

      vi.spyOn(db, 'getStats').mockReturnValue(mockStats);

      const status = service.getSyncStatus();
      
      expect(status).toBeDefined();
      expect(status.totalPages).toBe(10);
    });
  });
});
```

Run the tests:
```bash
npm test tests/sync-service.test.js
```

## Verification Checklist

- [ ] `src/sync/sync-service.js` created with all methods
- [ ] Full sync works end-to-end with real Confluence API
- [ ] Incremental sync detects and skips unchanged pages
- [ ] Multiple spaces are synced correctly
- [ ] Error handling works for failed pages/spaces
- [ ] Deleted pages are detected and removed
- [ ] Database is updated correctly
- [ ] Sync statistics are accurate
- [ ] Unit tests added to test suite
- [ ] All tests pass (`npm test`)
- [ ] Manual test script runs successfully
- [ ] Changes committed with conventional commit format

## Expected Output

When running a full sync, you should see:

```
╔════════════════════════════════════════════╗
║   Confluence → File Search Sync Service   ║
╚════════════════════════════════════════════╝

Step 1: Initializing File Search store...
✓ Store ready: fileSearchStores/abc123

Step 2: Syncing 2 space(s): DEV, PROD

Step 3: Fetching pages from Confluence...
  ✓ DEV: 15 pages
  ✓ PROD: 23 pages

✓ Total pages fetched: 38

Step 4: Processing all 38 pages (force sync)

Step 5: Processing pages...
[1/38] Getting Started
  ✓ Converted and saved
[2/38] API Documentation
  ✓ Converted and saved
...
[38/38] Release Notes
  ✓ Converted and saved

✓ Processed 38 pages

Step 6: Uploading to File Search store...
[1/38]   Uploading: DEV/Getting Started
  ✓ Upload complete: DEV/Getting Started
...

✓ Upload complete: 38 successful, 0 failed

Step 7: Updating database...
✓ Database updated

Step 8: Checking for deleted pages...
✓ No deleted pages

╔════════════════════════════════════════════╗
║            Sync Summary                    ║
╚════════════════════════════════════════════╝
Total processed:  38
Added:            38
Updated:          0
Deleted:          0
Skipped:          0
Errored:          0
Duration:         45s
════════════════════════════════════════════
```

## Integration with Previous Tasks

The SyncService integrates all previous components:
- **Task 4 (ConfluenceClient)**: Fetches pages from Confluence
- **Task 5 (MarkdownConverter)**: Converts HTML to Markdown
- **Task 6 (PageStorage)**: Saves markdown files locally
- **Task 7 (StoreManager)**: Manages File Search store
- **Task 8 (UploadManager)**: Uploads files to File Search
- **Task 9 (ChangeDetector)**: Detects changed/deleted pages

## Usage Example

```javascript
import { SyncService } from './src/sync/sync-service.js';

const syncService = new SyncService();

// Full sync
await syncService.sync({ forceFullSync: true });

// Incremental sync
await syncService.sync({ forceFullSync: false });

// Sync specific spaces
await syncService.sync({ 
  spaceKeys: ['DEV', 'PROD'],
  forceFullSync: false 
});

// Get status
const status = syncService.getSyncStatus();
console.log('Last sync:', status.lastSync);
console.log('Total pages:', status.totalPages);
```

## Commit Instructions

After completing this task and verifying all tests pass, commit with:

```bash
git add src/sync/sync-service.js tests/sync-service.test.js
git commit -m "feat(sync): implement full sync service orchestration

- Create SyncService class to orchestrate complete sync workflow
- Add sync() method with full and incremental sync support
- Integrate all components: Confluence, converter, storage, upload, change detection
- Use DatabaseManager API (db.startSync, db.completeSync, db.upsertPage, etc.)
- Add multi-space sync with individual error handling
- Add space-aware deletion detection to avoid false positives
- Add comprehensive sync statistics and progress logging
- Add getSyncStatus() for sync monitoring using db.getStats()
- Handle errors gracefully with db.failSync() and detailed error reporting
- Track sync lifecycle in sync_history table
- Add unit tests with dependency mocking
- Add manual test script for validation

All tests passing"
```

## Files Created

- ✅ `src/sync/sync-service.js` - Full sync service implementation
- ✅ `tests/sync-service.test.js` - Unit tests
- ✅ `test-sync-service.js` - Manual test script (optional, can delete after testing)

## Next Task

Continue to [Task 11: Sync Statistics & Reporting](./task-11-sync-stats.md)

## Notes

- The sync service is the main entry point for the sync workflow
- It orchestrates all components in the correct order
- **Database Integration**: Uses `db.startSync()` → `db.completeSync()` / `db.failSync()` pattern for proper sync tracking
- **Database API**: Uses DatabaseManager methods (`db.getPage()`, `db.upsertPage()`, `db.deletePage()`, `db.getStats()`)
- Error handling is crucial - one failed page shouldn't stop the entire sync
- Statistics help users understand what happened during sync
- The `forceFullSync` option is useful for first sync or troubleshooting
- Incremental sync saves time by skipping unchanged pages (uses `ChangeDetector.detectChanges()`)
- Multi-space support allows syncing different Confluence spaces
- **Change detection is space-aware**: `detectDeletedPages()` only checks spaces being synced to avoid false positives
- Database updates track page metadata and sync history
- The service can be used programmatically or via CLI
- Progress logging provides visibility during long-running syncs
- All errors are collected and reported at the end
- The sync process is idempotent - running it multiple times is safe
- **PageStorage.savePage()** returns `{ success, filePath }` object, not just the path
- **PageStorage.deletePage()** takes `filePath` parameter, not `pageId`
- Consider adding a dry-run option in the future for testing
- No need to import `path` module - not used in this file
