import { describe, it, expect, beforeEach } from 'vitest';
import { PageStorage } from '../src/confluence/storage.js';
import { initializeConfig } from '../src/config.js';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_CONTENT_DIR } from './setup.js';

describe('PageStorage', () => {
  let storage;

  beforeEach(() => {
    // Set up test environment
    process.env.CONFLUENCE_BASE_URL = 'https://test.atlassian.net';
    process.env.CONFLUENCE_EMAIL = 'test@example.com';
    process.env.CONFLUENCE_API_TOKEN = 'test-token';
    process.env.CONTENT_DIR = TEST_CONTENT_DIR;
    
    initializeConfig();
    storage = new PageStorage();
  });

  describe('Filename sanitization', () => {
    it('should convert spaces to hyphens', () => {
      const result = storage.sanitizeFilename('Simple Page Title');
      expect(result).toBe('simple-page-title');
    });

    it('should remove special characters', () => {
      const result = storage.sanitizeFilename('Page!@#$%^&*()Title');
      expect(result).toBe('pagetitle');
    });

    it('should handle multiple consecutive spaces', () => {
      const result = storage.sanitizeFilename('Page   with    spaces');
      expect(result).toBe('page-with-spaces');
    });

    it('should limit length to 100 characters', () => {
      const longTitle = 'a'.repeat(150);
      const result = storage.sanitizeFilename(longTitle);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('should remove leading and trailing hyphens', () => {
      const result = storage.sanitizeFilename('---Page Title---');
      expect(result).toBe('page-title');
    });

    it('should convert to lowercase', () => {
      const result = storage.sanitizeFilename('UPPER CASE Title');
      expect(result).toBe('upper-case-title');
    });
  });

  describe('Filename generation', () => {
    it('should generate filename with space key, page ID, and title', () => {
      const page = {
        id: 'page-123',
        title: 'Test Page',
        space: { key: 'DOCS', name: 'Documentation' },
      };

      const filename = storage.generateFilename(page);
      expect(filename).toBe('docs_page-123_test-page');
    });

    it('should handle special characters in title', () => {
      const page = {
        id: 'page-456',
        title: 'Special!@# Page',
        space: { key: 'TEST', name: 'Test' },
      };

      const filename = storage.generateFilename(page);
      expect(filename).toBe('test_page-456_special-page');
    });
  });

  describe('File operations', () => {
    const mockPage = {
      id: 'test-123',
      title: 'Test Page',
      space: { key: 'DOCS', name: 'Documentation' },
      version: { number: 1, when: '2024-01-01T00:00:00.000Z' },
      _links: { webui: '/spaces/DOCS/pages/123' },
      ancestors: [],
    };

    it('should save page to disk', () => {
      const markdown = '# Test Content\n\nThis is test content.';
      const result = storage.savePage(mockPage, markdown);

      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(fs.existsSync(result.filePath)).toBe(true);

      const savedContent = fs.readFileSync(result.filePath, 'utf-8');
      expect(savedContent).toBe(markdown);
    });

    it('should return error on file write failure', () => {
      // Create a page with invalid path
      const invalidPage = {
        ...mockPage,
        space: { key: '/invalid/path/', name: 'Invalid' },
      };

      const result = storage.savePage(invalidPage, 'content');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should delete existing file', () => {
      const markdown = '# Test';
      const saveResult = storage.savePage(mockPage, markdown);
      
      expect(fs.existsSync(saveResult.filePath)).toBe(true);
      
      const deleteResult = storage.deletePage(saveResult.filePath);
      expect(deleteResult).toBe(true);
      expect(fs.existsSync(saveResult.filePath)).toBe(false);
    });

    it('should return false when deleting non-existent file', () => {
      const result = storage.deletePage('/non/existent/file.md');
      expect(result).toBe(false);
    });
  });

  describe('Storage statistics', () => {
    it('should return correct statistics', () => {
      const page1 = {
        id: 'page-1',
        title: 'Page One',
        space: { key: 'TEST', name: 'Test' },
        version: { number: 1, when: '2024-01-01T00:00:00.000Z' },
        _links: { webui: '/spaces/TEST/pages/1' },
        ancestors: [],
      };

      const page2 = {
        id: 'page-2',
        title: 'Page Two',
        space: { key: 'TEST', name: 'Test' },
        version: { number: 1, when: '2024-01-01T00:00:00.000Z' },
        _links: { webui: '/spaces/TEST/pages/2' },
        ancestors: [],
      };

      storage.savePage(page1, '# Page One Content');
      storage.savePage(page2, '# Page Two Content');

      const stats = storage.getStorageStats();
      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.contentDir).toBe(TEST_CONTENT_DIR);
    });

    it('should handle empty directory', () => {
      const stats = storage.getStorageStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
    });
  });

  describe('Directory management', () => {
    it('should create content directory if it does not exist', () => {
      // Directory should be created by constructor
      expect(fs.existsSync(TEST_CONTENT_DIR)).toBe(true);
    });

    it('should get correct file path', () => {
      const page = {
        id: 'test-path',
        title: 'Test Path',
        space: { key: 'DOCS', name: 'Documentation' },
      };

      const filePath = storage.getPageFilePath(page);
      expect(filePath).toContain(TEST_CONTENT_DIR);
      expect(filePath).toContain('docs_test-path_test-path.md');
      expect(path.extname(filePath)).toBe('.md');
    });
  });
});
