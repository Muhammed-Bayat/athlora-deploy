import type { PoolClient } from 'pg';
import { getPool } from './client.js';

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  let transactionStarted = false;
  let discardClient = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        discardClient = true;
        throw new AggregateError([error, rollbackError], 'Transaction and rollback both failed');
      }
    }
    throw error;
  } finally {
    client.release(discardClient);
  }
}
