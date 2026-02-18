import { Pool } from 'pg';
import { getConfig } from '../../src/config/index.js';

/**
 * Creates a direct pg Pool connection for test setup/teardown.
 * Used for creating/cleaning test data outside of the app layer.
 */
export function createTestPool(): Pool {
  const config = getConfig();
  return new Pool({
    host: config.MAOF_DB_HOST,
    port: config.MAOF_DB_PORT,
    database: config.MAOF_DB_NAME,
    user: config.MAOF_DB_USER,
    password: config.MAOF_DB_PASSWORD,
    max: 3,
  });
}

/**
 * Truncates all test tables in the correct dependency order.
 * Called between tests to ensure isolation.
 */
export async function truncateAllTables(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE execution_logs, stage_executions, workflow_runs, agents, users
    RESTART IDENTITY CASCADE
  `);
}
