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
        name: 'fileSearchStores/existing-123',
        display_name: 'Existing Store',
      };

      vi.spyOn(manager, 'getStoreFromDatabase').mockResolvedValue(mockDbStore);

      const store = await manager.getOrCreateStore();

      expect(store).toBeDefined();
      expect(store.name).toBe(mockDbStore.name);
    });

    it('should use cached store from database', async () => {
      const mockDbStore = {
        name: 'fileSearchStores/cached-123',
        display_name: 'Cached Store',
      };

      vi.spyOn(manager, 'getStoreFromDatabase').mockResolvedValue(mockDbStore);

      const store = await manager.getOrCreateStore();

      expect(store.name).toBe(mockDbStore.name);
      expect(store.display_name).toBe(mockDbStore.display_name);
    });
  });

  describe('Store operations', () => {
    it('should get store metadata from database', async () => {
      const mockDbStore = {
        name: 'fileSearchStores/test-123',
        display_name: 'Test Store',
      };

      vi.spyOn(manager, 'getStoreFromDatabase').mockResolvedValue(mockDbStore);

      const metadata = await manager.getStoreMetadata('fileSearchStores/test-123');

      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('fileSearchStores/test-123');
    });

    it('should return empty array for listStoreFiles', async () => {
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

    it('should throw error if getting store metadata for non-existent store', async () => {
      vi.spyOn(manager, 'getStoreFromDatabase').mockResolvedValue(null);

      await expect(
        manager.getStoreMetadata('fileSearchStores/invalid')
      ).rejects.toThrow('not found in database');
    });
  });
});
