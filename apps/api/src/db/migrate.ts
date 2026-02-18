/**
 * Database migration runner.
 * Applies all pending Drizzle migrations in `apps/api/drizzle/` directory.
 *
 * Usage:
 *   pnpm --filter api db:migrate
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// .env is at the monorepo root (2 levels up from apps/api)
config({ path: resolve(process.cwd(), '../../.env') });
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, closePool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, '../../drizzle');

async function runMigrations(): Promise<void> {
  console.log('🗄️  Running database migrations...');
  console.log(`   Migrations folder: ${migrationsFolder}`);

  const db = getDb();

  try {
    await migrate(db, { migrationsFolder });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

runMigrations().catch((err) => {
  console.error(err);
  process.exit(1);
});
