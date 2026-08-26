import { getPool, type DbExecutor } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import { deleteAuth0User } from './auth0-management.js';

type TransactionRunner = <T>(operation: (client: DbExecutor) => Promise<T>) => Promise<T>;

interface DeletionRow {
  status: 'pending' | 'failed' | 'completed';
}

function accountNotFound(): ApiError {
  return new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
}

async function markPending(auth0Id: string, runTransaction: TransactionRunner): Promise<boolean> {
  return runTransaction(async (client) => {
    const user = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE auth0_id = $1 FOR UPDATE`,
      [auth0Id],
    );
    const deletion = await client.query<DeletionRow>(
      `SELECT status FROM account_deletions WHERE auth0_id = $1 FOR UPDATE`,
      [auth0Id],
    );
    if (deletion.rows[0]?.status === 'completed') return false;
    if (!user.rows[0] && !deletion.rows[0]) throw accountNotFound();
    await client.query(
      `INSERT INTO account_deletions
         (auth0_id, status, attempts, next_attempt_at, last_error, requested_at, updated_at, completed_at)
       VALUES ($1, 'pending', 1, now() + interval '1 minute', NULL, now(), now(), NULL)
       ON CONFLICT (auth0_id) DO UPDATE
       SET status = 'pending',
           attempts = account_deletions.attempts + 1,
           next_attempt_at = now() +
             LEAST(POWER(2, account_deletions.attempts), 60) * interval '1 minute',
           last_error = NULL,
           updated_at = now(),
           completed_at = NULL`,
      [auth0Id],
    );
    return true;
  });
}

async function markFailed(auth0Id: string, runTransaction: TransactionRunner): Promise<void> {
  await runTransaction(async (client) => {
    await client.query(
      `UPDATE account_deletions
       SET status = 'failed', last_error = 'identity deletion failed', updated_at = now()
       WHERE auth0_id = $1 AND status = 'pending'`,
      [auth0Id],
    );
  });
}

async function purgeLocalAccount(auth0Id: string, runTransaction: TransactionRunner): Promise<void> {
  await runTransaction(async (client) => {
    const user = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE auth0_id = $1 FOR UPDATE`,
      [auth0Id],
    );
    const userId = user.rows[0]?.id;
    if (userId) {
      // Keep the local user row and all domain records so attribution remains auditable.
      await client.query(`DELETE FROM workspace_members WHERE user_id = $1`, [userId]);
    }
    await client.query(
      `UPDATE account_deletions
       SET status = 'completed', next_attempt_at = NULL, last_error = NULL,
           updated_at = now(), completed_at = now()
       WHERE auth0_id = $1`,
      [auth0Id],
    );
  });
}

export async function deleteCurrentAccount(
  auth0Id: string,
  deleteIdentity: (subject: string) => Promise<void> = deleteAuth0User,
  runTransaction: TransactionRunner = withTransaction,
): Promise<void> {
  const shouldDelete = await markPending(auth0Id, runTransaction);
  if (!shouldDelete) return;
  try {
    await deleteIdentity(auth0Id);
  } catch {
    try {
      await markFailed(auth0Id, runTransaction);
    } catch {
      // The pending tombstone remains durable and will be retried by reconciliation.
    }
    return;
  }
  try {
    await purgeLocalAccount(auth0Id, runTransaction);
  } catch {
    // Auth0 deletion is idempotent; reconciliation will retry the local purge.
  }
}

export async function reconcileAccountDeletions(
  deleteIdentity: (subject: string) => Promise<void> = deleteAuth0User,
  runTransaction: TransactionRunner = withTransaction,
): Promise<void> {
  const due = await getPool().query<{ auth0_id: string }>(
    `WITH due AS (
       SELECT auth0_id FROM account_deletions
       WHERE status IN ('pending', 'failed') AND next_attempt_at <= now()
       ORDER BY next_attempt_at
       FOR UPDATE SKIP LOCKED
       LIMIT 20
     )
     UPDATE account_deletions AS deletion
     SET next_attempt_at = now() + interval '1 minute'
     FROM due
     WHERE deletion.auth0_id = due.auth0_id
     RETURNING deletion.auth0_id`,
  );
  await Promise.allSettled(
    due.rows.map((row) => deleteCurrentAccount(row.auth0_id, deleteIdentity, runTransaction)),
  );
}
