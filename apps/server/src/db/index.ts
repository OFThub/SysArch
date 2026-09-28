import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Opens the SQLite database and brings its schema up to date. WAL lets reads
 * run alongside the single writer; foreign keys are off by default in SQLite
 * and the ownership cascades depend on them.
 */
export function openDb(path: string, migrationsFolder = MIGRATIONS) {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}

export type Db = ReturnType<typeof openDb>;
export { schema };
