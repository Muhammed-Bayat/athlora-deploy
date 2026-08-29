import type { RequestHandler } from 'express';
import { getPool } from '../db/client.js';
import { mapResultRow } from '../db/row-mappers.js';
import { DISCIPLINE_100M } from '../types/domain.js';
import { withTransaction } from '../db/transaction.js';
import { recomputeAndUpsertResult } from '../services/resultRecomputation.js';
import { lockEventResultAthletes } from '../services/timeline.js';
import { getApplicationUserContext } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import type { Result } from '../types/domain.js';
import type { ResultOverridePayload } from '../validation/payloads.js';

export async function overrideResultRecord(
  userId: string,
  workspaceId: string,
  eventId: string,
  athleteId: string,
  payload: ResultOverridePayload,
  allowFixtureAccess = false,
): Promise<Result> {
  const { manualOverride, overrideReason } = payload;
  return withTransaction(async (client) => {
    // Match timeline/event mutation lock order: event first, then result rows.
    const event = await client.query(
      `SELECT e.id FROM events e
       WHERE e.id = $1 AND (
         e.workspace_id = $2 OR ($4::boolean AND EXISTS (
           SELECT 1 FROM event_fixture_workspaces fw
           JOIN event_participants ep ON ep.event_id = fw.event_id
             AND ep.athlete_id = $3 AND ep.participant_workspace_id = fw.workspace_id
           JOIN athletes a ON a.id = ep.athlete_id
           WHERE fw.event_id = e.id AND fw.workspace_id = $2 AND fw.role = 'guest'
             AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
             AND a.workspace_id = $2
         ))
       ) FOR UPDATE`,
      [eventId, workspaceId, athleteId, allowFixtureAccess],
    );
    if (allowFixtureAccess && !event.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
    await lockEventResultAthletes(client, eventId);
    const discipline = DISCIPLINE_100M;

    if (manualOverride === null || manualOverride === undefined) {
      await client.query(
        `UPDATE results
         SET manual_override = NULL,
             override_reason = NULL,
             overridden_by = NULL,
             override_at = NULL,
             updated_at = NOW()
         WHERE event_id = $1 AND athlete_id = $2 AND discipline = $3`,
        [eventId, athleteId, discipline],
      );
    } else {
      await client.query(
        `INSERT INTO results (
           event_id, athlete_id, discipline, outcome, final_result, unit, "placing", is_pb, is_sb,
           manual_override, override_reason, overridden_by, override_at, updated_at
         ) VALUES ($1, $2, $3, 'no_result', NULL, NULL, NULL, false, false, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (event_id, athlete_id, discipline)
         DO UPDATE SET
           manual_override = EXCLUDED.manual_override,
           override_reason = EXCLUDED.override_reason,
           overridden_by = EXCLUDED.overridden_by,
           override_at = EXCLUDED.override_at,
           updated_at = NOW()`,
        [eventId, athleteId, discipline, manualOverride, overrideReason, userId],
      );
    }

    await recomputeAndUpsertResult(client, eventId, athleteId, discipline);
    const finalRes = await client.query(
      `SELECT * FROM results WHERE event_id = $1 AND athlete_id = $2 AND discipline = $3`,
      [eventId, athleteId, discipline],
    );
    if (!finalRes.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
    return mapResultRow(finalRes.rows[0]);
  });
}

export const getEventResults: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const eventId = req.params.eventId as string;
    const pool = getPool();
    const resultRes = await pool.query(
      `SELECT r.*
       FROM results r
       JOIN events e ON e.id = r.event_id
       WHERE r.event_id = $1 AND r.discipline = $2 AND e.workspace_id = $3`,
       [eventId, DISCIPLINE_100M, workspaceId],
    );

    const results = resultRes.rows.map(mapResultRow);
    res.json({ data: results, meta: { count: results.length } });
  } catch (error) {
    next(error);
  }
};

export const overrideResult: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    const eventId = req.params.eventId as string;
    const athleteId = req.params.athleteId as string;
    const result = await overrideResultRecord(userId, workspaceId, eventId, athleteId, req.body);

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};
