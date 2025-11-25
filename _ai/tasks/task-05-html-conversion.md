# Task 5: HTML to Markdown Conversion

**Phase**: 2 - Confluence Integration  
**Estimated Time**: 30 minutes  
**Prerequisites**: Task 4 completed

## Objective

Convert Confluence HTML storage format to clean Markdown with metadata for better File Search indexing.

## File to Create

`src/confluence/converter.js` - ~90 lines

## Implementation

Create `src/confluence/converter.js`:

```javascript
import TurndownService from 'turndown';

/**
 * Confluence HTML to Markdown Converter
 */
export class ConfluenceConverter {
  constructor() {
    // Initialize Turndown with custom rules
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    // Add custom rules for Confluence-specific elements
    this.addConfluenceRules();
  }

  /**
   * Add custom rules for Confluence HTML elements
   */
  addConfluenceRules() {
    // Remove Confluence macros that don't translate well
    this.turndownService.addRule('confluenceMacro', {
      filter: function (node) {
        return node.nodeName === 'AC:STRUCTURED-MACRO';
      },
      replacement: function (content, node) {
        // Could extract macro name and parameters if needed
        return '\n[Confluence Macro]\n';
      },
    });

    // Handle Confluence emoticons
    this.turndownService.addRule('confluenceEmoticon', {
      filter: function (node) {
        return node.classList && node.classList.contains('emoticon');
      },
      replacement: function (content, node) {
        const alt = node.getAttribute('alt') || '';
        return alt;
      },
    });

    // Handle Confluence user mentions
    this.turndownService.addRule('confluenceUserLink', {
      filter: function (node) {
        return node.nodeName === 'AC:LINK' && node.getAttribute('ri:userkey');
      },
      replacement: function (content, node) {
        return `@${content}`;
      },
    });
  }

  /**
   * Convert Confluence page to Markdown
   * @param {Object} page - Confluence page object
   * @param {string} baseUrl - Confluence base URL
   * @returns {string} Markdown content
   */
  convertPageToMarkdown(page, baseUrl) {
    const storageValue = page.body?.storage?.value || '';
    
    // Convert HTML to Markdown
    let markdown = this.turndownService.turndown(storageValue);

    // Build metadata header
    const metadata = this.buildMetadataHeader(page, baseUrl);

    // Combine metadata and content
    return `${metadata}\n\n${markdown}`;
  }

  /**
   * Build metadata header for the page
   * @param {Object} page - Confluence page object
   * @param {string} baseUrl - Confluence base URL
   * @returns {string} Markdown metadata header
   */
  buildMetadataHeader(page, baseUrl) {
    const ancestors = page.ancestors || [];
    const breadcrumb = ancestors.length > 0
      ? `${ancestors.map(a => a.title).join(' > ')} > ${page.title}`
      : page.title;

    const url = `${baseUrl}/wiki${page._links.webui}`;
    const lastUpdated = page.history?.lastUpdated?.when || page.version.when;

    return `# ${page.title}

---

**Space:** ${page.space.name} (${page.space.key})  
**Path:** ${breadcrumb}  
**Page ID:** ${page.id}  
**Version:** ${page.version.number}  
**Last Updated:** ${lastUpdated}  
**URL:** ${url}

---`;
  }

  /**
   * Clean up markdown (remove excessive whitespace, etc.)
   * @param {string} markdown - Markdown content
   * @returns {string} Cleaned markdown
   */
  cleanMarkdown(markdown) {
    return markdown
      // Remove excessive newlines (more than 2 consecutive)
      .replace(/\n{3,}/g, '\n\n')
      // Trim trailing whitespace from lines
      .replace(/[ \t]+$/gm, '')
      // Ensure file ends with single newline
      .trim() + '\n';
  }

  /**
   * Convert page to Markdown with cleaning
   * @param {Object} page - Confluence page object
   * @param {string} baseUrl - Confluence base URL
   * @returns {string} Clean Markdown content
   */
  convert(page, baseUrl) {
    const markdown = this.convertPageToMarkdown(page, baseUrl);
    return this.cleanMarkdown(markdown);
  }
}
```

## Testing

Create `src/test-converter.js`:

```javascript
import { ConfluenceClient } from './confluence/client.js';
import { ConfluenceConverter } from './confluence/converter.js';
import { config, initializeConfig } from './config.js';
import * as fs from 'fs';

console.log('=== Testing HTML to Markdown Conversion ===\n');

if (!initializeConfig()) {
  process.exit(1);
}

async function testConversion() {
  const client = new ConfluenceClient();
  const converter = new ConfluenceConverter();

  // Get a sample page
  if (config.confluence.spaceKeys.length === 0) {
    console.error('No spaces configured');
    return;
  }

  const spaceKey = config.confluence.spaceKeys[0];
  console.log(`Fetching sample page from ${spaceKey}...\n`);

  const pages = await client.getAllPages(spaceKey);
  
  if (pages.length === 0) {
    console.error('No pages found');
    return;
  }

  // Convert first page
  const page = pages[0];
  console.log(`Converting: ${page.title}\n`);

  const markdown = converter.convert(page, config.confluence.baseUrl);

  // Show preview
  console.log('=== Markdown Preview (first 500 chars) ===');
  console.log(markdown.substring(0, 500));
  console.log('...\n');

  // Save to file for inspection
  const outputPath = './data/sample-converted.md';
  fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync(outputPath, markdown, 'utf-8');

  console.log(`✓ Full markdown saved to: ${outputPath}`);
  console.log(`  Total length: ${markdown.length} characters`);
  console.log(`  Total lines: ${markdown.split('\n').length} lines`);
}

testConversion().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
```

Run the test:

```bash
node src/test-converter.js
```

Expected output:
```
=== Testing HTML to Markdown Conversion ===

✓ Configuration loaded successfully
  ...

Fetching sample page from DOCS...
  Fetching pages from space: DOCS
  ✓ Total pages fetched: 145

Converting: Getting Started Guide

=== Markdown Preview (first 500 chars) ===
# Getting Started Guide

---

**Space:** Documentation (DOCS)  
**Path:** Home > Guides > Getting Started Guide  
**Page ID:** 123456789  
**Version:** 5  
**Last Updated:** 2025-11-15T10:30:00.000Z  
**URL:** https://yourcompany.atlassian.net/wiki/spaces/DOCS/pages/123456789

---

Welcome to our platform! This guide will help you get started.

## Prerequisites

Before you begin, make sure you have:

- An active account
- Access to the dashboard
...

✓ Full markdown saved to: ./data/sample-converted.md
  Total length: 3245 characters
  Total lines: 87 lines
```

## Verification Checklist

- [ ] `src/confluence/converter.js` created
- [ ] Turndown converts HTML correctly
- [ ] Metadata header is properly formatted
- [ ] Links are preserved
- [ ] Code blocks are formatted correctly
- [ ] Excessive whitespace is cleaned
- [ ] Output saved to file successfully

## Common Issues

### Missing Content
- Check if page has `body.storage` field
- Verify page expansion includes `body.storage`

### Weird Characters
- May need to handle special Confluence macros
- Add custom Turndown rules for specific cases

### Links Not Working
- Ensure base URL is correct
- Check page `_links.webui` property exists

## Files Created

- ✅ `src/confluence/converter.js`
- ✅ `src/test-converter.js` (temporary)
- ✅ `data/sample-converted.md` (sample output)

## Cleanup

After verification:

```bash
rm src/test-converter.js
# Keep sample-converted.md for reference if desired
```

## Next Task

Continue to [Task 6: Page Fetching & Storage](./task-06-page-storage.md)

## Notes

- Turndown handles most HTML → Markdown conversion
- Custom rules added for Confluence-specific elements
- Metadata header helps with context in search results
- Cleaned markdown improves File Search quality
- Consider adding more custom rules for your org's common macros
