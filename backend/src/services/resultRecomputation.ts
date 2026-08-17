import type { PoolClient } from 'pg';
import { DISCIPLINE_100M, type Discipline, type EventType } from '../types/domain.js';
import { deriveResult, deriveEffectiveResult, calculatePlacings, checkPbSb } from './resultDerivation.js';

export async function recomputeAndUpsertResult(
  client: PoolClient,
  eventId: string,
  athleteId: string,
  discipline: Discipline = DISCIPLINE_100M,
): Promise<void> {
  const eventRes = await client.query(
    'SELECT type, date FROM events WHERE id = $1',
    [eventId]
  );
  if (eventRes.rows.length === 0) return;
  const event = eventRes.rows[0] as { type: EventType; date: string };

  const entriesRes = await client.query(
    `SELECT entry_type, value, is_foul, incident_type, deleted_at
     FROM timeline_entries
     WHERE event_id = $1 AND athlete_id = $2 AND discipline = $3`,
    [eventId, athleteId, discipline]
  );

  const entryInputs = entriesRes.rows.map((r) => ({
    entryType: r.entry_type,
    value: r.value !== null ? Number(r.value) : null,
    isFoul: r.is_foul,
    incidentType: r.incident_type,
    deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
  }));

  const existingResultRes = await client.query(
    `SELECT manual_override, override_reason, overridden_by, override_at
     FROM results
     WHERE event_id = $1 AND athlete_id = $2 AND discipline = $3`,
    [eventId, athleteId, discipline]
  );
  const existingResult = existingResultRes.rows[0] as {
    manual_override: string | number | null;
    override_reason: string | null;
    overridden_by: string | null;
    override_at: string | null;
  } | undefined;

  const manualOverride =
    existingResult?.manual_override !== null && existingResult?.manual_override !== undefined
      ? Number(existingResult.manual_override)
      : null;

  const derived = deriveResult(entryInputs, 'track', event.type);
  const effective = deriveEffectiveResult(derived, manualOverride);
  const finalResult = effective.value;
  const outcome = effective.outcome;
  const unit = finalResult !== null ? 'seconds' : null;

  const historyRes = await client.query(
    `SELECT r.final_result AS value, e.date, r.outcome
     FROM results r
     JOIN events e ON e.id = r.event_id
     WHERE r.athlete_id = $1
       AND r.discipline = $2
       AND r.outcome = 'valid'
       AND r.final_result IS NOT NULL
       AND (e.date < $3 OR (e.date = $3 AND r.event_id != $4))`,
    [athleteId, discipline, event.date, eventId]
  );

  const historicalResults = historyRes.rows.map((r) => ({
    value: Number(r.value),
    date: r.date,
    outcome: r.outcome,
  }));

  const { isPb, isSb } = checkPbSb(finalResult, outcome, event.date, historicalResults);

  await client.query(
    `INSERT INTO results (
       event_id, athlete_id, discipline, outcome, final_result, unit, placing, is_pb, is_sb,
       manual_override, override_reason, overridden_by, override_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10, $11, $12, NOW())
     ON CONFLICT (event_id, athlete_id, discipline)
     DO UPDATE SET
       outcome = EXCLUDED.outcome,
       final_result = EXCLUDED.final_result,
       unit = EXCLUDED.unit,
       is_pb = EXCLUDED.is_pb,
       is_sb = EXCLUDED.is_sb,
       updated_at = NOW()`,
    [
      eventId,
      athleteId,
      discipline,
      outcome,
      finalResult,
      unit,
      isPb,
      isSb,
      manualOverride,
      existingResult?.override_reason ?? null,
      existingResult?.overridden_by ?? null,
      existingResult?.override_at ?? null,
    ]
  );

  if (event.type === 'competition') {
    const allResultsRes = await client.query(
      `SELECT athlete_id, final_result, outcome FROM results WHERE event_id = $1 AND discipline = $2`,
      [eventId, discipline]
    );
    const resultsForPlacing = allResultsRes.rows.map((r) => ({
      athleteId: r.athlete_id,
      value: r.final_result !== null ? Number(r.final_result) : null,
      outcome: r.outcome,
    }));
    const placings = calculatePlacings(resultsForPlacing);

    for (const [athId, placing] of placings.entries()) {
      await client.query(
        `UPDATE results SET placing = $1, updated_at = NOW() WHERE event_id = $2 AND athlete_id = $3 AND discipline = $4`,
        [placing, eventId, athId, discipline]
      );
    }
  } else {
    await client.query(
      `UPDATE results SET placing = NULL, updated_at = NOW() WHERE event_id = $1 AND discipline = $2`,
      [eventId, discipline]
    );
  }
}
