import { getPool } from '../db/client.js';

export interface SyncActionInput {
  actionId: string;
  actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
  payload: Record<string, unknown>;
  expectedVersion?: number;
  clientTimestamp: string;
}

export interface SyncActionReceipt {
  actionId: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  code?: string;
  serverVersion?: number;
  entryId?: string;
}

export interface SyncBatchResult {
  receipts: SyncActionReceipt[];
  recomputedResults: boolean;
}

export async function processSyncBatch(
  eventId: string,
  actorId: string,
  deviceId: string,
  actions: SyncActionInput[],
): Promise<SyncBatchResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const receipts: SyncActionReceipt[] = [];

    for (const action of actions) {
      const existingReceipt = await client.query(
        'SELECT * FROM sync_action_receipts WHERE action_id = $1',
        [action.actionId],
      );

      if (existingReceipt.rows.length > 0) {
        const row = existingReceipt.rows[0];
        receipts.push({
          actionId: action.actionId,
          status: 'duplicate',
          entryId: row.entry_id,
          serverVersion: row.server_version,
        });
        continue;
      }

      try {
        switch (action.actionType) {
          case 'create_entry': {
            const { athleteId, discipline, entryType, value, unit, incidentType, noteText } =
              action.payload as {
                athleteId: string;
                discipline: string;
                entryType: string;
                value: number | null;
                unit?: string;
                incidentType?: string;
                noteText?: string;
              };

            const insertRes = await client.query(
              `INSERT INTO timeline_entries (id, event_id, athlete_id, discipline, entry_type, value, unit, incident_type, note_text, recorded_by, version, device_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11)
               RETURNING id, version`,
              [action.actionId, eventId, athleteId, discipline, entryType, value, unit ?? null, incidentType ?? null, noteText ?? null, actorId, deviceId],
            );

            const entryId = insertRes.rows[0].id;
            const serverVersion = insertRes.rows[0].version;

            await client.query(
              `INSERT INTO sync_action_receipts (action_id, event_id, actor_id, device_id, action_type, status, entry_id, server_version)
               VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)`,
              [action.actionId, eventId, actorId, deviceId, action.actionType, entryId, serverVersion],
            );

            receipts.push({ actionId: action.actionId, status: 'accepted', entryId, serverVersion });
            break;
          }

          case 'edit_entry': {
            const { entryId, value, incidentType, noteText, expectedVersion } = action.payload as {
              entryId: string;
              value?: number | null;
              incidentType?: string;
              noteText?: string;
              expectedVersion: number;
            };

            const currentVersion = expectedVersion ?? action.expectedVersion;
            const updateRes = await client.query(
              `UPDATE timeline_entries
               SET value = COALESCE($1, value),
                   incident_type = COALESCE($2, incident_type),
                   note_text = COALESCE($3, note_text),
                   version = version + 1,
                   updated_at = now()
               WHERE id = $4 AND event_id = $5 AND version = $6 AND deleted_at IS NULL
               RETURNING id, version`,
              [value ?? null, incidentType ?? null, noteText ?? null, entryId, eventId, currentVersion],
            );

            if (updateRes.rows.length === 0) {
              await client.query(
                `INSERT INTO sync_action_receipts (action_id, event_id, actor_id, device_id, action_type, status, error_code)
                 VALUES ($1, $2, $3, $4, $5, 'rejected', 'VERSION_CONFLICT')`,
                [action.actionId, eventId, actorId, deviceId, action.actionType],
              );
              receipts.push({ actionId: action.actionId, status: 'rejected', code: 'VERSION_CONFLICT' });
            } else {
              const newVersion = updateRes.rows[0].version;
              await client.query(
                `INSERT INTO sync_action_receipts (action_id, event_id, actor_id, device_id, action_type, status, entry_id, server_version)
                 VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)`,
                [action.actionId, eventId, actorId, deviceId, action.actionType, entryId, newVersion],
              );
              receipts.push({ actionId: action.actionId, status: 'accepted', entryId, serverVersion: newVersion });
            }
            break;
          }

          case 'undo_entry': {
            const { entryId, expectedVersion } = action.payload as {
              entryId: string;
              expectedVersion: number;
            };

            const currentVersion = expectedVersion ?? action.expectedVersion;
            const deleteRes = await client.query(
              `UPDATE timeline_entries
               SET deleted_at = now(), version = version + 1, updated_at = now()
               WHERE id = $1 AND event_id = $2 AND version = $3 AND deleted_at IS NULL
               RETURNING id, version`,
              [entryId, eventId, currentVersion],
            );

            if (deleteRes.rows.length === 0) {
              await client.query(
                `INSERT INTO sync_action_receipts (action_id, event_id, actor_id, device_id, action_type, status, error_code)
                 VALUES ($1, $2, $3, $4, $5, 'rejected', 'VERSION_CONFLICT')`,
                [action.actionId, eventId, actorId, deviceId, action.actionType],
              );
              receipts.push({ actionId: action.actionId, status: 'rejected', code: 'VERSION_CONFLICT' });
            } else {
              await client.query(
                `INSERT INTO sync_action_receipts (action_id, event_id, actor_id, device_id, action_type, status, entry_id, server_version)
                 VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)`,
                [action.actionId, eventId, actorId, deviceId, action.actionType, entryId, deleteRes.rows[0].version],
              );
              receipts.push({ actionId: action.actionId, status: 'accepted', entryId, serverVersion: deleteRes.rows[0].version });
            }
            break;
          }
        }
      } catch {
        await client.query(
          `INSERT INTO sync_action_receipts (action_id, event_id, actor_id, device_id, action_type, status, error_code)
           VALUES ($1, $2, $3, $4, $5, 'rejected', 'INTERNAL_ERROR')`,
          [action.actionId, eventId, actorId, deviceId, action.actionType],
        );
        receipts.push({ actionId: action.actionId, status: 'rejected', code: 'INTERNAL_ERROR' });
      }
    }

    await client.query('COMMIT');

    return { receipts, recomputedResults: receipts.some((r) => r.status === 'accepted') };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function designateOfflineLogger(
  grantId: string,
  eventId: string,
  deviceId: string,
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE event_helper_grants
       SET is_offline_logger = false, offline_queue_device_id = NULL, updated_at = now()
       WHERE event_id = $1 AND is_offline_logger = true AND status = 'active'`,
      [eventId],
    );

    const updateRes = await client.query(
      `UPDATE event_helper_grants
       SET is_offline_logger = true, offline_queue_device_id = $1, updated_at = now()
       WHERE id = $2 AND event_id = $3 AND status = 'active'
       RETURNING id`,
      [deviceId, grantId, eventId],
    );

    if (updateRes.rows.length === 0) {
      throw new Error('Grant not found or inactive');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeOfflineLoggerDesignation(
  grantId: string,
  eventId: string,
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateRes = await client.query(
      `UPDATE event_helper_grants
       SET is_offline_logger = false, offline_queue_device_id = NULL, updated_at = now()
       WHERE id = $1 AND event_id = $2 AND is_offline_logger = true
       RETURNING id`,
      [grantId, eventId],
    );

    if (updateRes.rows.length === 0) {
      throw new Error('Grant not found or not designated as offline logger');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function transferOfflineLoggerDesignation(
  fromGrantId: string,
  toGrantId: string,
  eventId: string,
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateRes = await client.query(
      `UPDATE event_helper_grants
       SET is_offline_logger = false, offline_queue_device_id = NULL, updated_at = now()
       WHERE id = $1 AND event_id = $2 AND is_offline_logger = true
       RETURNING id`,
      [fromGrantId, eventId],
    );

    if (updateRes.rows.length === 0) {
      throw new Error('Source grant not found or not designated as offline logger');
    }

    const newRes = await client.query(
      `UPDATE event_helper_grants
       SET is_offline_logger = true, updated_at = now()
       WHERE id = $1 AND event_id = $2 AND status = 'active'
       RETURNING id`,
      [toGrantId, eventId],
    );

    if (newRes.rows.length === 0) {
      throw new Error('Target grant not found or inactive');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
