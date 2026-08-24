import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from './client.js';
import { withReadTransaction, withTransaction } from './transaction.js';

vi.mock('./client.js', () => ({
  getPool: vi.fn(),
}));

const query = vi.fn();
const release = vi.fn();
const connect = vi.fn();
const client = { query, release } as unknown as PoolClient;

beforeEach(() => {
  vi.clearAllMocks();
  connect.mockResolvedValue(client);
  vi.mocked(getPool).mockReturnValue({ connect } as unknown as Pool);
});

describe('withTransaction', () => {
  it('commits the callback result and releases the client', async () => {
    query.mockResolvedValue({ rows: [] });
    const operation = vi.fn().mockResolvedValue({ id: 'entry-1' });

    await expect(withTransaction(operation)).resolves.toEqual({ id: 'entry-1' });

    expect(connect).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledWith(client);
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'COMMIT']);
    expect(release).toHaveBeenCalledWith(false);
  });

  it('rolls back and rethrows when the callback fails', async () => {
    const failure = new Error('recomputation failed');
    query.mockResolvedValue({ rows: [] });

    await expect(
      withTransaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledWith(false);
  });

  it('does not roll back when BEGIN fails', async () => {
    const failure = new Error('begin failed');
    query.mockRejectedValueOnce(failure);
    const operation = vi.fn();

    await expect(withTransaction(operation)).rejects.toBe(failure);

    expect(operation).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(false);
  });

  it('rolls back when COMMIT fails', async () => {
    const failure = new Error('commit failed');
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(failure).mockResolvedValueOnce({ rows: [] });

    await expect(withTransaction(async () => 'result')).rejects.toBe(failure);

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
    ]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it('retains both failures when rollback also fails', async () => {
    const operationFailure = new Error('operation failed');
    const rollbackFailure = new Error('rollback failed');
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(rollbackFailure);

    const result = withTransaction(async () => {
      throw operationFailure;
    });

    await expect(result).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [operationFailure, rollbackFailure],
    });
    expect(release).toHaveBeenCalledWith(true);
  });
});

describe('withReadTransaction', () => {
  it('uses one repeatable read-only snapshot', async () => {
    query.mockResolvedValue({ rows: [] });
    const operation = vi.fn().mockResolvedValue('summary');

    await expect(withReadTransaction(operation)).resolves.toBe('summary');

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'COMMIT',
    ]);
    expect(operation).toHaveBeenCalledWith(client);
    expect(release).toHaveBeenCalledWith(false);
  });
});
