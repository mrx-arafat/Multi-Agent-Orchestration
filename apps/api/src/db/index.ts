import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getConfig } from '../config/index.js';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

let _pool: Pool | null = null;
let _db: Database | null = null;

/**
 * Returns the singleton PostgreSQL connection pool.
 * Creates it on first call.
 */
export function getPool(): Pool {
  if (_pool) return _pool;

  const config = getConfig();
  _pool = new Pool({
    host: config.MAOF_DB_HOST,
    port: config.MAOF_DB_PORT,
    database: config.MAOF_DB_NAME,
    user: config.MAOF_DB_USER,
    password: config.MAOF_DB_PASSWORD,
    min: config.MAOF_DB_POOL_MIN,
    max: config.MAOF_DB_POOL_MAX,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  _pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error', err);
  });

  return _pool;
}

/**
 * Returns the singleton Drizzle database instance.
 * Creates it on first call.
 */
export function getDb(): Database {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

/**
 * Closes the connection pool — call during graceful shutdown.
 */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

export { schema };
