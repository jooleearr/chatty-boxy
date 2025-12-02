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

      // Mock fs module functions
      vi.mock('fs', async () => {
        const actual = await vi.importActual('fs');
        return {
          ...actual,
          existsSync: vi.fn(() => true)
        };
      });

      manager.ai.fileSearchStores.uploadToFileSearchStore = vi.fn().mockResolvedValue(mockOperation);
      vi.spyOn(manager, 'pollOperation').mockResolvedValue(mockCompletedOperation);

      const result = await manager.uploadFile('/path/to/file.md', 'store123', {
        displayName: 'Test File'
      });

      expect(result).toBeDefined();
      expect(result.done).toBe(true);
    });

    it('should handle upload failures', async () => {
      manager.ai.fileSearchStores.uploadToFileSearchStore = vi.fn().mockRejectedValue(
        new Error('Upload failed')
      );

      await expect(
        manager.uploadFile('/path/to/file.md', 'store123')
      ).rejects.toThrow();
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

      // Reduce poll interval for faster tests
      manager.pollInterval = 10;

      const result = await manager.pollOperation({ done: false });

      expect(result.done).toBe(true);
      // Called 3 times: once for each false operation, once for true
      expect(manager.ai.operations.get).toHaveBeenCalledTimes(3);
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
