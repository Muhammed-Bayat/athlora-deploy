import { describe, expect, it, vi } from 'vitest';
import { getPool, type DbExecutor } from '../db/client.js';
import { deleteCurrentAccount, reconcileAccountDeletions } from './accounts.js';

vi.mock('../db/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/client.js')>()),
  getPool: vi.fn(),
}));

const AUTH0_ID = 'auth0|coach-1';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function runner(query: ReturnType<typeof vi.fn>) {
  return async <T>(operation: (client: DbExecutor) => Promise<T>) => operation({ query } as never);
}

describe('account deletion service', () => {
  it('marks pending, deletes Auth0 identity, and purges the owned graph in dependency order', async () => {
    let userLookup = 0;
    const query = vi.fn(async (sqlValue: string) => {
      const sql = String(sqlValue);
      if (sql.includes('SELECT id FROM users')) {
        userLookup += 1;
        return { rows: [{ id: USER_ID }] };
      }
      if (sql.includes('SELECT status FROM account_deletions')) return { rows: [] };
      return { rows: [] };
    });
    const deleteIdentity = vi.fn().mockResolvedValue(undefined);

    await deleteCurrentAccount(AUTH0_ID, deleteIdentity, runner(query));

    expect(userLookup).toBe(2);
    expect(deleteIdentity).toHaveBeenCalledWith(AUTH0_ID);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements.findIndex((sql) => sql.includes("VALUES ($1, 'pending', 1"))).toBeLessThan(
      statements.findIndex((sql) => sql.includes('DELETE FROM event_participants')),
    );
    expect(statements.findIndex((sql) => sql.includes('DELETE FROM event_participants'))).toBeLessThan(
      statements.findIndex((sql) => sql.includes('DELETE FROM events')),
    );
    expect(statements.some((sql) => sql.includes("status = 'completed'"))).toBe(true);
  });

  it('accepts a durable retry without purging when Auth0 deletion fails', async () => {
    const query = vi.fn(async (sqlValue: string) => {
      const sql = String(sqlValue);
      if (sql.includes('SELECT id FROM users')) return { rows: [{ id: USER_ID }] };
      if (sql.includes('SELECT status FROM account_deletions')) return { rows: [] };
      return { rows: [] };
    });
    await expect(
      deleteCurrentAccount(AUTH0_ID, vi.fn().mockRejectedValue(new Error('Auth0 unavailable')), runner(query)),
    ).resolves.toBeUndefined();

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes("status = 'failed'"))).toBe(true);
    expect(statements.some((sql) => sql.includes("status = 'pending'"))).toBe(true);
    expect(statements.some((sql) => sql.includes('DELETE FROM users'))).toBe(false);
  });

  it('is idempotent after a completed tombstone', async () => {
    const query = vi.fn(async (sqlValue: string) => {
      const sql = String(sqlValue);
      if (sql.includes('SELECT id FROM users')) return { rows: [] };
      if (sql.includes('SELECT status FROM account_deletions')) return { rows: [{ status: 'completed' }] };
      return { rows: [] };
    });
    const deleteIdentity = vi.fn();

    await deleteCurrentAccount(AUTH0_ID, deleteIdentity, runner(query));

    expect(deleteIdentity).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not accept a verified subject with no local account or tombstone', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(
      deleteCurrentAccount(AUTH0_ID, vi.fn(), runner(query)),
    ).rejects.toMatchObject({ status: 404, code: 'ACCOUNT_NOT_FOUND' });
  });

  it('removes or anonymizes audit references outside the owned graph', async () => {
    const query = vi.fn(async (sqlValue: string) => {
      const sql = String(sqlValue);
      if (sql.includes('SELECT id FROM users')) return { rows: [{ id: USER_ID }] };
      if (sql.includes('SELECT status FROM account_deletions')) return { rows: [] };
      return { rows: [] };
    });

    await deleteCurrentAccount(AUTH0_ID, vi.fn().mockResolvedValue(undefined), runner(query));

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toContain('DELETE FROM timeline_entries WHERE recorded_by = $1');
    expect(statements.some((sql) => sql.includes('SET manual_override = NULL'))).toBe(true);
  });

  it('retries durable pending and failed deletion requests', async () => {
    vi.mocked(getPool).mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [
        { auth0_id: 'auth0|pending' },
        { auth0_id: 'auth0|failed' },
      ] }),
    } as never);
    const query = vi.fn(async (sqlValue: string) => {
      const sql = String(sqlValue);
      if (sql.includes('SELECT id FROM users')) return { rows: [{ id: USER_ID }] };
      if (sql.includes('SELECT status FROM account_deletions')) return { rows: [{ status: 'failed' }] };
      return { rows: [] };
    });
    const deleteIdentity = vi.fn().mockResolvedValue(undefined);

    await reconcileAccountDeletions(deleteIdentity, runner(query));

    expect(deleteIdentity).toHaveBeenCalledTimes(2);
    expect(deleteIdentity).toHaveBeenCalledWith('auth0|pending');
    expect(deleteIdentity).toHaveBeenCalledWith('auth0|failed');
  });
});
