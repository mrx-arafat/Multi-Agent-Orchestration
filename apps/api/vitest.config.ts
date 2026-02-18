import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],

    // Run test files sequentially to avoid DB connection conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/db/migrate.ts', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 50,
        statements: 80,
      },
    },

    // Test file patterns
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**'],

    // Timeout for integration tests (DB + Redis operations)
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: {
      '@maof/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
