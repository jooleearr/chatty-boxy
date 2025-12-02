# Task 7: File Search Store Manager

**Phase**: 3 - File Search Store Management  
**Estimated Time**: 30 minutes  
**Prerequisites**: Tasks 1-6 completed

## Objective

Create a File Search Store Manager that handles the lifecycle of Gemini File Search stores - creating new stores, retrieving existing ones, and managing store metadata in the database. This is the foundation for uploading Confluence content to Gemini's File Search API.

## File to Create

`src/sync/store-manager.js` - ~150 lines

## Implementation

Create `src/sync/store-manager.js`:

```javascript
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { db } from '../utils/database.js';

/**
 * File Search Store Manager
 * Manages Gemini File Search store lifecycle
 */
export class StoreManager {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.storeName = config.gemini.fileSearchStoreName;
  }

  /**
   * Get existing store or create a new one
   * @returns {Promise<Object>} Store object with name and metadata
   */
  async getOrCreateStore() {
    try {
      // Check if we have a store in the database
      const existingStore = await this.getStoreFromDatabase();
      
      if (existingStore) {
        // Verify the store still exists in Gemini
        try {
          const store = await this.ai.fileSearchStores.get({ 
            fileSearchStoreName: existingStore.store_name 
          });
          console.log(`✓ Using existing File Search store: ${store.name}`);
          return store;
        } catch (error) {
          if (error.message.includes('not found') || error.status === 404) {
            console.log('⚠ Stored reference not found in Gemini, creating new store...');
            // Fall through to create new store
          } else {
            throw error;
          }
        }
      }

      // Create a new store
      console.log('Creating new File Search store...');
      const store = await this.ai.fileSearchStores.create({
        config: { displayName: this.storeName }
      });

      console.log(`✓ Created File Search store: ${store.name}`);

      // Save to database
      await this.saveStoreToDatabase(store);

      return store;
    } catch (error) {
      console.error('Error getting or creating store:', error.message);
      throw error;
    }
  }

  /**
   * Get store information from database
   * @returns {Promise<Object|null>} Store record or null
   */
  async getStoreFromDatabase() {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM file_search_stores ORDER BY created_at DESC LIMIT 1',
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  /**
   * Save store information to database
   * @param {Object} store - Store object from Gemini API
   */
  async saveStoreToDatabase(store) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO file_search_stores (store_name, display_name)
         VALUES (?, ?)
         ON CONFLICT(store_name) DO UPDATE SET
           display_name = excluded.display_name,
           updated_at = CURRENT_TIMESTAMP`,
        [store.name, store.displayName || this.storeName],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Get store metadata
   * @param {string} storeName - Name of the store
   * @returns {Promise<Object>} Store metadata
   */
  async getStoreMetadata(storeName) {
    try {
      const store = await this.ai.fileSearchStores.get({ 
        fileSearchStoreName: storeName 
      });
      return store;
    } catch (error) {
      console.error('Error getting store metadata:', error.message);
      throw error;
    }
  }

  /**
   * List all files in a store
   * @param {string} storeName - Name of the store
   * @returns {Promise<Array>} List of files
   */
  async listStoreFiles(storeName) {
    try {
      const response = await this.ai.fileSearchStores.listFiles({
        fileSearchStoreName: storeName,
      });
      return response.files || [];
    } catch (error) {
      console.error('Error listing store files:', error.message);
      throw error;
    }
  }

  /**
   * Delete a store (use with caution)
   * @param {string} storeName - Name of the store to delete
   */
  async deleteStore(storeName) {
    try {
      await this.ai.fileSearchStores.delete({ 
        fileSearchStoreName: storeName,
        force: true 
      });
      console.log(`✓ Deleted File Search store: ${storeName}`);
      
      // Remove from database
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM file_search_stores WHERE store_name = ?',
          [storeName],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } catch (error) {
      console.error('Error deleting store:', error.message);
      throw error;
    }
  }
}
```

## Testing

### Manual Testing

Create a test script `test-store-manager.js` in the project root:

```javascript
import { StoreManager } from './src/sync/store-manager.js';

async function testStoreManager() {
  console.log('Testing Store Manager...\n');

  const manager = new StoreManager();

  try {
    // Test 1: Get or create store
    console.log('Test 1: Get or create store');
    const store = await manager.getOrCreateStore();
    console.log('Store name:', store.name);
    console.log('Display name:', store.displayName);
    console.log('✓ Test 1 passed\n');

    // Test 2: Get store metadata
    console.log('Test 2: Get store metadata');
    const metadata = await manager.getStoreMetadata(store.name);
    console.log('Metadata:', metadata);
    console.log('✓ Test 2 passed\n');

    // Test 3: Get store from database
    console.log('Test 3: Get store from database');
    const dbStore = await manager.getStoreFromDatabase();
    console.log('Database record:', dbStore);
    console.log('✓ Test 3 passed\n');

    // Test 4: List files (should be empty initially)
    console.log('Test 4: List store files');
    const files = await manager.listStoreFiles(store.name);
    console.log('Number of files:', files.length);
    console.log('✓ Test 4 passed\n');

    console.log('All tests passed! ✓');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testStoreManager();
```

Run the test:
```bash
node test-store-manager.js
```

### Unit Tests

Add tests to the test suite in `tests/store-manager.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoreManager } from '../src/sync/store-manager.js';

describe('StoreManager', () => {
  let manager;

  beforeEach(() => {
    manager = new StoreManager();
  });

  describe('Store lifecycle', () => {
    it('should create a new store if none exists', async () => {
      // Mock database to return no existing store
      vi.spyOn(manager, 'getStoreFromDatabase').mockResolvedValue(null);
      
      // Mock AI client to return a new store
      const mockStore = {
        name: 'fileSearchStores/test-store-123',
        displayName: 'Test Store',
      };
      vi.spyOn(manager.ai.fileSearchStores, 'create').mockResolvedValue(mockStore);
      vi.spyOn(manager, 'saveStoreToDatabase').mockResolvedValue();

      const store = await manager.getOrCreateStore();

      expect(store).toBeDefined();
      expect(store.name).toBe(mockStore.name);
      expect(manager.ai.fileSearchStores.create).toHaveBeenCalled();
    });

    it('should return existing store if found', async () => {
      const mockDbStore = {
        store_name: 'fileSearchStores/existing-123',
        display_name: 'Existing Store',
      };
      
      const mockApiStore = {
        name: mockDbStore.store_name,
        displayName: mockDbStore.display_name,
      };

      vi.spyOn(manager, 'getStoreFromDatabase').mockResolvedValue(mockDbStore);
      vi.spyOn(manager.ai.fileSearchStores, 'get').mockResolvedValue(mockApiStore);

      const store = await manager.getOrCreateStore();

      expect(store).toBeDefined();
      expect(store.name).toBe(mockDbStore.store_name);
      expect(manager.ai.fileSearchStores.get).toHaveBeenCalledWith({
        fileSearchStoreName: mockDbStore.store_name
      });
    });

    it('should recreate store if database reference is stale', async () => {
      const mockDbStore = {
        store_name: 'fileSearchStores/stale-123',
        display_name: 'Stale Store',
      };

      const mockNewStore = {
        name: 'fileSearchStores/new-456',
        displayName: 'New Store',
      };

      vi.spyOn(manager, 'getStoreFromDatabase').mockResolvedValue(mockDbStore);
      const notFoundError = new Error('Store not found');
      notFoundError.status = 404;
      vi.spyOn(manager.ai.fileSearchStores, 'get').mockRejectedValue(notFoundError);
      vi.spyOn(manager.ai.fileSearchStores, 'create').mockResolvedValue(mockNewStore);
      vi.spyOn(manager, 'saveStoreToDatabase').mockResolvedValue();

      const store = await manager.getOrCreateStore();

      expect(store.name).toBe(mockNewStore.name);
      expect(manager.ai.fileSearchStores.create).toHaveBeenCalled();
    });
  });

  describe('Store operations', () => {
    it('should list files in a store', async () => {
      const mockFiles = [
        { name: 'files/file1', displayName: 'doc1.md' },
        { name: 'files/file2', displayName: 'doc2.md' },
      ];

      vi.spyOn(manager.ai.fileSearchStores, 'listFiles').mockResolvedValue({
        files: mockFiles,
      });

      const files = await manager.listStoreFiles('fileSearchStores/test-123');

      expect(files).toHaveLength(2);
      expect(files[0].displayName).toBe('doc1.md');
    });

    it('should handle empty file list', async () => {
      vi.spyOn(manager.ai.fileSearchStores, 'listFiles').mockResolvedValue({
        files: [],
      });

      const files = await manager.listStoreFiles('fileSearchStores/test-123');

      expect(files).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should throw error if store creation fails', async () => {
      vi.spyOn(manager, 'getStoreFromDatabase').mockResolvedValue(null);
      vi.spyOn(manager.ai.fileSearchStores, 'create').mockRejectedValue(
        new Error('API error')
      );

      await expect(manager.getOrCreateStore()).rejects.toThrow('API error');
    });

    it('should throw error if getting store metadata fails', async () => {
      vi.spyOn(manager.ai.fileSearchStores, 'get').mockRejectedValue(
        new Error('Not found')
      );

      await expect(
        manager.getStoreMetadata('fileSearchStores/invalid')
      ).rejects.toThrow('Not found');
    });
  });
});
```

## Verification Checklist

- [ ] `src/sync/store-manager.js` created with all methods
- [ ] Store creation works with valid API key
- [ ] Store retrieval from database works
- [ ] Store metadata can be fetched from Gemini API
- [ ] Store name is properly saved to database
- [ ] Error handling works for invalid stores
- [ ] Manual test script runs successfully
- [ ] Unit tests added to test suite
- [ ] All tests pass (`npm test`)
- [ ] Changes committed with conventional commit format

## Database Schema Reference

The `file_search_stores` table (created in Task 3):

```sql
CREATE TABLE file_search_stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Expected Output

When running the manual test, you should see:

```
Testing Store Manager...

Test 1: Get or create store
Creating new File Search store...
✓ Created File Search store: fileSearchStores/abc123...
Store name: fileSearchStores/abc123...
Display name: confluence-knowledge-base
✓ Test 1 passed

Test 2: Get store metadata
Metadata: { name: 'fileSearchStores/abc123...', displayName: '...' }
✓ Test 2 passed

Test 3: Get store from database
Database record: { id: 1, store_name: '...', display_name: '...', ... }
✓ Test 3 passed

Test 4: List store files
Number of files: 0
✓ Test 4 passed

All tests passed! ✓
```

## Commit Instructions

After completing this task and verifying all tests pass, commit with:

```bash
git add src/sync/store-manager.js tests/store-manager.test.js
git commit -m "feat(sync): add File Search store manager

- Implement StoreManager class for store lifecycle management
- Add getOrCreateStore() to handle store creation/retrieval
- Add database operations for store persistence
- Handle stale store references and recreation
- Add listStoreFiles() and getStoreMetadata() methods
- Add comprehensive unit tests with mocks
- Add manual test script for validation

All tests passing"
```

## Files Created

- ✅ `src/sync/store-manager.js` - Store manager implementation
- ✅ `tests/store-manager.test.js` - Unit tests
- ✅ `test-store-manager.js` - Manual test script (optional, can delete after testing)

## Next Task

Continue to [Task 8: Upload & Operation Polling](./task-08-upload-polling.md)

## Notes

- The store name is configured in `.env` as `FILE_SEARCH_STORE_NAME`
- Store names follow the format: `fileSearchStores/{id}`
- Store metadata is cached in the database to avoid unnecessary API calls
- If a store is deleted in Gemini but still referenced in the database, it will be recreated automatically
- Uses `@google/genai` package (NOT `@google/generative-ai`)
- Store operations are asynchronous and should be awaited
- API reference: https://ai.google.dev/gemini-api/docs/file-search#javascript
