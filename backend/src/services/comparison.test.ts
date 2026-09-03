import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../db/client.js';
import type { AthleteRow, ProgressionEntryRow } from '../db/row-mappers.js';
import { getTwoAthleteComparison } from './comparison.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_1_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_2_ID = '44444444-4444-4444-8444-444444444444';
const EVENT_1_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_2_ID = '55555555-5555-5555-8555-555555555555';
const TIMESTAMP = new Date('2026-08-17T10:00:00.000Z');

function athleteRow(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: ATHLETE_1_ID,
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
    event_id: EVENT_1_ID,
    athlete_id: ATHLETE_1_ID,
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

describe('getTwoAthleteComparison', () => {
  it('rejects duplicate athlete IDs', async () => {
    await expect(
      getTwoAthleteComparison(USER_ID, ATHLETE_1_ID, ATHLETE_1_ID, runner(vi.fn())),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ATHLETE_ID' });
  });

  it('returns 404 for a foreign/missing athlete ID', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      getTwoAthleteComparison(USER_ID, ATHLETE_1_ID, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', runner(query)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns empty comparison for two athletes with no results', async () => {
    const a1Row = athleteRow({ id: ATHLETE_1_ID, name: 'Athlete One' });
    const a2Row = athleteRow({ id: ATHLETE_2_ID, name: 'Athlete Two' });

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [a1Row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [a2Row] })
      .mockResolvedValueOnce({ rows: [] });

    const comparison = await getTwoAthleteComparison(
      USER_ID, ATHLETE_1_ID, ATHLETE_2_ID, runner(query),
    );

    expect(comparison.athletes).toHaveLength(2);
    expect(comparison.athletes[0].athlete.name).toBe('Athlete One');
    expect(comparison.athletes[0].pb).toBeNull();
    expect(comparison.athletes[0].validResultCount).toBe(0);
    expect(comparison.athletes[0].average).toBeNull();
    expect(comparison.athletes[0].consistency).toBeNull();
    expect(comparison.athletes[0].improvement).toBeNull();
    expect(comparison.athletes[1].athlete.name).toBe('Athlete Two');
  });

  it('computes PB, valid count, latest, average, consistency, and improvement', async () => {
    const a1Row = athleteRow({ id: ATHLETE_1_ID, name: 'Athlete One' });
    const a2Row = athleteRow({ id: ATHLETE_2_ID, name: 'Athlete Two' });

    const a1Results = [
      queryRow(
        { event_id: EVENT_1_ID, athlete_id: ATHLETE_1_ID, event_date: '2026-01-01', effective_result: '11.50', final_result: '11.50', running_pb: null, is_new_pb: true },
        { summary_pb: '11.20', summary_total: 3, summary_valid: 3 },
      ),
      queryRow(
        { event_id: 'aaaa1111-1111-4111-8111-111111111111', athlete_id: ATHLETE_1_ID, event_date: '2026-02-01', effective_result: '11.30', final_result: '11.30', running_pb: '11.50', is_new_pb: true },
        { summary_pb: '11.20', summary_total: 3, summary_valid: 3 },
      ),
      queryRow(
        { event_id: 'bbbb2222-2222-4222-8222-222222222222', athlete_id: ATHLETE_1_ID, event_date: '2026-03-01', effective_result: '11.20', final_result: '11.20', running_pb: '11.30', is_new_pb: true },
        { summary_pb: '11.20', summary_total: 3, summary_valid: 3 },
      ),
    ];

    const a2Results = [
      queryRow(
        { event_id: EVENT_2_ID, athlete_id: ATHLETE_2_ID, event_date: '2026-01-15', effective_result: '11.80', final_result: '11.80', running_pb: null, is_new_pb: true, athlete_name: 'Athlete Two' },
        { summary_pb: '11.80', summary_total: 1, summary_valid: 1 },
      ),
    ];

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [a1Row] })
      .mockResolvedValueOnce({ rows: a1Results })
      .mockResolvedValueOnce({ rows: [a2Row] })
      .mockResolvedValueOnce({ rows: a2Results });

    const comparison = await getTwoAthleteComparison(
      USER_ID, ATHLETE_1_ID, ATHLETE_2_ID, runner(query),
    );

    const a1 = comparison.athletes[0];
    const a2 = comparison.athletes[1];

    expect(a1.athlete.name).toBe('Athlete One');
    expect(a1.pb).toBe(11.20);
    expect(typeof a1.pb).toBe('number');
    expect(a1.validResultCount).toBe(3);
    expect(a1.latestEffectiveResult).toBe(11.20);
    expect(a1.average).toBe(11.33);
    expect(typeof a1.consistency).toBe('number');
    expect(a1.improvement).toBe(0.30);

    expect(a2.athlete.name).toBe('Athlete Two');
    expect(typeof a2.pb).toBe('number');
    expect(a2.pb).toBe(11.80);
    expect(a2.validResultCount).toBe(1);
    expect(a2.latestEffectiveResult).toBe(11.80);
    expect(a2.average).toBe(11.80);
    expect(a2.consistency).toBeNull();
    expect(a2.improvement).toBeNull();

    const [sql] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('), enriched AS (');
    expect(sql).toContain('AS counts_towards_statistics');
  });

  it('excludes void outcomes from valid count and PB', async () => {
    const a1Row = athleteRow({ id: ATHLETE_1_ID });
    const a2Row = athleteRow({ id: ATHLETE_2_ID, name: 'Athlete Two' });

    const a1Results = [
      queryRow(
        { event_id: EVENT_1_ID, effective_result: '11.20', final_result: '11.20', outcome: 'valid', running_pb: null, is_new_pb: true },
        { summary_pb: 11.20, summary_total: 3, summary_valid: 1 },
      ),
      queryRow(
        { event_id: 'aaaa1111-1111-4111-8111-111111111111', effective_result: null, final_result: null, unit: null, outcome: 'dq', effective_outcome: 'dq', running_pb: null, is_new_pb: false, counts_towards_statistics: false, placing: null, is_pb: false, is_sb: false },
        { summary_pb: 11.20, summary_total: 3, summary_valid: 1 },
      ),
      queryRow(
        { event_id: 'bbbb2222-2222-4222-8222-222222222222', effective_result: null, final_result: null, unit: null, outcome: 'dns', effective_outcome: 'dns', running_pb: null, is_new_pb: false, counts_towards_statistics: false, placing: null, is_pb: false, is_sb: false },
        { summary_pb: 11.20, summary_total: 3, summary_valid: 1 },
      ),
    ];

    const a2Results = [
      queryRow(
        { event_id: EVENT_2_ID, athlete_id: ATHLETE_2_ID, effective_result: '11.80', final_result: '11.80', running_pb: null, is_new_pb: true, athlete_name: 'Athlete Two' },
        { summary_pb: 11.80, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [a1Row] })
      .mockResolvedValueOnce({ rows: a1Results })
      .mockResolvedValueOnce({ rows: [a2Row] })
      .mockResolvedValueOnce({ rows: a2Results });

    const comparison = await getTwoAthleteComparison(
      USER_ID, ATHLETE_1_ID, ATHLETE_2_ID, runner(query),
    );

    expect(comparison.athletes[0].validResultCount).toBe(1);
    expect(comparison.athletes[0].totalResultCount).toBe(3);
    expect(comparison.athletes[0].pb).toBe(11.20);
  });

  it('handles manual overrides taking precedence over final_result', async () => {
    const a1Row = athleteRow({ id: ATHLETE_1_ID });
    const a2Row = athleteRow({ id: ATHLETE_2_ID, name: 'Athlete Two' });

    const a1Results = [
      queryRow(
        {
          event_id: EVENT_1_ID,
          effective_result: '11.05',
          final_result: '11.50',
          manual_override: '11.05',
          override_reason: 'timing correction',
          overridden_by: USER_ID,
          override_at: '2026-08-17T10:00:00.000Z',
          running_pb: null,
          is_new_pb: true,
        },
        { summary_pb: 11.05, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const a2Results = [
      queryRow(
        { event_id: EVENT_2_ID, athlete_id: ATHLETE_2_ID, effective_result: '11.80', final_result: '11.80', running_pb: null, is_new_pb: true, athlete_name: 'Athlete Two' },
        { summary_pb: 11.80, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [a1Row] })
      .mockResolvedValueOnce({ rows: a1Results })
      .mockResolvedValueOnce({ rows: [a2Row] })
      .mockResolvedValueOnce({ rows: a2Results });

    const comparison = await getTwoAthleteComparison(
      USER_ID, ATHLETE_1_ID, ATHLETE_2_ID, runner(query),
    );

    expect(comparison.athletes[0].pb).toBe(11.05);
    expect(comparison.athletes[0].latestEffectiveResult).toBe(11.05);
  });

  it('supports sparse and unequal-date histories', async () => {
    const a1Row = athleteRow({ id: ATHLETE_1_ID });
    const a2Row = athleteRow({ id: ATHLETE_2_ID, name: 'Athlete Two' });

    const a1Results = [
      queryRow(
        { event_id: EVENT_1_ID, event_date: '2020-01-01', effective_result: '12.00', final_result: '12.00', running_pb: null, is_new_pb: true },
        { summary_pb: 12.00, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const a2Results = [
      queryRow(
        { event_id: EVENT_2_ID, athlete_id: ATHLETE_2_ID, event_date: '2026-06-15', effective_result: '11.50', final_result: '11.50', running_pb: null, is_new_pb: true, athlete_name: 'Athlete Two' },
        { summary_pb: 11.50, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [a1Row] })
      .mockResolvedValueOnce({ rows: a1Results })
      .mockResolvedValueOnce({ rows: [a2Row] })
      .mockResolvedValueOnce({ rows: a2Results });

    const comparison = await getTwoAthleteComparison(
      USER_ID, ATHLETE_1_ID, ATHLETE_2_ID, runner(query),
    );

    expect(comparison.athletes[0].progression[0].event.date).toBe('2020-01-01');
    expect(comparison.athletes[1].progression[0].event.date).toBe('2026-06-15');
    expect(comparison.athletes[0].pb).toBe(12.00);
    expect(comparison.athletes[1].pb).toBe(11.50);
  });

  it('handles archived athletes with intentional inclusion', async () => {
    const a1Row = athleteRow({
      id: ATHLETE_1_ID,
      name: 'Archived Athlete',
      archived_at: new Date('2026-06-01T00:00:00.000Z'),
    });

    const a2Row = athleteRow({ id: ATHLETE_2_ID, name: 'Active Athlete' });

    const a1Results = [
      queryRow(
        { event_id: EVENT_1_ID, effective_result: '11.50', final_result: '11.50', running_pb: null, is_new_pb: true },
        { summary_pb: 11.50, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const a2Results = [
      queryRow(
        { event_id: EVENT_2_ID, athlete_id: ATHLETE_2_ID, effective_result: '11.30', final_result: '11.30', running_pb: null, is_new_pb: true, athlete_name: 'Active Athlete' },
        { summary_pb: 11.30, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [a1Row] })
      .mockResolvedValueOnce({ rows: a1Results })
      .mockResolvedValueOnce({ rows: [a2Row] })
      .mockResolvedValueOnce({ rows: a2Results });

    const comparison = await getTwoAthleteComparison(
      USER_ID, ATHLETE_1_ID, ATHLETE_2_ID, runner(query),
    );

    expect(comparison.athletes[0].athlete.archivedAt).not.toBeNull();
    expect(comparison.athletes[0].athlete.name).toBe('Archived Athlete');
  });

  it('handles multiple squad memberships without duplicating statistics', async () => {
    const a1Row = athleteRow({
      id: ATHLETE_1_ID,
      squads: [
        { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Sprint A', archivedAt: null, createdAt: TIMESTAMP, updatedAt: TIMESTAMP },
        { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Sprint B', archivedAt: null, createdAt: TIMESTAMP, updatedAt: TIMESTAMP },
      ],
    });
    const a2Row = athleteRow({ id: ATHLETE_2_ID, name: 'Athlete Two' });

    const a1Results = [
      queryRow(
        { event_id: EVENT_1_ID, effective_result: '11.50', final_result: '11.50', running_pb: null, is_new_pb: true },
        { summary_pb: 11.50, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const a2Results = [
      queryRow(
        { event_id: EVENT_2_ID, athlete_id: ATHLETE_2_ID, effective_result: '11.80', final_result: '11.80', running_pb: null, is_new_pb: true, athlete_name: 'Athlete Two' },
        { summary_pb: 11.80, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [a1Row] })
      .mockResolvedValueOnce({ rows: a1Results })
      .mockResolvedValueOnce({ rows: [a2Row] })
      .mockResolvedValueOnce({ rows: a2Results });

    const comparison = await getTwoAthleteComparison(
      USER_ID, ATHLETE_1_ID, ATHLETE_2_ID, runner(query),
    );

    expect(comparison.athletes[0].validResultCount).toBe(1);
    expect(comparison.athletes[0].athlete.squadNames).toEqual(['Sprint A', 'Sprint B']);
  });

  it('returns aligned progression entries sorted chronologically', async () => {
    const a1Row = athleteRow({ id: ATHLETE_1_ID });
    const a2Row = athleteRow({ id: ATHLETE_2_ID, name: 'Athlete Two' });

    const a1Results = [
      queryRow(
        { event_id: EVENT_1_ID, event_date: '2026-06-01', effective_result: '11.50', final_result: '11.50', running_pb: null, is_new_pb: true },
        { summary_pb: 11.20, summary_total: 3, summary_valid: 3 },
      ),
      queryRow(
        { event_id: 'aaaa1111-1111-4111-8111-111111111111', event_date: '2026-07-01', effective_result: '11.30', final_result: '11.30', running_pb: '11.50', is_new_pb: true },
        { summary_pb: 11.20, summary_total: 3, summary_valid: 3 },
      ),
      queryRow(
        { event_id: 'bbbb2222-2222-4222-8222-222222222222', event_date: '2026-08-01', effective_result: '11.20', final_result: '11.20', running_pb: '11.30', is_new_pb: true },
        { summary_pb: 11.20, summary_total: 3, summary_valid: 3 },
      ),
    ];

    const a2Results = [
      queryRow(
        { event_id: EVENT_2_ID, athlete_id: ATHLETE_2_ID, event_date: '2026-06-15', effective_result: '11.80', final_result: '11.80', running_pb: null, is_new_pb: true, athlete_name: 'Athlete Two' },
        { summary_pb: 11.80, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [a1Row] })
      .mockResolvedValueOnce({ rows: a1Results })
      .mockResolvedValueOnce({ rows: [a2Row] })
      .mockResolvedValueOnce({ rows: a2Results });

    const comparison = await getTwoAthleteComparison(
      USER_ID, ATHLETE_1_ID, ATHLETE_2_ID, runner(query),
    );

    expect(comparison.athletes[0].progression).toHaveLength(3);
    expect(comparison.athletes[0].progression[0].event.date).toBe('2026-06-01');
    expect(comparison.athletes[0].progression[1].event.date).toBe('2026-07-01');
    expect(comparison.athletes[0].progression[2].event.date).toBe('2026-08-01');
    expect(comparison.athletes[0].progression[2].isNewPb).toBe(true);
  });

  it('handles athletes with no valid results gracefully', async () => {
    const a1Row = athleteRow({ id: ATHLETE_1_ID, name: 'No Results' });
    const a2Row = athleteRow({ id: ATHLETE_2_ID, name: 'Athlete Two' });

    const a1Results = [
      queryRow(
        {
          event_id: EVENT_1_ID,
          effective_result: null,
          final_result: null,
          unit: null,
          outcome: 'dq',
          effective_outcome: 'dq',
          running_pb: null,
          is_new_pb: false,
          counts_towards_statistics: false,
          placing: null,
          is_pb: false,
          is_sb: false,
        },
        { summary_pb: null, summary_total: 1, summary_valid: 0 },
      ),
    ];

    const a2Results = [
      queryRow(
        { event_id: EVENT_2_ID, athlete_id: ATHLETE_2_ID, effective_result: '11.80', final_result: '11.80', running_pb: null, is_new_pb: true, athlete_name: 'Athlete Two' },
        { summary_pb: 11.80, summary_total: 1, summary_valid: 1 },
      ),
    ];

    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [a1Row] })
      .mockResolvedValueOnce({ rows: a1Results })
      .mockResolvedValueOnce({ rows: [a2Row] })
      .mockResolvedValueOnce({ rows: a2Results });

    const comparison = await getTwoAthleteComparison(
      USER_ID, ATHLETE_1_ID, ATHLETE_2_ID, runner(query),
    );

    expect(comparison.athletes[0].pb).toBeNull();
    expect(comparison.athletes[0].validResultCount).toBe(0);
    expect(comparison.athletes[0].average).toBeNull();
    expect(comparison.athletes[0].consistency).toBeNull();
    expect(comparison.athletes[0].improvement).toBeNull();
    expect(comparison.athletes[0].latestEffectiveResult).toBeNull();
  });
});
