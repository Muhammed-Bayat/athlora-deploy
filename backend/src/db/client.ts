import { Pool, type PoolClient } from 'pg';

export type DbExecutor = Pick<PoolClient, 'query'>;

const connectionString = process.env.DATABASE_URL;

function optionalPositiveInteger(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const pool = connectionString ? new Pool({
  connectionString,
  max: optionalPositiveInteger('DB_POOL_MAX'),
  idleTimeoutMillis: optionalPositiveInteger('DB_POOL_IDLE_TIMEOUT_MS'),
  connectionTimeoutMillis: optionalPositiveInteger('DB_POOL_CONNECTION_TIMEOUT_MS'),
}) : null;

export function getPool(): Pool {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }
  return pool;
}
