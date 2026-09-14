import type { PoolClient } from 'pg';
import { DISCIPLINE_100M, type Discipline, type EventType } from '../types/domain.js';
import { recomputeEventResults } from './timeline.js';

export async function recomputeAndUpsertResult(
  client: PoolClient,
  eventId: string,
  _athleteId: string,
  discipline: Discipline = DISCIPLINE_100M,
): Promise<void> {
  const eventResult = await client.query<{ type: EventType }>(
    `SELECT type
     FROM events
     WHERE id = $1
     FOR UPDATE`,
    [eventId],
  );
  const event = eventResult.rows[0];
  if (!event || discipline !== DISCIPLINE_100M) return;

  // Recompute the whole event so overrides update placings and every affected PB/SB flag.
  await recomputeEventResults(client, eventId, event.type);
}
