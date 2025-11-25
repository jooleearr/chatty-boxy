# Task 1: Project Structure & Dependencies

**Phase**: 1 - Foundation & Configuration
**Estimated Time**: 15 minutes
**Prerequisites**: None

## Objective

Set up the basic project structure and install all required dependencies for the Confluence chatbot.

## Files to Create

```
chatty-boxy/
├── src/
│   ├── config.js          (will create in Task 2)
│   ├── confluence/
│   ├── sync/
│   ├── chatbot/
│   └── utils/
├── data/                  (will be created by app)
├── .env.example
└── package.json           (update existing)
```

## Implementation Steps

### Step 1: Create directory structure

```bash
cd /Users/juliahide/projects/chatty-boxy
mkdir -p src/confluence src/sync src/chatbot src/utils
```

### Step 2: Update package.json

Add the following dependencies to your existing `package.json`:

```json
{
  "name": "chatty-boxy",
  "version": "1.0.0",
  "type": "module",
  "description": "Confluence-integrated chatbot using Gemini File Search API",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "sync": "node src/index.js sync",
    "chat": "node src/index.js chat",
    "schedule": "node src/index.js schedule",
    "demo": "node file_search_demo.js"
  },
  "keywords": ["confluence", "chatbot", "gemini", "ai", "file-search"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "@google/genai": "^1.30.0",
    "axios": "^1.6.0",
    "better-sqlite3": "^9.0.0",
    "node-cron": "^3.0.0",
    "dotenv": "^16.0.0",
    "turndown": "^7.1.0"
  }
}
```

**New dependencies**:
- `axios`: HTTP client for Confluence API
- `better-sqlite3`: Native SQLite database with synchronous API (better performance than sql.js)
- `node-cron`: Scheduled sync functionality
- `dotenv`: Environment variable management
- `turndown`: HTML to Markdown conversion

### Step 3: Create .env.example

Create a template for environment variables:

```bash
# Confluence Configuration
CONFLUENCE_BASE_URL=https://yourcompany.atlassian.net
CONFLUENCE_EMAIL=your-email@company.com
CONFLUENCE_API_TOKEN=your_confluence_api_token
CONFLUENCE_SPACE_KEYS=DOCS,TEAM,ENGINEERING

# Gemini API
GOOGLE_API_KEY=your_gemini_api_key

# Sync Configuration
SYNC_INTERVAL_HOURS=24
MAX_PAGES_PER_SYNC=500

# Storage
DB_PATH=./data/confluence-sync.db

# Optional: Logging
LOG_LEVEL=info
```

### Step 4: Create .gitignore updates

Add to existing `.gitignore` (or create if it doesn't exist):

```
# Environment
.env

# Data
data/
*.db
*.db-shm
*.db-wal

# Logs
logs/
*.log

# Node modules (if not already there)
node_modules/
```

### Step 5: Install dependencies

```bash
npm install
```

## Verification

After completing this task:

1. Verify directory structure exists:
   ```bash
   ls -la src/
   # Should show: confluence/ sync/ chatbot/ utils/
   ```

2. Verify dependencies installed:
   ```bash
   npm list --depth=0
   ```
   Should show all dependencies listed above.

3. Verify .env.example exists:
   ```bash
   cat .env.example
   ```

## Files Created/Modified

- ✅ `package.json` (modified)
- ✅ `.env.example` (created)
- ✅ `.gitignore` (updated)
- ✅ `src/` directory structure (created)

## Next Task

Continue to [Task 2: Configuration System](./task-02-configuration.md)

## Notes

- Keep the original `file_search_demo.js` in the root as a reference
- The `npm run demo` script allows you to run the original POC
- The `src/` directory will contain the new production code
