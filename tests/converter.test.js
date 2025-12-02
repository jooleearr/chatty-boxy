import { describe, it, expect } from 'vitest';
import { ConfluenceConverter } from '../src/confluence/converter.js';

describe('ConfluenceConverter', () => {
  const converter = new ConfluenceConverter();
  const baseUrl = 'https://test.atlassian.net';

  describe('HTML to Markdown conversion', () => {
    it('should convert simple HTML to markdown', () => {
      const page = {
        id: 'test-1',
        title: 'Test Page',
        space: { key: 'TEST', name: 'Test Space' },
        version: { number: 1, when: '2024-01-01T00:00:00.000Z' },
        body: {
          storage: {
            value: '<p>Simple paragraph</p><h2>Heading</h2><p>Another paragraph</p>'
          }
        },
        _links: { webui: '/spaces/TEST/pages/123' },
        ancestors: [],
      };

      const markdown = converter.convert(page, baseUrl);
      
      expect(markdown).toContain('# Test Page');
      expect(markdown).toContain('Simple paragraph');
      expect(markdown).toContain('## Heading');
    });

    it('should handle pages without body content', () => {
      const page = {
        id: 'test-2',
        title: 'Empty Page',
        space: { key: 'TEST', name: 'Test Space' },
        version: { number: 1, when: '2024-01-01T00:00:00.000Z' },
        _links: { webui: '/spaces/TEST/pages/124' },
        ancestors: [],
      };

      const markdown = converter.convert(page, baseUrl);
      
      expect(markdown).toContain('# Empty Page');
      expect(markdown).toContain('*No content available*');
    });

    it('should include metadata in output', () => {
      const page = {
        id: 'test-3',
        title: 'Metadata Test',
        space: { key: 'TEST', name: 'Test Space' },
        version: { number: 5, when: '2024-01-01T00:00:00.000Z' },
        body: {
          storage: { value: '<p>Content</p>' }
        },
        _links: { webui: '/spaces/TEST/pages/125' },
        ancestors: [],
      };

      const markdown = converter.convert(page, baseUrl);
      
      expect(markdown).toContain('**Space:**');
      expect(markdown).toContain('Test Space (TEST)');
      expect(markdown).toContain('**Version:** 5');
      expect(markdown).toContain('**Page ID:** test-3');
    });

    it('should handle hierarchical page paths', () => {
      const page = {
        id: 'test-4',
        title: 'Child Page',
        space: { key: 'TEST', name: 'Test Space' },
        version: { number: 1, when: '2024-01-01T00:00:00.000Z' },
        body: {
          storage: { value: '<p>Content</p>' }
        },
        _links: { webui: '/spaces/TEST/pages/126' },
        ancestors: [
          { title: 'Parent Page' },
          { title: 'Grandparent Page' }
        ],
      };

      const markdown = converter.convert(page, baseUrl);
      
      expect(markdown).toContain('Path:');
      expect(markdown).toContain('Grandparent Page');
      expect(markdown).toContain('Parent Page');
      expect(markdown).toContain('Child Page');
    });
  });

  describe('HTML sanitization', () => {
    it('should handle special characters', () => {
      const page = {
        id: 'test-5',
        title: 'Special Characters',
        space: { key: 'TEST', name: 'Test Space' },
        version: { number: 1, when: '2024-01-01T00:00:00.000Z' },
        body: {
          storage: { value: '<p>&lt;script&gt;alert("test")&lt;/script&gt;</p>' }
        },
        _links: { webui: '/spaces/TEST/pages/127' },
        ancestors: [],
      };

      const markdown = converter.convert(page, baseUrl);
      expect(markdown).toBeDefined();
      expect(markdown.length).toBeGreaterThan(0);
    });
  });
});
