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
