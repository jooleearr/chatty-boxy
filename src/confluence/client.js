import axios from 'axios';
import { config } from '../config.js';

/**
 * Confluence API Client
 */
export class ConfluenceClient {
  constructor() {
    this.baseUrl = config.confluence.baseUrl;
    this.auth = {
      username: config.confluence.email,
      password: config.confluence.apiToken,
    };
    
    // Create axios instance with defaults
    this.client = axios.create({
      baseURL: `${this.baseUrl}/wiki/rest/api`,
      auth: this.auth,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });
  }

  /**
   * Get all pages from a space
   * @param {string} spaceKey - The space key
   * @param {number} limit - Number of results per request
   * @returns {Promise<Array>} Array of page objects
   */
  async getAllPages(spaceKey, limit = 100) {
    const pages = [];
    let start = 0;
    let hasMore = true;

    console.log(`  Fetching pages from space: ${spaceKey}`);

    while (hasMore && pages.length < config.sync.maxPagesPerSync) {
      try {
        const response = await this.client.get('/content', {
          params: {
            spaceKey,
            type: 'page',
            status: config.sync.excludeArchived ? 'current' : 'any',
            expand: 'body.storage,version,space,history.lastUpdated,ancestors',
            limit,
            start,
          },
        });

        const results = response.data.results || [];
        pages.push(...results);

        hasMore = results.length === limit;
        start += limit;

        console.log(`    Fetched ${pages.length} pages so far...`);
      } catch (error) {
        console.error(`    Error fetching pages: ${error.message}`);
        throw new Error(`Failed to fetch pages from space ${spaceKey}: ${error.message}`);
      }
    }

    console.log(`  ✓ Total pages fetched: ${pages.length}`);
    return pages;
  }

  /**
   * Get a single page by ID
   * @param {string} pageId - The page ID
   * @returns {Promise<Object>} Page object
   */
  async getPageById(pageId) {
    try {
      const response = await this.client.get(`/content/${pageId}`, {
        params: {
          expand: 'body.storage,version,space,ancestors,history.lastUpdated',
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch page ${pageId}: ${error.message}`);
    }
  }

  /**
   * Get page children
   * @param {string} pageId - Parent page ID
   * @returns {Promise<Array>} Array of child pages
   */
  async getPageChildren(pageId) {
    try {
      const response = await this.client.get(`/content/${pageId}/child/page`);
      return response.data.results || [];
    } catch (error) {
      throw new Error(`Failed to fetch children for page ${pageId}: ${error.message}`);
    }
  }

  /**
   * Test connection to Confluence
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      const response = await this.client.get('/space', {
        params: { limit: 1 },
      });
      return response.status === 200;
    } catch (error) {
      console.error('Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get spaces accessible to the user
   * @returns {Promise<Array>} Array of space objects
   */
  async getSpaces() {
    try {
      const response = await this.client.get('/space', {
        params: {
          limit: 100,
          expand: 'description.plain',
        },
      });
      return response.data.results || [];
    } catch (error) {
      throw new Error(`Failed to fetch spaces: ${error.message}`);
    }
  }

  /**
   * Build page URL
   * @param {Object} page - Page object
   * @returns {string} Full URL to the page
   */
  getPageUrl(page) {
    return `${this.baseUrl}/wiki${page._links.webui}`;
  }
}
