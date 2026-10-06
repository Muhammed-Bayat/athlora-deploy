import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../db/client.js';
import type {
  AthleteResultHistoryRow,
  AthleteRow,
  AthleteStatisticsAggregateRow,
} from '../db/row-mappers.js';
import { getAthleteStatisticsDetail } from './statistics.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const OVERRIDER_ID = '44444444-4444-4444-8444-444444444444';
const TIMESTAMP = new Date('2026-08-17T10:00:00.000Z');

function athleteRow(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: ATHLETE_ID,
    coach_id: USER_ID,
    name: 'Ari Runner',
    dob: null,
    gender: null,
    notes: null,
    archived_at: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

function aggregateRow(
  overrides: Partial<AthleteStatisticsAggregateRow> = {},
): AthleteStatisticsAggregateRow {
  return {
    athlete_id: ATHLETE_ID,
    discipline: '100m',
    unit: 'seconds',
    pb: null,
    sb: null,
    results_count: '0',
    latest_result: null,
    latest_outcome: 'no_result',
    updated_at: TIMESTAMP,
    all_time_count: '0',
    current_year_count: '0',
    competition_all_time_count: '0',
    training_all_time_count: '0',
    ...overrides,
  };
}

function historyRow(
  overrides: Partial<AthleteResultHistoryRow> = {},
): AthleteResultHistoryRow {
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
    ...overrides,
  };
}

function runner(query: ReturnType<typeof vi.fn>) {
  return async <T>(operation: (client: DbExecutor) => Promise<T>): Promise<T> =>
    operation({ query } as DbExecutor);
}

describe('getAthleteStatisticsDetail', () => {
  it('returns a stable empty structure for an archived athlete without results', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow({ archived_at: TIMESTAMP })] })
      .mockResolvedValueOnce({ rows: [aggregateRow()] })
      .mockResolvedValueOnce({ rows: [] });

    const statistics = await getAthleteStatisticsDetail(
      USER_ID,
      ATHLETE_ID,
      '2026-08-17',
      runner(query),
    );

    expect(statistics).toMatchObject({
      athlete: {
        id: ATHLETE_ID,
        name: 'Ari Runner',
        archivedAt: '2026-08-17T10:00:00.000Z',
      },
      pb: null,
      sb: null,
      resultsCount: 0,
      latestResult: null,
      latestOutcome: 'no_result',
      resultCounts: {
        allTime: 0,
        currentYear: 0,
        competitionAllTime: 0,
        trainingAllTime: 0,
      },
      latest: null,
      recentResults: { competitions: [], training: [] },
    });
  });

  it('uses effective values, separates event types, and retains cancelled history', async () => {
    const cancelledEventId = '55555555-5555-4555-8555-555555555555';
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({
        rows: [aggregateRow({
          pb: '10.90',
          sb: '11.00',
          results_count: '2',
          latest_result: '11.10',
          latest_outcome: 'valid',
          all_time_count: '4',
          current_year_count: '2',
          competition_all_time_count: '3',
          training_all_time_count: '1',
        })],
      })
      .mockResolvedValueOnce({
        rows: [
          historyRow({
            event_type: 'training',
            outcome: 'no_result',
            final_result: null,
            unit: null,
            placing: 1,
            manual_override: '11.10',
            override_reason: 'Official timing correction',
            overridden_by: OVERRIDER_ID,
            override_at: TIMESTAMP,
            effective_result: '11.10',
            effective_outcome: 'valid',
          }),
          historyRow({
            event_id: cancelledEventId,
            event_status: 'cancelled',
            event_date: '2026-08-16',
            is_pb: false,
            is_sb: false,
            counts_towards_statistics: false,
          }),
          historyRow({
            event_id: '66666666-6666-4666-8666-666666666666',
            outcome: 'dq',
            final_result: null,
            unit: null,
            placing: null,
            is_pb: false,
            is_sb: false,
            effective_result: null,
            effective_outcome: 'dq',
            counts_towards_statistics: false,
          }),
        ],
      });

    const statistics = await getAthleteStatisticsDetail(
      USER_ID,
      ATHLETE_ID,
      '2026-08-17',
      runner(query),
    );

    expect(statistics.pb).toBe(10.9);
    expect(statistics.sb).toBe(11);
    expect(statistics.resultCounts).toEqual({
      allTime: 4,
      currentYear: 2,
      competitionAllTime: 3,
      trainingAllTime: 1,
    });
    expect(statistics.latest?.effectiveResult).toBe(11.1);
    expect(statistics.recentResults.training).toHaveLength(1);
    expect(statistics.recentResults.competitions).toHaveLength(2);
    expect(statistics.recentResults.competitions[0]).toMatchObject({
      event: { id: cancelledEventId, status: 'cancelled' },
      countsTowardsStatistics: false,
    });

    const [aggregateSql, aggregateParameters] = query.mock.calls[1] as [string, unknown[]];
    expect(aggregateSql).toContain("e.status = 'completed'");
    expect(aggregateSql).toContain("e.event_type = 'competition'");
    expect(aggregateParameters).toEqual([
      ATHLETE_ID,
      USER_ID,
      '100m',
      'seconds',
      '2026-01-01',
      '2027-01-01',
    ]);
    const [historySql, historyParameters] = query.mock.calls[2] as [string, unknown[]];
    expect(historySql).not.toContain("e.status = 'completed'");
    // The log covers every discipline the athlete has results in.
    expect(historySql).not.toMatch(/discipline = \$\d/);
    expect(historySql).not.toMatch(/d\.code = \$\d/);
    expect(historyParameters).toEqual([
      ATHLETE_ID,
      USER_ID,
      10,
      '2026-01-01',
      '2027-01-01',
    ]);
  });

  it('loads a single relay history row carrying the squad and every leg split', async () => {
    const relay = {
      teamName: "Pook's relay team",
      members: ['Ari Runner', 'A', 'B', 'C'],
      legs: [
        { leg: 1, name: 'Ari Runner', value: 9.5 },
        { leg: 2, name: 'A', value: 10 },
        { leg: 3, name: 'B', value: 8.7 },
        { leg: 4, name: 'C', value: 9.95 },
      ],
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [athleteRow()] })
      .mockResolvedValueOnce({ rows: [aggregateRow()] })
      .mockResolvedValueOnce({
        rows: [
          historyRow({
            discipline: '4x100m',
            event_discipline: '4x100m',
            final_result: '38.15',
            effective_result: '38.15',
            placing: null,
            is_pb: false,
            is_sb: false,
            note: null,
            relay,
          }),
        ],
      });

    const statistics = await getAthleteStatisticsDetail(
      USER_ID,
      ATHLETE_ID,
      '2026-08-17',
      runner(query),
    );

    expect(statistics.recentResults.competitions).toHaveLength(1);
    const [team] = statistics.recentResults.competitions;
    expect(team).toMatchObject({ effectiveResult: 38.15, note: null, relay });

    const [historySql] = query.mock.calls[2] as [string, unknown[]];
    expect(historySql).toContain('e.discipline IS NOT NULL');
    expect(historySql).toContain("'teamName', en.name");
    expect(historySql).toContain("'legs'");
    expect(historySql).toContain('session_relay_selections');
    expect(historySql).toContain("entrantType' = 'relay'");
    // The squad and its splits ride inside the team row rather than as extra rows.
    expect(historySql).not.toContain("'Team: ' || en.name");
    expect(historySql).not.toContain("'Leg ' || rm.leg::text");
  });

  it('rejects malformed ownership identifiers without aggregate queries', async () => {
    const query = vi.fn();

    await expect(
      getAthleteStatisticsDetail(USER_ID, 'not-a-uuid', '2026-08-17', runner(query)),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(query).not.toHaveBeenCalled();
  });
});
