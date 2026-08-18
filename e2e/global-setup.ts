import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eDir, '..');

try {
  process.loadEnvFile();
} catch {
  // No .env is fine when the variables come from the environment.
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      'E2E requires DATABASE_URL. Set it in e2e/.env (see e2e/.env.example) or export it in the shell.',
    );
  }
  return value;
}

const APP_TABLES = [
  'users',
  'athletes',
  'events',
  'event_participants',
  'timeline_entries',
  'results',
  'account_deletions',
];

async function resetDatabase(): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl() });
  try {
    await pool.query(`TRUNCATE TABLE ${APP_TABLES.join(', ')} CASCADE`);
  } finally {
    await pool.end();
  }
}

export default async function globalSetup(): Promise<void> {
  const dbUrl = databaseUrl();

  console.log('[global-setup] Applying database migrations…');
  execFileSync('npm', ['--prefix', path.join(repoRoot, 'backend'), 'run', 'db:migrate'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  console.log('[global-setup] Truncating application tables for a clean run…');
  await resetDatabase();

  console.log('[global-setup] Ready.');
}