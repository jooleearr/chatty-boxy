import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Test directories
const TEST_DATA_DIR = './data/test';
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'test.db');
const TEST_CONTENT_DIR = path.join(TEST_DATA_DIR, 'confluence-content');

// Setup test environment
beforeAll(() => {
  // Create test data directory
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = TEST_DB_PATH;
  process.env.CONTENT_DIR = TEST_CONTENT_DIR;
});

// Clean up after each test
afterEach(() => {
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  
  // Clean up test content directory
  if (fs.existsSync(TEST_CONTENT_DIR)) {
    fs.rmSync(TEST_CONTENT_DIR, { recursive: true, force: true });
  }
});

// Final cleanup
afterAll(() => {
  // Remove test data directory
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

export { TEST_DATA_DIR, TEST_DB_PATH, TEST_CONTENT_DIR };
