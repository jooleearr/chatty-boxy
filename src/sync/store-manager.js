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
        // Return the cached store reference
        // Note: We trust the database cache since store deletion is rare
        console.log(`✓ Using existing File Search store: ${existingStore.name}`);
        return existingStore;
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
    return db.getFileSearchStore() || null;
  }

  /**
   * Save store information to database
   * @param {Object} store - Store object from Gemini API
   */
  async saveStoreToDatabase(store) {
    db.upsertFileSearchStore({
      name: store.name,
      displayName: store.displayName || this.storeName,
      createdAt: store.createTime || new Date().toISOString()
    });
  }

  /**
   * Get store metadata from database
   * Note: The API doesn't support getting store details directly,
   * so we return the cached database record
   * @param {string} storeName - Name of the store
   * @returns {Promise<Object>} Store metadata from database
   */
  async getStoreMetadata(storeName) {
    const store = await this.getStoreFromDatabase();
    if (!store || store.name !== storeName) {
      throw new Error(`Store ${storeName} not found in database`);
    }
    return store;
  }

  /**
   * List all files in a store
   * Note: This may not be supported by the current @google/genai version
   * @param {string} storeName - Name of the store
   * @returns {Promise<Array>} List of files
   */
  async listStoreFiles(storeName) {
    // The @google/genai package may not expose listFiles for stores
    // This is a placeholder for future API support
    console.warn('listStoreFiles: API may not support this operation yet');
    return [];
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
      const stmt = db.db.prepare('DELETE FROM file_search_stores WHERE name = ?');
      stmt.run(storeName);
    } catch (error) {
      console.error('Error deleting store:', error.message);
      throw error;
    }
  }
}
