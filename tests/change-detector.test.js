import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetector } from '../src/sync/change-detector.js';
import { db } from '../src/utils/database.js';

// Mock fs module with all methods used in the codebase
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn()
}));

// Import fs after mocking
import * as fs from 'fs';

describe('ChangeDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new ChangeDetector();
    vi.clearAllMocks();
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
      fs.existsSync.mockReturnValue(true);

      expect(detector.fileExists(syncedPage)).toBe(true);
    });

    it('should return false when file does not exist', () => {
      const syncedPage = { file_path: '/path/to/file.md' };
      fs.existsSync.mockReturnValue(false);

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

      fs.existsSync.mockImplementation((path) => {
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

      fs.existsSync.mockReturnValue(true);

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
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockReturnValue();

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
