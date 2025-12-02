# Chatty Boxy - Copilot Instructions

## Project Overview

**Chatty Boxy** is a Confluence-integrated chatbot using Google's Gemini File Search API. It syncs Confluence pages to a local database, converts them to Markdown, uploads them to a Gemini File Search store, and enables natural language queries over company documentation.

**Current Status**: Core infrastructure complete (Phases 1-3). The project has configuration, database, Confluence client, HTML-to-Markdown conversion, and page storage working. Sync service, chatbot, and web UI are planned but not yet implemented.

## Tech Stack

- **Runtime**: Node.js (ES Modules - note `"type": "module"` in package.json)
- **AI/ML**: Google Gemini API (`@google/genai`) with File Search functionality
- **Database**: better-sqlite3 (SQLite with WAL mode)
- **HTTP Client**: axios (for Confluence REST API)
- **HTML Conversion**: turndown (HTML to Markdown)
- **Testing**: Vitest (with globals enabled)
- **Scheduling**: node-cron (for background sync)
- **Environment**: dotenv

## Project Structure

```
/
├── src/
│   ├── config.js              # Environment config with validation
│   ├── confluence/            # Confluence integration
│   │   ├── client.js          # REST API client
│   │   ├── converter.js       # HTML to Markdown converter
│   │   └── storage.js         # File system + DB storage
│   ├── sync/                  # (Empty - future sync orchestration)
│   ├── chatbot/               # (Empty - future chatbot service)
│   └── utils/
│       └── database.js        # SQLite database manager
├── tests/                     # Vitest test files
├── data/                      # Runtime data (gitignored)
│   ├── confluence-sync.db     # SQLite database
│   └── confluence-content/    # Markdown files
├── _ai/                       # Project planning documents
│   ├── IMPLEMENTATION_PLAN.md # Phased task breakdown
│   ├── prompts/               # AI agent prompts
│   └── tasks/                 # Individual task specs
├── file_search_demo.js        # Original POC (standalone)
└── story.md                   # Test document for POC
```

## Coding Guidelines

### Code Style
- **Modules**: Use ES modules (`import`/`export`), not CommonJS
- **Async**: Use `async/await`, avoid raw promises or callbacks
- **Error Handling**: Try-catch for async operations, return error objects rather than throwing when graceful degradation is possible
- **Comments**: Minimal - only clarify non-obvious logic. Use JSDoc for public APIs
- **Naming**: camelCase for variables/functions, PascalCase for classes

### Database
- Use prepared statements (already set up in `database.js`)
- WAL mode is enabled for better concurrency
- Test database path: `data/test/test.db` (see `tests/setup.js`)

### Configuration
- **Never commit secrets** - use `.env` file (already in `.gitignore`)
- Call `initializeConfig()` at app startup to validate and log config
- For tests, use `buildConfig()` to avoid validation logs
- All config is in `src/config.js` with sensible defaults

### Testing
- Run tests: `npm test`
- Watch mode: `npm run test:watch` (Vitest default)
- UI mode: `npm run test:ui`
- Coverage: `npm run test:coverage`
- Tests use `tests/setup.js` for environment setup
- Mock external APIs (Confluence, Gemini) - don't make real API calls in tests

## Key Implementation Notes

### Confluence Client (`src/confluence/client.js`)
- Uses Basic Auth (email + API token)
- Respects `config.sync.maxPagesPerSync` limit
- Expands: `body.storage,version,space,history.lastUpdated,ancestors`
- Timeout: 30 seconds per request

### HTML to Markdown (`src/confluence/converter.js`)
- Uses turndown with custom rules for Confluence elements
- Generates metadata header with breadcrumb, URL, version
- Handles macros, emoticons, user mentions
- Cleans excessive whitespace

### Page Storage (`src/confluence/storage.js`)
- Filename format: `{space-key}_{page-id}_{sanitised-title}.md`
- Saves to `data/confluence-content/`
- Updates database via `db.upsertPage()`
- Has cleanup utility for orphaned files

### Database Schema (`src/utils/database.js`)
- `synced_pages`: Page metadata, version tracking, file paths
- `sync_history`: Audit log of sync operations
- `file_search_stores`: Gemini File Search store references
- All tables have appropriate indexes

## Common Commands

```bash
# Development
npm start              # Run main application (not implemented yet)
npm run sync           # Run sync only
npm run chat           # Run chatbot only
npm run demo           # Run original POC demo

# Testing
npm test               # Run tests once
npm run test:watch     # Watch mode
npm run test:ui        # Vitest UI
npm run test:coverage  # Generate coverage report

# Manual testing
node file_search_demo.js  # Test Gemini File Search API
```

## Environment Variables

Required (copy from `.env.example`):
- `GOOGLE_API_KEY` - Gemini API key
- `CONFLUENCE_BASE_URL` - e.g., `https://yourcompany.atlassian.net`
- `CONFLUENCE_EMAIL` - Your Confluence email
- `CONFLUENCE_API_TOKEN` - Confluence API token
- `CONFLUENCE_SPACE_KEYS` - Comma-separated, e.g., `DOCS,TEAM,ENGINEERING`

Optional:
- `SYNC_INTERVAL_HOURS` - Default: 24
- `MAX_PAGES_PER_SYNC` - Default: 500
- `EXCLUDE_ARCHIVED` - Default: true
- `DB_PATH` - Default: `./data/confluence-sync.db`
- `LOG_LEVEL` - Default: info

## Implementation Plan Reference

The `_ai/IMPLEMENTATION_PLAN.md` outlines 8 phases with 23 tasks. Current progress:
- ✅ Phase 1: Foundation (Tasks 1-3) - Complete
- ✅ Phase 2: Confluence Integration (Tasks 4-6) - Complete
- ⏳ Phase 3: File Search Store Management (Tasks 7-9) - Not started
- ⏳ Phase 4-8: Future work

When implementing new features, refer to task files in `_ai/tasks/` for detailed specifications.

## Troubleshooting

### Common Issues
1. **"Configuration error"**: Check `.env` file has all required variables
2. **Database locked**: Restart app (WAL mode should prevent this)
3. **Confluence 401/403**: Verify API token and email in `.env`
4. **Test failures**: Check test database path in `tests/setup.js`

### Debugging
- Config loads and validates on `initializeConfig()` - watch console output
- Database queries use synchronous API (better-sqlite3 design)
- Axios timeout is 30s - increase if needed for large Confluence instances

## Commit Message Format

Use Conventional Commits: `type(scope): [Jira Ticket] description`

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`  
Scopes: `config`, `confluence`, `database`, `sync`, `chatbot`, `tests`

Examples:
- `feat(sync): [CHAT-123] add incremental sync with change detection`
- `fix(confluence): [CHAT-124] handle empty page body gracefully`
- `test(storage): [CHAT-125] add tests for filename sanitisation`

**Always prompt user for Jira ticket code if not provided.**

## Spelling

Use **New Zealand English** spelling throughout:
- "organise" not "organize"
- "colour" not "color"  
- "synchronise" not "synchronize"
- "behaviour" not "behavior"

## Additional Notes

- **File Search API**: Upload operations are async and must be polled until `operation.done === true`
- **Rate Limits**: Gemini API has rate limits - implement exponential backoff for production
- **Sync Strategy**: Current plan uses full sync; incremental sync via version comparison (Task 9)
- **Testing Real APIs**: Use the demo script (`npm run demo`) to verify Gemini API connectivity
- **Architecture**: The project follows a modular design - keep concerns separated (client, converter, storage, sync, chatbot)
