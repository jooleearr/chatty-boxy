# Task 6: Page Fetching & Storage

**Phase**: 2 - Confluence Integration  
**Estimated Time**: 30 minutes  
**Prerequisites**: Tasks 1-5 completed

## Objective

Create a page storage manager that saves converted Confluence pages as markdown files with proper naming, tracks file paths, and updates the database with page metadata.

## File to Create

`src/confluence/storage.js` - ~120 lines

## Implementation

Create `src/confluence/storage.js`:

```javascript
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
```

## Testing

Create `src/test-storage.js`:

```javascript
import { PageStorage } from './confluence/storage.js';
import { ConfluenceConverter } from './confluence/converter.js';
import { initializeConfig } from './config.js';
import * as fs from 'fs';

console.log('=== Testing Page Storage ===\n');

if (!initializeConfig()) {
  process.exit(1);
}

async function testStorage() {
  const storage = new PageStorage();
  const converter = new ConfluenceConverter();

  console.log('Test 1: Filename sanitization');
  const testNames = [
    'Simple Page',
    'Page with Special!@#$% Characters',
    'Page   with    Multiple    Spaces',
    'Very Long Page Title That Should Be Truncated Because It Exceeds Maximum Length Allowed For Filenames In The System'
  ];

  testNames.forEach(name => {
    const sanitized = storage.sanitizeFilename(name);
    console.log(`  "${name}" -> "${sanitized}"`);
  });
  console.log('✓ Filename sanitization works\n');

  console.log('Test 2: Generate filename');
  const mockPage = {
    id: 'test-123',
    title: 'Test Page',
    space: { key: 'DOCS', name: 'Documentation' },
    version: { number: 1, when: '2025-11-25T00:00:00.000Z' },
    _links: { webui: '/spaces/DOCS/pages/123' },
    ancestors: [],
  };

  const filename = storage.generateFilename(mockPage);
  console.log(`  Generated: ${filename}`);
  console.log('✓ Filename generation works\n');

  console.log('Test 3: Save page');
  const markdown = converter.convert(mockPage, 'https://example.atlassian.net');
  const result = storage.savePageWithMetadata(mockPage, markdown, 'test-store');

  if (result.success) {
    console.log(`✓ Page saved successfully`);
    console.log(`  File path: ${result.filePath}`);
    console.log(`  File exists: ${fs.existsSync(result.filePath)}`);
    
    // Verify file content
    const savedContent = fs.readFileSync(result.filePath, 'utf-8');
    console.log(`  File size: ${savedContent.length} bytes`);
  } else {
    console.error('✗ Failed to save page:', result.error);
  }
  console.log();

  console.log('Test 4: Storage statistics');
  const stats = storage.getStorageStats();
  console.log('  Statistics:');
  console.log(`    Total files: ${stats.totalFiles}`);
  console.log(`    Total size: ${stats.totalSizeMB} MB`);
  console.log(`    Directory: ${stats.contentDir}`);
  console.log('✓ Statistics retrieved\n');

  console.log('Test 5: Database lookup');
  const savedPage = db.getPage(mockPage.id);
  if (savedPage) {
    console.log('  Page in database:');
    console.log(`    ID: ${savedPage.page_id}`);
    console.log(`    Title: ${savedPage.title}`);
    console.log(`    Space: ${savedPage.space_key}`);
    console.log(`    Version: ${savedPage.version}`);
    console.log(`    File path: ${savedPage.file_path}`);
    console.log('✓ Database record created\n');
  } else {
    console.error('✗ Page not found in database\n');
  }

  console.log('=== All Tests Passed ===');
}

testStorage().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
```

Run the test:

```bash
node src/test-storage.js
```

Expected output:
```
=== Testing Page Storage ===

✓ Configuration loaded successfully
  ...

Test 1: Filename sanitization
  "Simple Page" -> "simple-page"
  "Page with Special!@#$% Characters" -> "page-with-special-characters"
  "Page   with    Multiple    Spaces" -> "page-with-multiple-spaces"
  "Very Long Page Title That Should Be Truncated..." -> "very-long-page-title-that-should-be-truncated-because-it-exceeds-maximum-length-allowed"
✓ Filename sanitization works

Test 2: Generate filename
  Generated: docs_test-123_test-page
✓ Filename generation works

Test 3: Save page
✓ Page saved successfully
  File path: ./data/confluence-content/docs_test-123_test-page.md
  File exists: true
  File size: 245 bytes

Test 4: Storage statistics
  Statistics:
    Total files: 2
    Total size: 0.48 MB
    Directory: ./data/confluence-content
✓ Statistics retrieved

Test 5: Database lookup
  Page in database:
    ID: test-123
    Title: Test Page
    Space: DOCS
    Version: 1
    File path: ./data/confluence-content/docs_test-123_test-page.md
✓ Database record created

=== All Tests Passed ===
```

## Verification Checklist

- [ ] `src/confluence/storage.js` created
- [ ] Filename sanitization works correctly
- [ ] Files saved with proper naming convention
- [ ] Database updated with file paths
- [ ] Storage statistics calculated correctly
- [ ] File deletion works
- [ ] Orphaned file cleanup works
- [ ] Error handling for file system operations

## Key Features

### Filename Strategy
- **Format**: `{space-key}_{page-id}_{sanitized-title}.md`
- **Benefits**:
  - Unique even if title changes
  - Easy to identify space and page
  - Filesystem safe
  - Sortable by space

### Database Integration
- Stores file path for each page
- Tracks sync timestamp
- Records version for change detection
- Associates with file search store

### Error Handling
- File write errors caught and reported
- Database errors don't prevent file save
- Graceful handling of missing directories
- Returns detailed error information

## Common Issues

### Permission Errors
- Ensure `data/confluence-content/` directory is writable
- Check disk space availability
- Verify user permissions

### Filename Collisions
- Unlikely due to page ID in filename
- If occurs, check page ID extraction

### Database Sync Issues
- File saves even if database update fails
- Manual cleanup may be needed
- Use `cleanupOrphanedFiles()` utility

## Files Created

- ✅ `src/confluence/storage.js`
- ✅ `src/test-storage.js` (temporary)
- ✅ `data/confluence-content/*.md` (page files)

## Cleanup

After verification:

```bash
rm src/test-storage.js
# Keep stored pages for next task
```

## Next Task

Continue to [Task 7: File Search Store Manager](./task-07-store-manager.md)

## Notes

- File naming includes page ID to ensure uniqueness
- All filesystem operations are synchronous for simplicity
- Database and file storage kept in sync
- Storage statistics useful for monitoring
- Cleanup utility helps maintain consistency
- Consider adding file compression for large deployments
- Future: Add support for attachments and images
