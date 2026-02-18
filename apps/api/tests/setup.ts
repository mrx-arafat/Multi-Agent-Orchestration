/**
 * Global test setup for MAOF API tests.
 * Runs before any test file is executed.
 */
import { config } from 'dotenv';

// Load .env for tests (so MAOF_* vars are available)
config({ path: '../../.env' });

// Set test-specific defaults
process.env['MAOF_NODE_ENV'] = 'test';
process.env['MAOF_LOG_LEVEL'] = 'silent';
process.env['MAOF_DB_NAME'] = process.env['MAOF_TEST_DB_NAME'] ?? 'maof_test';
