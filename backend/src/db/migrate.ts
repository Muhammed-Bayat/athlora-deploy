import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { getPool } from './client.js';

interface Migration {
  name: string;
  checksum: string;
  sql: string;
}

type MigrationClient = Pick<PoolClient, 'query'>;

const INITIAL_TABLES = [
  'users',
  'athletes',
  'events',
  'event_participants',
  'timeline_entries',
  'results',
];

export function normalizeSql(sql: string): string {
  return sql.replace(/\r\n/g, '\n');
}

export async function loadMigrations(): Promise<Migration[]> {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDirectory = path.resolve(directory, '../../src/db/migrations');
  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();

  return Promise.all(
    names.map(async (name) => {
      const sql = normalizeSql(await readFile(path.join(migrationsDirectory, name), 'utf8'));
      return {
        name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

async function shouldBaselineInitialMigration(client: MigrationClient): Promise<boolean> {
  const result = await client.query<{ tableName: string | null }>(
    `SELECT to_regclass('public.' || table_name)::text AS "tableName"
     FROM unnest($1::text[]) AS table_name`,
    [INITIAL_TABLES],
  );
  const existingCount = result.rows.filter(({ tableName }) => tableName !== null).length;

  if (existingCount > 0 && existingCount < INITIAL_TABLES.length) {
    throw new Error('Database contains a partial initial schema; resolve it before migrating');
  }

  return existingCount === INITIAL_TABLES.length;
}

export async function applyMigrations(client: MigrationClient, migrations: Migration[]) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const appliedResult = await client.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations ORDER BY name',
  );
  const applied = new Map(appliedResult.rows.map(({ name, checksum }) => [name, checksum]));

  for (const migration of migrations) {
    const recordedChecksum = applied.get(migration.name);
    if (recordedChecksum && recordedChecksum !== migration.checksum) {
      throw new Error(`Applied migration ${migration.name} has been modified`);
    }
    if (recordedChecksum) continue;

    const baseline =
      migration.name === '0001_init.sql' &&
      applied.size === 0 &&
      (await shouldBaselineInitialMigration(client));

    if (!baseline) await client.query(migration.sql);
    await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
      migration.name,
      migration.checksum,
    ]);
    console.log(`${baseline ? 'Baselined' : 'Applied'} migration ${migration.name}`);
  }
}

export async function migrate() {
  const migrations = await loadMigrations();
  const client = await getPool().connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('athlora:migrations'))");
    await client.query('BEGIN');
    await applyMigrations(client, migrations);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('athlora:migrations'))");
    client.release();
    await getPool().end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
