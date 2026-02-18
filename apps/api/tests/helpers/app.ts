import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { _resetEnvCache } from '../../src/config/index.js';

/**
 * Creates a fresh Fastify test instance.
 * Uses test-specific environment overrides to avoid port conflicts.
 * Does NOT start listening — uses inject() for HTTP simulation.
 */
export async function createTestApp(): Promise<FastifyInstance> {
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
  });

  // Ready the app (registers all plugins, routes) without binding to a port
  await app.ready();
  return app;
}

/**
 * Closes the Fastify instance and releases all resources (DB pool, Redis).
 */
export async function destroyTestApp(app: FastifyInstance): Promise<void> {
  await app.close();
}
