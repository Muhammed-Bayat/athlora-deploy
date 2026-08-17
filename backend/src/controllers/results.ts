import type { RequestHandler } from 'express';
import { getPool } from '../db/client.js';
import { mapResultRow } from '../db/row-mappers.js';
import { DISCIPLINE_100M } from '../types/domain.js';
import { withTransaction } from '../db/transaction.js';
import { recomputeAndUpsertResult } from '../services/resultRecomputation.js';
import { getApplicationUserContext } from '../middleware/auth.js';

export const getEventResults: RequestHandler = async (req, res, next) => {
  try {
    const eventId = req.params.eventId as string;
    const pool = getPool();
    const resultRes = await pool.query(
      `SELECT r.*
       FROM results r
       WHERE r.event_id = $1 AND r.discipline = $2`,
      [eventId, DISCIPLINE_100M]
    );

    const results = resultRes.rows.map(mapResultRow);
    res.json({ data: results, meta: { count: results.length } });
  } catch (error) {
    next(error);
  }
};

export const overrideResult: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const eventId = req.params.eventId as string;
    const athleteId = req.params.athleteId as string;
    const { manualOverride, overrideReason } = req.body;

    const result = await withTransaction(async (client) => {
      const existingRes = await client.query(
        `SELECT discipline FROM results WHERE event_id = $1 AND athlete_id = $2`,
        [eventId, athleteId]
      );
      const discipline = existingRes.rows[0]?.discipline ?? DISCIPLINE_100M;

      if (manualOverride === null || manualOverride === undefined) {
        await client.query(
          `UPDATE results
           SET manual_override = NULL,
               override_reason = NULL,
               overridden_by = NULL,
               override_at = NULL,
               updated_at = NOW()
           WHERE event_id = $1 AND athlete_id = $2 AND discipline = $3`,
          [eventId, athleteId, discipline]
        );
      } else {
        await client.query(
          `INSERT INTO results (
             event_id, athlete_id, discipline, outcome, final_result, unit, placing, is_pb, is_sb,
             manual_override, override_reason, overridden_by, override_at, updated_at
           ) VALUES ($1, $2, $3, 'valid', $4, 'seconds', NULL, false, false, $4, $5, $6, NOW(), NOW())
           ON CONFLICT (event_id, athlete_id, discipline)
           DO UPDATE SET
             manual_override = EXCLUDED.manual_override,
             override_reason = EXCLUDED.override_reason,
             overridden_by = EXCLUDED.overridden_by,
             override_at = EXCLUDED.override_at,
             updated_at = NOW()`,
          [eventId, athleteId, discipline, manualOverride, overrideReason, userId]
        );
      }

      await recomputeAndUpsertResult(client, eventId, athleteId, discipline);

      const finalRes = await client.query(
        `SELECT * FROM results WHERE event_id = $1 AND athlete_id = $2 AND discipline = $3`,
        [eventId, athleteId, discipline]
      );
      return mapResultRow(finalRes.rows[0]);
    });

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};
