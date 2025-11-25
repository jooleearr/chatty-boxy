# Task 2: Configuration System

**Phase**: 1 - Foundation & Configuration  
**Estimated Time**: 20 minutes  
**Prerequisites**: Task 1 completed

## Objective

Create a centralized configuration system that loads and validates environment variables.

## File to Create

`src/config.js` - ~80 lines

## Implementation

Create `src/config.js`:

```javascript
import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

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
 * Configuration object
 */
export const config = {
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

/**
 * Initialize and validate configuration
 */
export function initializeConfig() {
  try {
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
```

## Testing

Create a quick test file `src/test-config.js` (temporary):

```javascript
import { config, initializeConfig } from './config.js';

console.log('=== Testing Configuration ===\n');

if (initializeConfig()) {
  console.log('\n=== Configuration Details ===');
  console.log(JSON.stringify(config, null, 2));
}
```

Run the test:

```bash
# First, create a .env file
cp .env.example .env
# Edit .env with your actual values

# Test the configuration
node src/test-config.js
```

Expected output:
```
=== Testing Configuration ===

✓ Configuration loaded successfully
  Confluence: https://yourcompany.atlassian.net
  Spaces: DOCS, TEAM, ENGINEERING
  Sync interval: 24 hours
  Database: /Users/juliahide/projects/chatty-boxy/data/confluence-sync.db

=== Configuration Details ===
{
  "confluence": {
    "baseUrl": "https://yourcompany.atlassian.net",
    "email": "your-email@company.com",
    "apiToken": "***",
    "spaceKeys": ["DOCS", "TEAM", "ENGINEERING"]
  },
  ...
}
```

## Verification Checklist

- [ ] `src/config.js` created
- [ ] `.env` file created from `.env.example`
- [ ] Configuration validates successfully
- [ ] All required environment variables are present
- [ ] Space keys are parsed correctly
- [ ] Paths are resolved correctly

## Files Created

- ✅ `src/config.js`
- ✅ `.env` (from .env.example)
- ✅ `src/test-config.js` (temporary test file)

## Cleanup

After verification, you can delete the test file:

```bash
rm src/test-config.js
```

## Next Task

Continue to [Task 3: Database Schema & Initialization](./task-03-database-setup.md)

## Notes

- The configuration is validated on import
- Missing required variables will throw an error
- All paths are resolved relative to the project root
- The config object is frozen after creation (for production, add `Object.freeze()`)
