import { createHash } from 'node:crypto';
import { getPool } from '../db/client.js';
import { DISCIPLINE_100M, type EventType } from '../types/domain.js';
import { recomputeEventResults } from './timeline.js';

export interface PublicSyncActionInput {
  actionId: string;
  actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
  payload: Record<string, unknown>;
  expectedVersion?: number;
  clientTimestamp: string;
}

export interface PublicSyncActionReceipt {
  actionId: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  code?: string;
  serverVersion?: number;
  entryId?: string;
}

export interface PublicSyncBatchResult {
  receipts: PublicSyncActionReceipt[];
  recomputedResults: boolean;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function processPublicSyncBatch(
  sessionToken: string,
  eventId: string,
  deviceId: string,
  actions: PublicSyncActionInput[],
): Promise<PublicSyncBatchResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sessionRes = await client.query<{ id: string; type: EventType; status: string }>(
      `SELECT ps.id, e.type, e.status
       FROM public_logger_sessions ps
       JOIN public_logger_links pl ON pl.id = ps.link_id
       JOIN events e ON e.id = ps.event_id
       WHERE ps.token_hash = $1 AND ps.event_id = $2
         AND pl.status = 'active' AND ps.expires_at > now()
         AND e.status IN ('scheduled', 'in_progress')
       FOR UPDATE OF ps, pl, e`,
      [hashSessionToken(sessionToken), eventId],
    );

    const session = sessionRes.rows[0];
    if (!session) {
      await client.query('ROLLBACK');
      throw new Error('Invalid or expired public logger session');
    }

    if (session.status !== 'in_progress') {
      await client.query('ROLLBACK');
      throw new Error('Event is not in progress');
    }

    const receipts: PublicSyncActionReceipt[] = [];

    for (const action of actions) {
      const existingReceipt = await client.query(
        'SELECT * FROM public_sync_action_receipts WHERE action_id = $1',
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
            const { athleteId, entryType, value, unit, incidentType, noteText } =
              action.payload as {
                athleteId: string;
                entryType: string;
                value: number | null;
                unit?: string;
                incidentType?: string;
                noteText?: string;
              };

            const participant = await client.query(
              'SELECT 1 FROM event_participants WHERE event_id = $1 AND athlete_id = $2',
              [eventId, athleteId],
            );
            if (participant.rows.length === 0) {
              await client.query(
                `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, error_code)
                 VALUES ($1, $2, $3, $4, $5, 'rejected', 'ATHLETE_NOT_PARTICIPANT')`,
                [action.actionId, session.id, eventId, deviceId, action.actionType],
              );
              receipts.push({ actionId: action.actionId, status: 'rejected', code: 'ATHLETE_NOT_PARTICIPANT' });
              break;
            }

            const insertRes = await client.query(
              `INSERT INTO timeline_entries (id, event_id, athlete_id, discipline, entry_type, value, unit, is_foul, incident_type, note_text, recorded_by, public_logger_session_id, version, device_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, NULL, $10, 1, $11)
               RETURNING id, version`,
              [action.actionId, eventId, athleteId, DISCIPLINE_100M, entryType, value, unit ?? null, incidentType ?? null, noteText ?? null, session.id, deviceId],
            );

            const entryId = insertRes.rows[0].id;
            const serverVersion = insertRes.rows[0].version;

            await client.query(
              `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, entry_id, server_version)
               VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)`,
              [action.actionId, session.id, eventId, deviceId, action.actionType, entryId, serverVersion],
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

            const existingEntry = await client.query<{ id: string; version: number; value: number | null; incident_type: string | null; note_text: string | null }>(
              `SELECT id, version, value, incident_type, note_text
               FROM timeline_entries
               WHERE id = $1 AND event_id = $2 AND public_logger_session_id = $3 AND deleted_at IS NULL`,
              [entryId, eventId, session.id],
            );

            if (existingEntry.rows.length === 0) {
              await client.query(
                `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, error_code)
                 VALUES ($1, $2, $3, $4, $5, 'rejected', 'ENTRY_NOT_FOUND')`,
                [action.actionId, session.id, eventId, deviceId, action.actionType],
              );
              receipts.push({ actionId: action.actionId, status: 'rejected', code: 'ENTRY_NOT_FOUND' });
              break;
            }

            const existing = existingEntry.rows[0];

            if (existing.version !== currentVersion) {
              await client.query(
                `INSERT INTO public_sync_conflict_log (action_id, session_id, event_id, entry_id, overwritten_version, overwritten_value, overwritten_incident, overwritten_note, winning_action_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $1)`,
                [action.actionId, session.id, eventId, entryId, existing.version, existing.value, existing.incident_type, existing.note_text],
              );

              const mergedValue = value === undefined ? existing.value : value;
              const mergedIncident = incidentType === undefined ? existing.incident_type : incidentType;
              const mergedNote = noteText === undefined ? existing.note_text : noteText;

              const updateRes = await client.query(
                `UPDATE timeline_entries
                 SET value = $1, incident_type = $2, note_text = $3, version = version + 1, updated_at = now()
                 WHERE id = $4 AND event_id = $5 AND deleted_at IS NULL AND version = $6
                 RETURNING id, version`,
                [mergedValue, mergedIncident, mergedNote, entryId, eventId, existing.version],
              );

              if (updateRes.rows.length === 0) {
                await client.query(
                  `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, error_code)
                   VALUES ($1, $2, $3, $4, $5, 'rejected', 'CONCURRENT_MODIFY')`,
                  [action.actionId, session.id, eventId, deviceId, action.actionType],
                );
                receipts.push({ actionId: action.actionId, status: 'rejected', code: 'CONCURRENT_MODIFY' });
                break;
              }

              const newVersion = updateRes.rows[0].version;
              await client.query(
                `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, entry_id, server_version)
                 VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)`,
                [action.actionId, session.id, eventId, deviceId, action.actionType, entryId, newVersion],
              );
              receipts.push({ actionId: action.actionId, status: 'accepted', entryId, serverVersion: newVersion });
            } else {
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
                  `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, error_code)
                   VALUES ($1, $2, $3, $4, $5, 'rejected', 'VERSION_CONFLICT')`,
                  [action.actionId, session.id, eventId, deviceId, action.actionType],
                );
                receipts.push({ actionId: action.actionId, status: 'rejected', code: 'VERSION_CONFLICT' });
              } else {
                const newVersion = updateRes.rows[0].version;
                await client.query(
                  `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, entry_id, server_version)
                   VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)`,
                  [action.actionId, session.id, eventId, deviceId, action.actionType, entryId, newVersion],
                );
                receipts.push({ actionId: action.actionId, status: 'accepted', entryId, serverVersion: newVersion });
              }
            }
            break;
          }

          case 'undo_entry': {
            const { entryId, expectedVersion } = action.payload as {
              entryId: string;
              expectedVersion: number;
            };

            const currentVersion = expectedVersion ?? action.expectedVersion;

            const existingEntry = await client.query<{ id: string; version: number }>(
              `SELECT id, version FROM timeline_entries
               WHERE id = $1 AND event_id = $2 AND public_logger_session_id = $3 AND deleted_at IS NULL`,
              [entryId, eventId, session.id],
            );

            if (existingEntry.rows.length === 0) {
              await client.query(
                `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, error_code)
                 VALUES ($1, $2, $3, $4, $5, 'rejected', 'ENTRY_NOT_FOUND')`,
                [action.actionId, session.id, eventId, deviceId, action.actionType],
              );
              receipts.push({ actionId: action.actionId, status: 'rejected', code: 'ENTRY_NOT_FOUND' });
              break;
            }

            const existing = existingEntry.rows[0];

            if (existing.version !== currentVersion) {
              const deleteRes = await client.query(
                `UPDATE timeline_entries
                 SET deleted_at = now(), version = version + 1, updated_at = now()
                 WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL AND version = $3
                 RETURNING id, version`,
                [entryId, eventId, existing.version],
              );

              if (deleteRes.rows.length === 0) {
                await client.query(
                  `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, error_code)
                   VALUES ($1, $2, $3, $4, $5, 'rejected', 'CONCURRENT_MODIFY')`,
                  [action.actionId, session.id, eventId, deviceId, action.actionType],
                );
                receipts.push({ actionId: action.actionId, status: 'rejected', code: 'CONCURRENT_MODIFY' });
                break;
              }

              await client.query(
                `INSERT INTO public_sync_conflict_log (action_id, session_id, event_id, entry_id, overwritten_version, winning_action_id)
                 VALUES ($1, $2, $3, $4, $5, $1)`,
                [action.actionId, session.id, eventId, entryId, existing.version],
              );

              await client.query(
                `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, entry_id, server_version)
                 VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)`,
                [action.actionId, session.id, eventId, deviceId, action.actionType, entryId, deleteRes.rows[0].version],
              );
              receipts.push({ actionId: action.actionId, status: 'accepted', entryId, serverVersion: deleteRes.rows[0].version });
            } else {
              const deleteRes = await client.query(
                `UPDATE timeline_entries
                 SET deleted_at = now(), version = version + 1, updated_at = now()
                 WHERE id = $1 AND event_id = $2 AND version = $3 AND deleted_at IS NULL
                 RETURNING id, version`,
                [entryId, eventId, currentVersion],
              );

              if (deleteRes.rows.length === 0) {
                await client.query(
                  `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, error_code)
                   VALUES ($1, $2, $3, $4, $5, 'rejected', 'VERSION_CONFLICT')`,
                  [action.actionId, session.id, eventId, deviceId, action.actionType],
                );
                receipts.push({ actionId: action.actionId, status: 'rejected', code: 'VERSION_CONFLICT' });
              } else {
                await client.query(
                  `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, entry_id, server_version)
                   VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)`,
                  [action.actionId, session.id, eventId, deviceId, action.actionType, entryId, deleteRes.rows[0].version],
                );
                receipts.push({ actionId: action.actionId, status: 'accepted', entryId, serverVersion: deleteRes.rows[0].version });
              }
            }
            break;
          }
        }
      } catch {
        await client.query(
          `INSERT INTO public_sync_action_receipts (action_id, session_id, event_id, device_id, action_type, status, error_code)
           VALUES ($1, $2, $3, $4, $5, 'rejected', 'INTERNAL_ERROR')`,
          [action.actionId, session.id, eventId, deviceId, action.actionType],
        );
        receipts.push({ actionId: action.actionId, status: 'rejected', code: 'INTERNAL_ERROR' });
      }
    }

    await client.query('COMMIT');

    const recomputedResults = receipts.some((r) => r.status === 'accepted');
    if (recomputedResults) {
      await recomputeEventResults(getPool(), eventId, session.type);
    }

    return { receipts, recomputedResults };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
