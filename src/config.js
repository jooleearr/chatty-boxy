import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load environment variables from project root
dotenv.config({ path: path.join(projectRoot, '.env') });

/**
 * Validate required environment variables
 */
function validateConfig() {
  const required = [
    'GOOGLE_API_KEY',
    'CONFLUENCE_BASE_URL',
    'CONFLUENCE_EMAIL',
    'CONFLUENCE_API_TOKEN',
    'CONFLUENCE_SPACE_KEYS',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please copy .env.example to .env and fill in your credentials.'
    );
  }
}

/**
 * Parse comma-separated space keys
 */
function parseSpaceKeys(spaceKeysString) {
  if (!spaceKeysString) return [];
  return spaceKeysString
    .split(',')
    .map(key => key.trim())
    .filter(key => key.length > 0);
}

/**
 * Build configuration object from environment variables
 * Use this for testing or when you need a fresh config without validation/logging
 */
export function buildConfig() {
  return {
    // Confluence settings
    confluence: {
      baseUrl: process.env.CONFLUENCE_BASE_URL?.replace(/\/$/, ''), // Remove trailing slash
      email: process.env.CONFLUENCE_EMAIL,
      apiToken: process.env.CONFLUENCE_API_TOKEN,
      spaceKeys: parseSpaceKeys(process.env.CONFLUENCE_SPACE_KEYS),
    },

    // Gemini API settings
    gemini: {
      apiKey: process.env.GOOGLE_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      fileSearchStoreName: process.env.FILE_SEARCH_STORE_NAME || 'confluence-knowledge-base',
    },

    // Sync settings
    sync: {
      intervalHours: parseInt(process.env.SYNC_INTERVAL_HOURS || '24', 10),
      maxPagesPerSync: parseInt(process.env.MAX_PAGES_PER_SYNC || '500', 10),
      excludeArchived: process.env.EXCLUDE_ARCHIVED !== 'false', // Default true
      operationPollInterval: 2000, // 2 seconds
    },

    // Storage settings
    storage: {
      dbPath: process.env.DB_PATH || path.join(projectRoot, 'data', 'confluence-sync.db'),
      contentDir: process.env.CONTENT_DIR || path.join(projectRoot, 'data', 'confluence-content'),
    },

    // Logging settings
    logging: {
      level: process.env.LOG_LEVEL || 'info',
    },

    // Paths
    paths: {
      projectRoot,
      src: __dirname,
      data: path.join(projectRoot, 'data'),
    },
  };
}

/**
 * Configuration object - initialized at module load
 * For production use, call initializeConfig() at app startup to validate and log config
 */
export let config = buildConfig();

/**
 * Initialize and validate configuration
 * Call this at application startup to:
 * - Rebuild config from current environment
 * - Validate all required fields are present
 * - Log configuration details
 * 
 * Returns true if valid, false if validation fails
 */
export function initializeConfig() {
  try {
    config = buildConfig();
    validateConfig();
    console.log('✓ Configuration loaded successfully');
    console.log(`  Confluence: ${config.confluence.baseUrl}`);
    console.log(`  Spaces: ${config.confluence.spaceKeys.join(', ')}`);
    console.log(`  Sync interval: ${config.sync.intervalHours} hours`);
    console.log(`  Database: ${config.storage.dbPath}`);
    return true;
  } catch (error) {
    console.error('✗ Configuration error:', error.message);
    return false;
  }
}

// Export for testing
export { validateConfig, parseSpaceKeys };
