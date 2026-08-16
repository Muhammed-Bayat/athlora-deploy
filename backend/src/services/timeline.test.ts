import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../db/client.js';
import type { TimelineEntryRow } from '../db/row-mappers.js';
import type { TimelineEntryCreatePayload } from '../validation/payloads.js';
import {
  createTimelineEntry,
  recomputeEventResults,
  removeTimelineEntry,
  updateTimelineEntry,
} from './timeline.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';

const entryRow: TimelineEntryRow = {
  id: ENTRY_ID,
  event_id: EVENT_ID,
  athlete_id: ATHLETE_ID,
  discipline: '100m',
  entry_type: 'attempt',
  value: '11.20',
  unit: 'seconds',
  is_foul: false,
  incident_type: null,
  note_text: null,
  recorded_by: USER_ID,
  version: 1,
  device_id: null,
  created_at: new Date('2026-08-16T10:00:00.000Z'),
  updated_at: new Date('2026-08-16T10:00:00.000Z'),
  deleted_at: null,
};

const payload: TimelineEntryCreatePayload = {
  athleteId: ATHLETE_ID,
  discipline: '100m',
  entryType: 'attempt',
  value: 11.2,
  unit: 'seconds',
  isFoul: false,
  incidentType: null,
  noteText: null,
  deviceId: null,
};

function transaction(query: ReturnType<typeof vi.fn>) {
  return async <T>(operation: (client: DbExecutor) => Promise<T>) => operation({ query } as never);
}

function successfulQuery(options: {
  status?: 'in_progress' | 'scheduled';
  current?: TimelineEntryRow;
  updated?: TimelineEntryRow;
  derivedEntries?: TimelineEntryRow[];
  scoring?: { athlete_id: string; outcome: 'valid' | 'no_result' | 'dq'; final_result: string | null; manual_override: string | null }[];
  historical?: Array<{
    event_id: string;
    athlete_id: string;
    outcome: 'valid' | 'no_result' | 'dq';
    final_result: string | null;
    manual_override: string | null;
    event_date: string;
    event_status: 'in_progress';
  }>;
  eventAthletes?: { athlete_id: string }[];
} = {}) {
  const current = options.current ?? entryRow;
  return vi.fn(async (sqlValue: string, _parameters?: readonly unknown[]) => {
    const sql = String(sqlValue);
    if (sql.includes('SELECT e.type, e.status')) {
      return { rows: [{ type: 'competition', status: options.status ?? 'in_progress' }] };
    }
    if (sql.includes('SELECT athlete_id') && sql.includes('UNION')) {
      return { rows: options.eventAthletes ?? [] };
    }
    if (sql.includes('FROM athletes') && sql.includes('ANY($1::uuid[])')) {
      return { rows: (options.eventAthletes ?? []).map((row) => ({ id: row.athlete_id })) };
    }
    if (sql.includes('e.type AS event_type')) {
      return { rows: [{ ...current, event_type: 'competition', event_status: options.status ?? 'in_progress' }] };
    }
    if (sql.includes('INSERT INTO timeline_entries')) return { rows: [entryRow] };
    if (sql.includes('UPDATE timeline_entries') && sql.includes('SET entry_type')) {
      return { rows: [options.updated ?? { ...current, value: '10.90', version: 2 }] };
    }
    if (sql.includes('SET deleted_at = now()')) return { rows: [{ id: ENTRY_ID }] };
    if (sql.includes('FROM timeline_entries') && sql.includes('ORDER BY created_at')) {
      return { rows: options.derivedEntries ?? [current] };
    }
    if (sql.includes('INSERT INTO results')) return { rows: [] };
    if (sql.includes('r.athlete_id, r.outcome')) {
      return { rows: options.scoring ?? [{ athlete_id: ATHLETE_ID, outcome: 'valid', final_result: '11.20', manual_override: null }] };
    }
    if (sql.includes('SELECT r.event_id')) {
      return { rows: options.historical ?? [{
        event_id: EVENT_ID,
        athlete_id: ATHLETE_ID,
        outcome: 'valid',
        final_result: '11.20',
        manual_override: null,
        event_date: '2026-09-01',
        event_status: 'in_progress',
      }] };
    }
    if (sql.includes('UPDATE results')) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
}

describe('timeline service', () => {
  it('creates an owned entry and recomputes its result in one transaction executor', async () => {
    const query = successfulQuery();
    const created = await createTimelineEntry(USER_ID, EVENT_ID, payload, transaction(query));

    expect(created).toMatchObject({ id: ENTRY_ID, athleteId: ATHLETE_ID, value: 11.2, version: 1 });
    const insert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO timeline_entries'));
    expect(insert?.[1]).toEqual([
      EVENT_ID, ATHLETE_ID, '100m', 'attempt', 11.2, 'seconds', false, null, null, USER_ID, null,
    ]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('ON CONFLICT'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('SET placing'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('SET is_pb'))).toBe(true);
  });

  it('rejects a non-live event inside the transaction before inserting', async () => {
    const query = successfulQuery({ status: 'scheduled' });
    await expect(
      createTimelineEntry(USER_ID, EVENT_ID, payload, transaction(query)),
    ).rejects.toMatchObject({ status: 409, code: 'EVENT_NOT_IN_PROGRESS' });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO timeline_entries'))).toBe(false);
  });

  it('merges a sparse patch, increments version, and recomputes', async () => {
    const updatedRow = { ...entryRow, value: '10.90', version: 2, device_id: 'watch-1' };
    const query = successfulQuery({ updated: updatedRow, derivedEntries: [updatedRow] });
    const updated = await updateTimelineEntry(
      USER_ID,
      EVENT_ID,
      ENTRY_ID,
      { value: 10.9, deviceId: 'watch-1' },
      transaction(query),
    );

    expect(updated).toMatchObject({ value: 10.9, version: 2, deviceId: 'watch-1' });
    const update = query.mock.calls.find(([sql]) => String(sql).includes('SET entry_type'));
    expect(update?.[1]).toEqual(['attempt', 10.9, 'seconds', null, null, 'watch-1', ENTRY_ID, EVENT_ID]);
    expect(String(update?.[0])).toContain('version = version + 1');
  });

  it('revalidates merged patch state before updating', async () => {
    const query = successfulQuery();
    await expect(
      updateTimelineEntry(USER_ID, EVENT_ID, ENTRY_ID, { entryType: 'note' }, transaction(query)),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('SET entry_type'))).toBe(false);
  });

  it('soft-deletes with a version bump and recomputes without the tombstone', async () => {
    const deletedRow = { ...entryRow, version: 2, deleted_at: new Date('2026-08-16T11:00:00.000Z') };
    const query = successfulQuery({ derivedEntries: [deletedRow] });
    await removeTimelineEntry(USER_ID, EVENT_ID, ENTRY_ID, transaction(query));

    const removal = query.mock.calls.find(([sql]) => String(sql).includes('SET deleted_at = now()'));
    expect(removal?.[1]).toEqual([ENTRY_ID, EVENT_ID]);
    expect(String(removal?.[0])).toContain('version = version + 1');
    expect(query.mock.calls.some(([sql]) => /^DELETE\s/i.test(String(sql).trim()))).toBe(false);
    const upsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO results'));
    expect(upsert?.[1]).toEqual([EVENT_ID, ATHLETE_ID, '100m', 'no_result', null, null]);
  });

  it('preserves a no-result override as the effective placing and PB/SB value', async () => {
    const deletedRow = { ...entryRow, version: 2, deleted_at: new Date('2026-08-16T11:00:00.000Z') };
    const overridden = {
      athlete_id: ATHLETE_ID,
      outcome: 'no_result' as const,
      final_result: null,
      manual_override: '10.95',
    };
    const query = successfulQuery({
      derivedEntries: [deletedRow],
      scoring: [overridden],
      historical: [{
        event_id: EVENT_ID,
        ...overridden,
        event_date: '2026-09-01',
        event_status: 'in_progress',
      }],
    });

    await removeTimelineEntry(USER_ID, EVENT_ID, ENTRY_ID, transaction(query));
    const placingUpdate = query.mock.calls.find(([sql]) => String(sql).includes('SET placing'));
    expect(placingUpdate?.[1]?.[0]).toBe(1);
    const flagsUpdate = query.mock.calls.find(([sql]) => String(sql).includes('SET is_pb'));
    expect(flagsUpdate?.[1]?.slice(0, 2)).toEqual([true, true]);
  });

  it('uses one generic not-found response for malformed IDs', async () => {
    const query = vi.fn();
    await expect(
      removeTimelineEntry(USER_ID, EVENT_ID, 'invalid', transaction(query)),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(query).not.toHaveBeenCalled();
  });

  it('locks affected athletes before event-wide result recomputation', async () => {
    const query = successfulQuery({ eventAthletes: [{ athlete_id: ATHLETE_ID }] });
    await recomputeEventResults({ query } as never, EVENT_ID, 'competition');

    const lockIndex = query.mock.calls.findIndex(([sql]) => String(sql).includes('ANY($1::uuid[])'));
    const resultIndex = query.mock.calls.findIndex(([sql]) => String(sql).includes('INSERT INTO results'));
    expect(lockIndex).toBeGreaterThan(0);
    expect(resultIndex).toBeGreaterThan(lockIndex);
    expect(query.mock.calls[lockIndex]?.[1]).toEqual([[ATHLETE_ID]]);
  });
});
