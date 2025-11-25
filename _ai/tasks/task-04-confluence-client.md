# Task 4: Basic Confluence Client

**Phase**: 2 - Confluence Integration  
**Estimated Time**: 45 minutes  
**Prerequisites**: Tasks 1-3 completed

## Objective

Create a Confluence API client that can authenticate and fetch pages from specified spaces.

## File to Create

`src/confluence/client.js` - ~120 lines

## Implementation

Create `src/confluence/client.js`:

```javascript
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
```

## Testing

Create `src/test-confluence.js`:

```javascript
import { ConfluenceClient } from './confluence/client.js';
import { initializeConfig } from './config.js';

console.log('=== Testing Confluence Client ===\n');

if (!initializeConfig()) {
  console.error('Configuration failed. Please check your .env file.');
  process.exit(1);
}

const client = new ConfluenceClient();

async function runTests() {
  // Test 1: Connection
  console.log('Test 1: Testing connection...');
  const connected = await client.testConnection();
  if (connected) {
    console.log('✓ Connection successful\n');
  } else {
    console.error('✗ Connection failed');
    return;
  }

  // Test 2: Get spaces
  console.log('Test 2: Fetching spaces...');
  const spaces = await client.getSpaces();
  console.log(`✓ Found ${spaces.length} spaces:`);
  spaces.slice(0, 5).forEach(space => {
    console.log(`  - ${space.key}: ${space.name}`);
  });
  console.log();

  // Test 3: Get pages from first configured space
  if (config.confluence.spaceKeys.length > 0) {
    const spaceKey = config.confluence.spaceKeys[0];
    console.log(`Test 3: Fetching pages from ${spaceKey}...`);
    
    try {
      const pages = await client.getAllPages(spaceKey);
      console.log(`✓ Fetched ${pages.length} pages\n`);
      
      if (pages.length > 0) {
        const firstPage = pages[0];
        console.log('Sample page:');
        console.log(`  ID: ${firstPage.id}`);
        console.log(`  Title: ${firstPage.title}`);
        console.log(`  Version: ${firstPage.version.number}`);
        console.log(`  URL: ${client.getPageUrl(firstPage)}`);
      }
    } catch (error) {
      console.error('✗ Error:', error.message);
    }
  } else {
    console.log('⚠️  No spaces configured in CONFLUENCE_SPACE_KEYS');
  }
}

runTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
```

Run the test:

```bash
node src/test-confluence.js
```

Expected output:
```
=== Testing Confluence Client ===

✓ Configuration loaded successfully
  Confluence: https://yourcompany.atlassian.net
  Spaces: DOCS, TEAM
  ...

Test 1: Testing connection...
✓ Connection successful

Test 2: Fetching spaces...
✓ Found 15 spaces:
  - DOCS: Documentation
  - TEAM: Team Space
  - ENG: Engineering
  ...

Test 3: Fetching pages from DOCS...
  Fetching pages from space: DOCS
    Fetched 100 pages so far...
    Fetched 145 pages so far...
  ✓ Total pages fetched: 145
✓ Fetched 145 pages

Sample page:
  ID: 123456789
  Title: Getting Started Guide
  Version: 5
  URL: https://yourcompany.atlassian.net/wiki/spaces/DOCS/pages/123456789
```

## Verification Checklist

- [ ] `src/confluence/client.js` created
- [ ] Connection test passes
- [ ] Can fetch list of spaces
- [ ] Can fetch pages from a space
- [ ] Error handling works for invalid credentials
- [ ] Page URLs are constructed correctly

## Troubleshooting

### Authentication Error (401)
- Verify `CONFLUENCE_EMAIL` is correct
- Verify `CONFLUENCE_API_TOKEN` is valid
- Generate new token at: https://id.atlassian.com/manage-profile/security/api-tokens

### Network Error
- Check `CONFLUENCE_BASE_URL` is correct
- Ensure no trailing slash in base URL
- Verify network access to Confluence

### No Pages Found
- Verify space key exists and is accessible
- Check user has permission to view the space
- Try with a different space

## Files Created

- ✅ `src/confluence/client.js`
- ✅ `src/test-confluence.js` (temporary)

## Cleanup

After verification:

```bash
rm src/test-confluence.js
```

## Next Task

Continue to [Task 5: HTML to Markdown Conversion](./task-05-html-conversion.md)

## Notes

- Uses basic auth (email + API token)
- Includes automatic pagination
- Respects `MAX_PAGES_PER_SYNC` limit
- Axios timeout set to 30 seconds
- Expands necessary fields (body, version, space, ancestors)
