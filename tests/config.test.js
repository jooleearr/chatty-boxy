import { describe, it, expect, beforeEach } from 'vitest';
import { config, initializeConfig } from '../src/config.js';

describe('Configuration', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    delete process.env.CONFLUENCE_BASE_URL;
    delete process.env.CONFLUENCE_EMAIL;
    delete process.env.CONFLUENCE_API_TOKEN;
    delete process.env.CONFLUENCE_SPACE_KEYS;
    delete process.env.SYNC_INTERVAL_HOURS;
    delete process.env.GOOGLE_API_KEY;
  });

  it('should load configuration from environment variables', () => {
    process.env.CONFLUENCE_BASE_URL = 'https://test.atlassian.net';
    process.env.CONFLUENCE_EMAIL = 'test@example.com';
    process.env.CONFLUENCE_API_TOKEN = 'test-token';
    process.env.CONFLUENCE_SPACE_KEYS = 'TEST,DOCS';
    process.env.GOOGLE_API_KEY = 'test-google-key';

    const result = initializeConfig();
    expect(result).toBe(true);
    expect(config.confluence.baseUrl).toBe('https://test.atlassian.net');
    expect(config.confluence.email).toBe('test@example.com');
    expect(config.confluence.spaceKeys).toEqual(['TEST', 'DOCS']);
  });

  it('should fail validation when required fields are missing', () => {
    const result = initializeConfig();
    expect(result).toBe(false);
  });

  it('should parse sync interval correctly', () => {
    process.env.CONFLUENCE_BASE_URL = 'https://test.atlassian.net';
    process.env.CONFLUENCE_EMAIL = 'test@example.com';
    process.env.CONFLUENCE_API_TOKEN = 'test-token';
    process.env.CONFLUENCE_SPACE_KEYS = 'TEST';
    process.env.GOOGLE_API_KEY = 'test-google-key';
    process.env.SYNC_INTERVAL_HOURS = '12';

    initializeConfig();
    expect(config.sync.intervalHours).toBe(12);
  });

  it('should use default values when optional fields are not provided', () => {
    process.env.CONFLUENCE_BASE_URL = 'https://test.atlassian.net';
    process.env.CONFLUENCE_EMAIL = 'test@example.com';
    process.env.CONFLUENCE_API_TOKEN = 'test-token';

    initializeConfig();
    expect(config.sync.intervalHours).toBe(24);
    expect(config.storage.contentDir).toBeDefined();
  });
});
