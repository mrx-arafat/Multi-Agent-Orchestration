/**
 * Global test setup for MAOF API tests.
 * Runs before any test file is executed.
 *
 * - Loads .env from monorepo root
 * - Sets test-specific overrides (test DB, silent logging)
 * - Auto-runs Drizzle migrations against maof_test so tests never fail
 *   due to missing tables
 * - Flushes stale BullMQ jobs from Redis to prevent cross-test interference
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env for tests (so MAOF_* vars are available)
config({ path: '../../.env' });

// Set test-specific defaults
process.env['MAOF_NODE_ENV'] = 'test';
process.env['MAOF_LOG_LEVEL'] = 'silent';
process.env['MAOF_DB_NAME'] = process.env['MAOF_TEST_DB_NAME'] ?? 'maof_test';

// Auto-run migrations against the test database
const __dirname = dirname(fileURLToPath(import.meta.url));

async function setupTestDb(): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    host: process.env['MAOF_DB_HOST'] ?? 'localhost',
    port: Number(process.env['MAOF_DB_PORT'] ?? 5432),
    database: process.env['MAOF_DB_NAME'],
    user: process.env['MAOF_DB_USER'] ?? 'maof',
    password: process.env['MAOF_DB_PASSWORD'] ?? 'maof_dev_password',
    max: 2,
  });

  try {
    // Quick check: if tables exist, skip migration
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      ) AS exists
    `);
    if (result.rows[0]?.exists) {
      return;
    }

    // Tables don't exist — run migrations
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const db = drizzle(pool);
    const migrationsFolder = resolve(__dirname, '../drizzle');
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function flushBullMqQueue(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Redis = (await import('ioredis')).default as unknown as new (opts: Record<string, unknown>) => import('ioredis').default;
  const redis = new Redis({
    host: process.env['MAOF_REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['MAOF_REDIS_PORT'] ?? 6379),
    password: process.env['MAOF_REDIS_PASSWORD'] || undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    // Remove stale BullMQ keys for the workflow queue to prevent cross-test interference
    const keys = await redis.keys('bull:workflow-execution:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    await redis.quit();
  }
}

await setupTestDb();
await flushBullMqQueue();
