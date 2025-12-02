import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    reporters: ['default', 'json', 'html'],
    outputFile: {
      json: './test-results/results.json',
      html: './test-results/index.html',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './test-results/coverage',
      exclude: [
        'node_modules/',
        'src/test-*.js',
        '**/*.config.js',
        'file_search_demo.js',
      ],
    },
    setupFiles: ['./tests/setup.js'],
  },
});
