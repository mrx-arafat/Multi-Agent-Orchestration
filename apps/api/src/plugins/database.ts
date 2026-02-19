import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { getPool, getDb, closePool } from '../db/index.js';
import type { Database } from '../db/index.js';
import type { Pool } from 'pg';
import { Redis } from 'ioredis';
import { getConfig } from '../config/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    pool: Pool;
    redis: Redis;
  }
}

/**
 * Database & Redis plugin.
 * Initializes PostgreSQL connection pool, Drizzle ORM instance,
 * and Redis connection. Decorates the app instance with all three.
 * Closes all connections on app shutdown.
 */
export const databasePlugin = fp(async function (app: FastifyInstance): Promise<void> {
  const config = getConfig();

  // ── PostgreSQL ─────────────────────────────────────────────────────────────
  const pool = getPool();
  const db = getDb();

  // Verify connectivity at startup
  try {
    await pool.query('SELECT 1');
    app.log.info(
      {
        host: config.MAOF_DB_HOST,
        database: config.MAOF_DB_NAME,
      },
      'PostgreSQL connected',
    );
  } catch (err) {
    app.log.error({ err }, 'Failed to connect to PostgreSQL');
    throw err;
  }

  // ── Redis ──────────────────────────────────────────────────────────────────
  const redis = new Redis({
    host: config.MAOF_REDIS_HOST,
    port: config.MAOF_REDIS_PORT,
    password: config.MAOF_REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: true,
  });

  try {
    await redis.connect();
    await redis.ping();
    app.log.info(
      {
        host: config.MAOF_REDIS_HOST,
        port: config.MAOF_REDIS_PORT,
      },
      'Redis connected',
    );
  } catch (err) {
    app.log.error({ err }, 'Failed to connect to Redis');
    throw err;
  }

  // Decorate app instance
  app.decorate('db', db);
  app.decorate('pool', pool);
  app.decorate('redis', redis);

  // Graceful shutdown — close Redis (per-instance) and pool (singleton, safe to call multiple times)
  app.addHook('onClose', async () => {
    app.log.info('Closing connections...');
    await redis.quit().catch(() => {});
    // Only close the pool if this is the last app (production).
    // In tests, multiple app instances share the singleton pool.
    if (process.env['MAOF_NODE_ENV'] !== 'test') {
      await closePool();
    }
    app.log.info('Connections closed');
  });
});
