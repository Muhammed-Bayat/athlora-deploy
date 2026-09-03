import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../db/client.js';
import type {
  AthleteRow,
  ProgressionEntryRow,
} from '../db/row-mappers.js';
import { getAthleteProgressionDetail } from './progression.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const TIMESTAMP = new Date('2026-08-17T10:00:00.000Z');

function athleteRow(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: ATHLETE_ID,
    coach_id: USER_ID,
    name: 'Ari Runner',
    dob: null,
    gender: null,
    squads: [],
    notes: null,
    archived_at: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

function progressionRow(overrides: Partial<ProgressionEntryRow> = {}): ProgressionEntryRow {
  return {
    event_id: EVENT_ID,
    athlete_id: ATHLETE_ID,
    discipline: '100m',
    outcome: 'valid',
    final_result: '11.20',
    unit: 'seconds',
    placing: 1,
    is_pb: true,
    is_sb: true,
    manual_override: null,
    override_reason: null,
    overridden_by: null,
    override_at: null,
    updated_at: TIMESTAMP,
    athlete_name: 'Ari Runner',
    athlete_squad_names: [],
    athlete_archived_at: null,
    event_title: 'City Sprint',
    event_type: 'competition',
    event_discipline: '100m',
    event_date: '2026-08-17',
    event_time: '10:00:00',
    event_location_name: 'Central Track',
    event_status: 'completed',
    effective_result: '11.20',
    effective_outcome: 'valid',
    counts_towards_statistics: true,
    running_pb: null,
    is_new_pb: true,
    ...overrides,
  };
}

function summaryFields(overrides: { summary_pb?: number | string | null; summary_total?: number; summary_valid?: number } = {}): { summary_pb: number | string | null; summary_total: number; summary_valid: number } {
  return {
    summary_pb: overrides.summary_pb ?? null,
    summary_total: overrides.summary_total ?? 0,
    summary_valid: overrides.summary_valid ?? 0,
  };
}

type ProgressionQueryRow = ProgressionEntryRow & { summary_pb: number | string | null; summary_total: number; summary_valid: number };

function queryRow(entryOverrides: Partial<ProgressionEntryRow> = {}, summaryOverrides: { summary_pb?: number | string | null; summary_total?: number; summary_valid?: number } = {}): ProgressionQueryRow {
  return { ...progressionRow(entryOverrides), ...summaryFields(summaryOverrides) };
}

function runner(query: ReturnType<typeof vi.fn>) {
  return async <T>(operation: (client: DbExecutor) => Promise<T>): Promise<T> =>
    operation({ query } as DbExecutor);
}

describe('getAthleteProgressionDetail', () => {
  it('returns empty progression for an athlete with no results', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({ rows: [] });

    const progression = await getAthleteProgressionDetail(
      USER_ID,
      ATHLETE_ID,
      {},
      runner(query),
    );

    expect(progression).toMatchObject({
      athlete: { id: ATHLETE_ID, name: 'Ari Runner' },
      entries: [],
      pagination: { nextCursor: null, count: 0, total: 0 },
      summary: { allTimePb: null, totalResults: 0, totalValid: 0 },
    });
  });

  it('returns entries in chronological order with running PB', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({
        rows: [
          queryRow({
            event_id: 'aaaa1111-1111-4111-8111-111111111111',
            event_date: '2026-06-01',
            event_time: '10:00:00',
            final_result: '11.50',
            effective_result: '11.50',
            running_pb: null,
            is_new_pb: true,
          }, { summary_pb: '11.05', summary_total: 3, summary_valid: 3 }),
          queryRow({
            event_id: 'aaaa2222-2222-4222-8222-222222222222',
            event_date: '2026-07-01',
            event_time: '10:00:00',
            final_result: '11.20',
            effective_result: '11.20',
            running_pb: '11.50',
            is_new_pb: true,
          }, { summary_pb: 11.05, summary_total: 3, summary_valid: 3 }),
          queryRow({
            event_id: 'aaaa3333-3333-4333-8333-333333333333',
            event_date: '2026-08-01',
            event_time: '10:00:00',
            final_result: '11.05',
            effective_result: '11.05',
            running_pb: '11.20',
            is_new_pb: true,
          }, { summary_pb: 11.05, summary_total: 3, summary_valid: 3 }),
        ],
      });

    const progression = await getAthleteProgressionDetail(
      USER_ID,
      ATHLETE_ID,
      {},
      runner(query),
    );

    expect(progression.entries).toHaveLength(3);
    expect(progression.entries[0].event.date).toBe('2026-06-01');
    expect(progression.entries[1].event.date).toBe('2026-07-01');
    expect(progression.entries[2].event.date).toBe('2026-08-01');

    expect(progression.entries[0].runningPb).toBeNull();
    expect(progression.entries[0].isNewPb).toBe(true);

    expect(progression.entries[1].runningPb).toBe(11.5);
    expect(progression.entries[1].isNewPb).toBe(true);

    expect(progression.entries[2].runningPb).toBe(11.2);
    expect(progression.entries[2].isNewPb).toBe(true);

    expect(progression.summary).toEqual({
      allTimePb: 11.05,
      totalResults: 3,
      totalValid: 3,
    });
  });

  it('marks non-PB results correctly', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({
        rows: [
          queryRow({
            event_id: 'aaaa1111-1111-4111-8111-111111111111',
            event_date: '2026-06-01',
            final_result: '11.00',
            effective_result: '11.00',
            running_pb: null,
            is_new_pb: true,
          }, { summary_pb: 11.00, summary_total: 2, summary_valid: 2 }),
          queryRow({
            event_id: 'aaaa2222-2222-4222-8222-222222222222',
            event_date: '2026-07-01',
            final_result: '11.20',
            effective_result: '11.20',
            running_pb: '11.00',
            is_new_pb: false,
          }, { summary_pb: 11.00, summary_total: 2, summary_valid: 2 }),
        ],
      });

    const progression = await getAthleteProgressionDetail(
      USER_ID,
      ATHLETE_ID,
      {},
      runner(query),
    );

    expect(progression.entries[0].isNewPb).toBe(true);
    expect(progression.entries[1].isNewPb).toBe(false);
    expect(progression.entries[1].runningPb).toBe(11.0);
  });

  it('handles void outcomes with null effective result', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({
        rows: [
          queryRow({
            event_id: 'aaaa1111-1111-4111-8111-111111111111',
            event_date: '2026-06-01',
            outcome: 'dq',
            final_result: null,
            unit: null,
            placing: null,
            is_pb: false,
            is_sb: false,
            effective_result: null,
            effective_outcome: 'dq',
            counts_towards_statistics: false,
            running_pb: null,
            is_new_pb: false,
          }, { summary_pb: null, summary_total: 1, summary_valid: 0 }),
        ],
      });

    const progression = await getAthleteProgressionDetail(
      USER_ID,
      ATHLETE_ID,
      {},
      runner(query),
    );

    expect(progression.entries).toHaveLength(1);
    expect(progression.entries[0].effectiveResult).toBeNull();
    expect(progression.entries[0].effectiveOutcome).toBe('dq');
    expect(progression.entries[0].isNewPb).toBe(false);
    expect(progression.summary.allTimePb).toBeNull();
  });

  it('respects manual override in effective result', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({
        rows: [
          queryRow({
            event_id: 'aaaa1111-1111-4111-8111-111111111111',
            event_date: '2026-06-01',
            final_result: '11.50',
            manual_override: '10.95',
            override_reason: 'Timing correction',
            overridden_by: USER_ID,
            override_at: TIMESTAMP,
            effective_result: '10.95',
            running_pb: null,
            is_new_pb: true,
          }, { summary_pb: 10.95, summary_total: 1, summary_valid: 1 }),
        ],
      });

    const progression = await getAthleteProgressionDetail(
      USER_ID,
      ATHLETE_ID,
      {},
      runner(query),
    );

    expect(progression.entries[0].effectiveResult).toBe(10.95);
    expect(progression.entries[0].result.manualOverride).toBe(10.95);
    expect(progression.entries[0].isNewPb).toBe(true);
  });

  it('provides cursor pagination with nextCursor', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => {
      const date = new Date(2026, 0, 1 + i);
      const dateStr = date.toISOString().slice(0, 10);
      return queryRow({
        event_id: `aaaa${String(i + 1).padStart(4, '0')}-1111-4111-8111-111111111111`,
        event_date: dateStr,
        final_result: String(12.0 - i * 0.02),
        effective_result: String(12.0 - i * 0.02),
        running_pb: i === 0 ? null : String(12.0 - (i - 1) * 0.02),
        is_new_pb: true,
      }, { summary_pb: 11.02, summary_total: 50, summary_valid: 50 });
    });

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({ rows });

    const progression = await getAthleteProgressionDetail(
      USER_ID,
      ATHLETE_ID,
      { limit: 50 },
      runner(query),
    );

    expect(progression.entries).toHaveLength(50);
    expect(progression.pagination.nextCursor).not.toBeNull();
    expect(progression.pagination.count).toBe(50);
  });

  it('returns null nextCursor when fewer results than page size', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({
        rows: [
          queryRow({}, { summary_pb: 11.20, summary_total: 1, summary_valid: 1 }),
        ],
      });

    const progression = await getAthleteProgressionDetail(
      USER_ID,
      ATHLETE_ID,
      {},
      runner(query),
    );

    expect(progression.pagination.nextCursor).toBeNull();
    expect(progression.pagination.total).toBe(1);
  });

  it('filters by event type when type parameter is provided', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({
        rows: [
          queryRow({
            event_type: 'competition',
          }, { summary_pb: 11.20, summary_total: 1, summary_valid: 1 }),
        ],
      });

    await getAthleteProgressionDetail(
      USER_ID,
      ATHLETE_ID,
      { type: 'competition' },
      runner(query),
    );

    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('e.type = $5');
    expect(params).toContain('competition');
  });

  it('rejects malformed ownership identifiers', async () => {
    const query = vi.fn();

    await expect(
      getAthleteProgressionDetail(USER_ID, 'not-a-uuid', {}, runner(query)),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(query).not.toHaveBeenCalled();
  });

  it('returns archived athlete progression', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow({ archived_at: TIMESTAMP })] })
      .mockResolvedValueOnce({
        rows: [
          queryRow({}, { summary_pb: 11.20, summary_total: 1, summary_valid: 1 }),
        ],
      });

    const progression = await getAthleteProgressionDetail(
      USER_ID,
      ATHLETE_ID,
      {},
      runner(query),
    );

    expect(progression.athlete.archivedAt).toBe('2026-08-17T10:00:00.000Z');
    expect(progression.entries).toHaveLength(1);
  });
});
