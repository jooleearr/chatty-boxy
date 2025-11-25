# Task 3: Database Schema & Initialization

**Phase**: 1 - Foundation & Configuration  
**Estimated Time**: 30 minutes  
**Prerequisites**: Tasks 1-2 completed

## Objective

Create the SQLite database schema and initialization utilities for tracking synced pages, sync history, and file search stores.

## File to Create

`src/utils/database.js` - ~150 lines

## Database Schema

### Tables

1. **synced_pages** - Tracks individual Confluence pages
2. **sync_history** - Audit log of sync operations  
3. **file_search_stores** - Gemini file search store metadata

## Implementation

Create `src/utils/database.js`:

```javascript
import Database from 'better-sqlite3';
import { config } from '../config.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Database manager class
 */
export class DatabaseManager {
  constructor(dbPath = config.storage.dbPath) {
    // Ensure data directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
    this.initSchema();
  }

  /**
   * Initialize database schema
   */
  initSchema() {
    this.db.exec(`
      -- Synced Confluence pages
      CREATE TABLE IF NOT EXISTS synced_pages (
        page_id TEXT PRIMARY KEY,
        space_key TEXT NOT NULL,
        title TEXT NOT NULL,
        version INTEGER NOT NULL,
        last_synced TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_search_store_name TEXT,
        url TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Index for faster queries
      CREATE INDEX IF NOT EXISTS idx_synced_pages_space 
        ON synced_pages(space_key);
      CREATE INDEX IF NOT EXISTS idx_synced_pages_title 
        ON synced_pages(title);

      -- Sync history audit log
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_started TEXT NOT NULL,
        sync_completed TEXT,
        pages_added INTEGER DEFAULT 0,
        pages_updated INTEGER DEFAULT 0,
        pages_deleted INTEGER DEFAULT 0,
        pages_skipped INTEGER DEFAULT 0,
        status TEXT NOT NULL, -- 'running', 'completed', 'failed'
        error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- File search stores
      CREATE TABLE IF NOT EXISTS file_search_stores (
        name TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used TEXT
      );
    `);
  }

  /**
   * Get synced page by ID
   */
  getPage(pageId) {
    return this.db.prepare(`
      SELECT * FROM synced_pages WHERE page_id = ?
    `).get(pageId);
  }

  /**
   * Get all synced pages
   */
  getAllPages() {
    return this.db.prepare(`
      SELECT * FROM synced_pages ORDER BY last_synced DESC
    `).all();
  }

  /**
   * Get pages by space key
   */
  getPagesBySpace(spaceKey) {
    return this.db.prepare(`
      SELECT * FROM synced_pages WHERE space_key = ?
    `).all(spaceKey);
  }

  /**
   * Upsert (insert or update) a synced page
   */
  upsertPage(page) {
    return this.db.prepare(`
      INSERT INTO synced_pages 
        (page_id, space_key, title, version, last_synced, file_path, file_search_store_name, url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(page_id) DO UPDATE SET
        space_key = excluded.space_key,
        title = excluded.title,
        version = excluded.version,
        last_synced = excluded.last_synced,
        file_path = excluded.file_path,
        file_search_store_name = excluded.file_search_store_name,
        url = excluded.url,
        updated_at = datetime('now')
    `).run(
      page.pageId,
      page.spaceKey,
      page.title,
      page.version,
      page.lastSynced,
      page.filePath,
      page.fileSearchStoreName,
      page.url
    );
  }

  /**
   * Delete a synced page
   */
  deletePage(pageId) {
    return this.db.prepare(`
      DELETE FROM synced_pages WHERE page_id = ?
    `).run(pageId);
  }

  /**
   * Start a new sync operation
   */
  startSync() {
    const result = this.db.prepare(`
      INSERT INTO sync_history (sync_started, status)
      VALUES (datetime('now'), 'running')
    `).run();
    return result.lastInsertRowid;
  }

  /**
   * Complete a sync operation
   */
  completeSync(syncId, stats) {
    return this.db.prepare(`
      UPDATE sync_history 
      SET sync_completed = datetime('now'),
          pages_added = ?,
          pages_updated = ?,
          pages_deleted = ?,
          pages_skipped = ?,
          status = 'completed'
      WHERE id = ?
    `).run(
      stats.added || 0,
      stats.updated || 0,
      stats.deleted || 0,
      stats.skipped || 0,
      syncId
    );
  }

  /**
   * Fail a sync operation
   */
  failSync(syncId, error) {
    return this.db.prepare(`
      UPDATE sync_history 
      SET sync_completed = datetime('now'),
          status = 'failed',
          error = ?
      WHERE id = ?
    `).run(error, syncId);
  }

  /**
   * Get last sync
   */
  getLastSync() {
    return this.db.prepare(`
      SELECT * FROM sync_history 
      ORDER BY id DESC LIMIT 1
    `).get();
  }

  /**
   * Get sync history
   */
  getSyncHistory(limit = 10) {
    return this.db.prepare(`
      SELECT * FROM sync_history 
      ORDER BY id DESC LIMIT ?
    `).all(limit);
  }

  /**
   * Upsert file search store
   */
  upsertFileSearchStore(store) {
    return this.db.prepare(`
      INSERT INTO file_search_stores (name, display_name, created_at, last_used)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(name) DO UPDATE SET
        last_used = datetime('now')
    `).run(store.name, store.displayName, store.createdAt);
  }

  /**
   * Get file search store
   */
  getFileSearchStore() {
    return this.db.prepare(`
      SELECT * FROM file_search_stores LIMIT 1
    `).get();
  }

  /**
   * Get database statistics
   */
  getStats() {
    const totalPages = this.db.prepare(`
      SELECT COUNT(*) as count FROM synced_pages
    `).get();

    const pagesBySpace = this.db.prepare(`
      SELECT space_key, COUNT(*) as count 
      FROM synced_pages 
      GROUP BY space_key
    `).all();

    const lastSync = this.getLastSync();

    return {
      totalPages: totalPages.count,
      pagesBySpace,
      lastSync,
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Export a default instance
export const db = new DatabaseManager();
```

## Testing

Create test file `src/test-database.js`:

```javascript
import { DatabaseManager } from './utils/database.js';
import { config } from './config.js';

console.log('=== Testing Database ===\n');

// Use a test database
const testDbPath = './data/test.db';
const db = new DatabaseManager(testDbPath);

// Test 1: Insert a page
console.log('Test 1: Insert page');
db.upsertPage({
  pageId: 'test-123',
  spaceKey: 'TEST',
  title: 'Test Page',
  version: 1,
  lastSynced: new Date().toISOString(),
  filePath: '/test/path.md',
  fileSearchStoreName: 'test-store',
  url: 'https://example.com/page'
});
console.log('✓ Page inserted\n');

// Test 2: Retrieve page
console.log('Test 2: Retrieve page');
const page = db.getPage('test-123');
console.log('Retrieved:', page);
console.log('✓ Page retrieved\n');

// Test 3: Start sync
console.log('Test 3: Sync operations');
const syncId = db.startSync();
console.log('Started sync:', syncId);

// Simulate sync completion
db.completeSync(syncId, {
  added: 1,
  updated: 0,
  deleted: 0,
  skipped: 0
});
console.log('✓ Sync completed\n');

// Test 4: Get stats
console.log('Test 4: Statistics');
const stats = db.getStats();
console.log('Stats:', JSON.stringify(stats, null, 2));
console.log('✓ Stats retrieved\n');

// Cleanup
db.close();
console.log('✓ Database closed');
console.log('\nTest database created at:', testDbPath);
console.log('You can inspect it with: sqlite3', testDbPath);
```

Run test:

```bash
node src/test-database.js
```

Expected output:
```
=== Testing Database ===

Test 1: Insert page
✓ Page inserted

Test 2: Retrieve page
Retrieved: {
  page_id: 'test-123',
  space_key: 'TEST',
  title: 'Test Page',
  ...
}
✓ Page retrieved

Test 3: Sync operations
Started sync: 1
✓ Sync completed

Test 4: Statistics
Stats: {
  "totalPages": 1,
  "pagesBySpace": [...],
  "lastSync": {...}
}
✓ Stats retrieved

✓ Database closed
```

## Verification Checklist

- [ ] `src/utils/database.js` created
- [ ] Database file created in `data/` directory
- [ ] All tables created successfully
- [ ] CRUD operations work correctly
- [ ] Sync tracking works
- [ ] Statistics queries work

## Files Created

- ✅ `src/utils/database.js`
- ✅ `src/test-database.js` (temporary)
- ✅ `data/test.db` (test database)

## Cleanup

After verification:

```bash
rm src/test-database.js
rm data/test.db*
```

## Next Task

Continue to [Task 4: Basic Confluence Client](./task-04-confluence-client.md)

## Notes

- SQLite WAL mode enabled for better concurrency
- Indexes added for common queries
- All timestamps use ISO 8601 format
- The database auto-creates the data directory if it doesn't exist
