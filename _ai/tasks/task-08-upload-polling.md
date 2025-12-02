# Task 8: Upload & Operation Polling

**Phase**: 3 - File Search Store Management  
**Estimated Time**: 30 minutes  
**Prerequisites**: Tasks 1-7 completed

## Objective

Create an upload manager that handles uploading Confluence markdown files to the Gemini File Search store and polls operation status until completion. This is a critical component that bridges local storage with the Gemini API.

## File to Create

`src/sync/upload-manager.js` - ~150 lines

## Implementation

Create `src/sync/upload-manager.js`:

```javascript
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
```

## Testing

### Manual Testing

Create a test script `test-upload-manager.js` in the project root:

```javascript
import { UploadManager } from './src/sync/upload-manager.js';
import { StoreManager } from './src/sync/store-manager.js';
import * as fs from 'fs';
import * as path from 'path';

async function testUploadManager() {
  console.log('Testing Upload Manager...\n');

  // Step 1: Get or create store
  console.log('Step 1: Getting File Search store');
  const storeManager = new StoreManager();
  const store = await storeManager.getOrCreateStore();
  console.log(`Store: ${store.name}\n`);

  // Step 2: Create a test file
  console.log('Step 2: Creating test file');
  const testDir = path.join(process.cwd(), 'data', 'test-uploads');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  const testFile = path.join(testDir, 'test-page.md');
  fs.writeFileSync(testFile, `# Test Page

This is a test page for upload manager testing.

## Features

- File upload
- Operation polling
- Error handling
`);
  console.log(`Created: ${testFile}\n`);

  // Step 3: Test single file upload
  console.log('Step 3: Testing single file upload');
  const uploadManager = new UploadManager();
  
  try {
    await uploadManager.uploadFile(testFile, store.name, {
      displayName: 'Test Page',
      mimeType: 'text/markdown'
    });
    console.log('✓ Single file upload passed\n');
  } catch (error) {
    console.error('✗ Single file upload failed:', error.message);
    throw error;
  }

  // Step 4: Test batch upload
  console.log('Step 4: Testing batch upload');
  const files = [
    {
      filePath: testFile,
      displayName: 'Test Page 1',
      mimeType: 'text/markdown'
    },
    {
      filePath: testFile,
      displayName: 'Test Page 2',
      mimeType: 'text/markdown'
    }
  ];

  const results = await uploadManager.uploadFiles(files, store.name);
  console.log(`Results:`, results);
  console.log('✓ Batch upload passed\n');

  // Cleanup
  console.log('Cleaning up test files...');
  fs.rmSync(testDir, { recursive: true, force: true });
  
  console.log('\nAll tests passed! ✓');
}

testUploadManager().catch(console.error);
```

Run the test:
```bash
node test-upload-manager.js
```

### Unit Tests

Add tests to the test suite in `tests/upload-manager.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UploadManager } from '../src/sync/upload-manager.js';
import * as fs from 'fs';

describe('UploadManager', () => {
  let manager;

  beforeEach(() => {
    manager = new UploadManager();
  });

  describe('File upload', () => {
    it('should upload a file successfully', async () => {
      const mockOperation = { done: false };
      const mockCompletedOperation = { done: true, error: null };

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(manager.ai.fileSearchStores, 'uploadToFileSearchStore').mockResolvedValue(mockOperation);
      vi.spyOn(manager, 'pollOperation').mockResolvedValue(mockCompletedOperation);

      const result = await manager.uploadFile('/path/to/file.md', 'store123', {
        displayName: 'Test File'
      });

      expect(result).toBeDefined();
      expect(result.done).toBe(true);
    });

    it('should throw error if file does not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      await expect(
        manager.uploadFile('/nonexistent/file.md', 'store123')
      ).rejects.toThrow('File not found');
    });

    it('should handle upload failures', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(manager.ai.fileSearchStores, 'uploadToFileSearchStore').mockRejectedValue(
        new Error('Upload failed')
      );

      await expect(
        manager.uploadFile('/path/to/file.md', 'store123')
      ).rejects.toThrow('Upload failed');
    });
  });

  describe('Batch upload', () => {
    it('should upload multiple files successfully', async () => {
      vi.spyOn(manager, 'uploadFile')
        .mockResolvedValueOnce({ done: true })
        .mockResolvedValueOnce({ done: true });

      const files = [
        { filePath: '/file1.md', displayName: 'File 1' },
        { filePath: '/file2.md', displayName: 'File 2' }
      ];

      const results = await manager.uploadFiles(files, 'store123');

      expect(results.total).toBe(2);
      expect(results.successful).toBe(2);
      expect(results.failed).toBe(0);
    });

    it('should handle partial failures', async () => {
      vi.spyOn(manager, 'uploadFile')
        .mockResolvedValueOnce({ done: true })
        .mockRejectedValueOnce(new Error('Upload failed'));

      const files = [
        { filePath: '/file1.md', displayName: 'File 1' },
        { filePath: '/file2.md', displayName: 'File 2' }
      ];

      const results = await manager.uploadFiles(files, 'store123');

      expect(results.total).toBe(2);
      expect(results.successful).toBe(1);
      expect(results.failed).toBe(1);
      expect(results.errors).toHaveLength(1);
    });
  });

  describe('Operation polling', () => {
    it('should poll until operation completes', async () => {
      const operations = [
        { done: false },
        { done: false },
        { done: true, error: null }
      ];

      let callCount = 0;
      manager.ai.operations.get = vi.fn().mockImplementation(() => {
        return Promise.resolve(operations[callCount++]);
      });

      const result = await manager.pollOperation({ done: false });

      expect(result.done).toBe(true);
      expect(manager.ai.operations.get).toHaveBeenCalledTimes(2);
    });

    it('should timeout after max poll time', async () => {
      manager.maxPollTime = 100; // 100ms for testing
      manager.ai.operations.get = vi.fn().mockResolvedValue({ done: false });

      await expect(
        manager.pollOperation({ done: false })
      ).rejects.toThrow('Operation timed out');
    });

    it('should handle operation errors', async () => {
      const errorOperation = {
        done: true,
        error: { message: 'Processing failed' }
      };

      manager.ai.operations.get = vi.fn().mockResolvedValue(errorOperation);

      await expect(
        manager.pollOperation({ done: false })
      ).rejects.toThrow('Operation failed: Processing failed');
    });
  });

  describe('Retry logic', () => {
    it('should retry failed uploads', async () => {
      vi.spyOn(manager, 'uploadFile')
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ done: true });

      const files = [{ filePath: '/file1.md', displayName: 'File 1' }];

      const results = await manager.uploadFilesWithRetry(files, 'store123', 3);

      expect(results.successful).toBe(1);
      expect(results.failed).toBe(0);
      expect(manager.uploadFile).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      vi.spyOn(manager, 'uploadFile').mockRejectedValue(new Error('Persistent failure'));

      const files = [{ filePath: '/file1.md', displayName: 'File 1' }];

      const results = await manager.uploadFilesWithRetry(files, 'store123', 2);

      expect(results.successful).toBe(0);
      expect(results.failed).toBe(1);
      expect(results.errors[0].attempts).toBe(2);
    });
  });
});
```

## Verification Checklist

- [ ] `src/sync/upload-manager.js` created with all methods
- [ ] Single file upload works with real API
- [ ] Batch file upload works correctly
- [ ] Operation polling completes successfully
- [ ] Timeout handling works for long operations
- [ ] Error handling works for failed uploads
- [ ] Retry logic with exponential backoff works
- [ ] Unit tests added to test suite
- [ ] All tests pass (`npm test`)
- [ ] Manual test script runs successfully
- [ ] Changes committed with conventional commit format

## Expected Output

When running the manual test, you should see:

```
Testing Upload Manager...

Step 1: Getting File Search store
✓ Using existing File Search store: fileSearchStores/...
Store: fileSearchStores/...

Step 2: Creating test file
Created: /path/to/data/test-uploads/test-page.md

Step 3: Testing single file upload
  Uploading: Test Page
  ✓ Upload complete: Test Page
✓ Single file upload passed

Step 4: Testing batch upload

Uploading 2 files to File Search store...
[1/2]   Uploading: Test Page 1
  ✓ Upload complete: Test Page 1
[2/2]   Uploading: Test Page 2
  ✓ Upload complete: Test Page 2

✓ Upload complete: 2 successful, 0 failed
Results: { total: 2, successful: 2, failed: 0, errors: [] }
✓ Batch upload passed

Cleaning up test files...

All tests passed! ✓
```

## Integration with Previous Tasks

The UploadManager integrates with:
- **Task 7 (StoreManager)**: Uses store name from `getOrCreateStore()`
- **Task 6 (PageStorage)**: Uploads markdown files created by PageStorage
- **Future Task 9**: Will use this for incremental updates

Example integration:
```javascript
// In sync workflow
const storeManager = new StoreManager();
const uploadManager = new UploadManager();
const store = await storeManager.getOrCreateStore();

// Upload all markdown files
const files = getAllMarkdownFiles();
await uploadManager.uploadFiles(files, store.name);
```

## Commit Instructions

After completing this task and verifying all tests pass, commit with:

```bash
git add src/sync/upload-manager.js tests/upload-manager.test.js
git commit -m "feat(sync): add upload manager with operation polling

- Implement UploadManager class for file uploads to File Search store
- Add uploadFile() method with operation polling until completion
- Add uploadFiles() for batch uploads with progress tracking
- Add uploadFilesWithRetry() with exponential backoff
- Add pollOperation() with timeout handling
- Handle upload failures and operation errors gracefully
- Add comprehensive unit tests with mocks
- Add manual test script for validation

All tests passing"
```

## Files Created

- ✅ `src/sync/upload-manager.js` - Upload manager implementation
- ✅ `tests/upload-manager.test.js` - Unit tests
- ✅ `test-upload-manager.js` - Manual test script (optional, can delete after testing)

## Next Task

Continue to [Task 9: Change Detection & Incremental Updates](./task-09-change-detection.md)

## Notes

- Upload operations are asynchronous and require polling
- Default poll interval is 2 seconds (configurable in config)
- Max poll time is 5 minutes to prevent infinite loops
- Retry logic uses exponential backoff: 1s, 2s, 4s, etc.
- Batch uploads process files sequentially to avoid rate limits
- Each uploaded file is tracked in the File Search store
- The API automatically handles file processing and indexing
- MIME type should be 'text/markdown' for Confluence content
- Display names help identify files in the store
- Failed uploads are captured with error details for debugging
- Uses `@google/genai` package for consistency
- API reference: https://ai.google.dev/gemini-api/docs/file-search#javascript
