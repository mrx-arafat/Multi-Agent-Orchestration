import type { FastifyInstance } from 'fastify';
import type { Env } from '../../src/config/index.js';
import { buildApp } from '../../src/app.js';
import { _resetEnvCache } from '../../src/config/index.js';

/**
 * Creates a fresh Fastify test instance.
 * Uses test-specific environment overrides to avoid port conflicts.
 * Does NOT start listening — uses inject() for HTTP simulation.
 *
 * @param overrides - Additional env overrides merged on top of test defaults
 */
export async function createTestApp(overrides?: Partial<Env>): Promise<FastifyInstance> {
  // Reset env cache so we can apply test overrides
  _resetEnvCache();

  // Override to use test database and disable noisy logging
  process.env['MAOF_NODE_ENV'] = 'test';
  process.env['MAOF_LOG_LEVEL'] = 'silent';
  process.env['MAOF_DB_NAME'] = 'maof_test';

  const app = await buildApp({
    MAOF_NODE_ENV: 'test',
    MAOF_LOG_LEVEL: 'silent',
    MAOF_DB_NAME: 'maof_test',
    ...overrides,
  });

  // Ready the app (registers all plugins, routes) without binding to a port
  await app.ready();
  return app;
}

/**
 * Closes the Fastify instance and releases Redis connections.
 * The DB pool is a singleton shared across test app instances
 * and is NOT closed here — it persists until the process exits.
 */
export async function destroyTestApp(app: FastifyInstance): Promise<void> {
  await app.close();
}

/**
 * Closes the singleton DB pool. Call this only in the final afterAll.
 */
export async function closeTestPool(): Promise<void> {
  const { closePool } = await import('../../src/db/index.js');
  await closePool();
}
