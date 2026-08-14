import { Pool, type PoolClient } from 'pg';

export type DbExecutor = Pick<PoolClient, 'query'>;

const connectionString = process.env.DATABASE_URL;

export const pool = connectionString ? new Pool({ connectionString }) : null;

export function getPool(): Pool {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }
  return pool;
}
