import { describe, expect, it, vi } from 'vitest';
import type { DbExecutor } from '../db/client.js';
import type {
  AthleteResultHistoryRow,
  DashboardActiveEventRow,
  DashboardMetricsRow,
  DashboardTimelineEntryRow,
  DashboardUpcomingEventRow,
  RosterSnapshotRow,
} from '../db/row-mappers.js';
import { getDashboardSummary } from './dashboard.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const TIMESTAMP = new Date('2026-08-17T10:00:00.000Z');

function runner(query: ReturnType<typeof vi.fn>) {
  return async <T>(operation: (client: DbExecutor) => Promise<T>): Promise<T> =>
    operation({ query } as DbExecutor);
}

function metricsRow(overrides: Partial<DashboardMetricsRow> = {}): DashboardMetricsRow {
  return {
    athletes_count: '0',
    active_athletes_count: '0',
    archived_athletes_count: '0',
    upcoming_event_count: '0',
    season_pbs: '0',
    ...overrides,
  };
}

function activeEventRow(
  overrides: Partial<DashboardActiveEventRow> = {},
): DashboardActiveEventRow {
  return {
    event_id: EVENT_ID,
    event_title: 'City Sprint',
    event_type: 'competition',
    event_discipline: '100m',
    event_date: '2026-08-17',
    event_time: '10:00:00',
    event_location_name: 'Central Track',
    event_status: 'in_progress',
    participant_count: '4',
    athletes_with_entries_count: '3',
    resolved_results_count: '2',
    entry_count: '5',
    ...overrides,
  };
}

function timelineRow(): DashboardTimelineEntryRow {
  return {
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
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    deleted_at: null,
    athlete_name: 'Ari Runner',
    athlete_squad_names: [],
    athlete_archived_at: TIMESTAMP,
  };
}

function historyRow(): AthleteResultHistoryRow {
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
    athlete_archived_at: TIMESTAMP,
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
  };
}

describe('getDashboardSummary', () => {
  it('returns zero counts and stable empty collections in summary mode', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('AS athletes_count')) return { rows: [metricsRow()] };
      return { rows: [] };
    });

    const dashboard = await getDashboardSummary(
      USER_ID,
      '2026-08-17',
      runner(query),
    );

    expect(dashboard).toEqual({
      state: 'summary',
      asOfDate: '2026-08-17',
      athletesCount: 0,
      activeAthletesCount: 0,
      inactiveAthletesCount: 0,
      archivedAthletesCount: 0,
      statusReviewCount: 0,
      upcomingEventCount: 0,
      seasonPbs: 0,
      activeEvent: null,
      rosterSnapshot: [],
      upcomingEvents: [],
      recentResults: [],
      recentPbs: [],
    });
  });

  it('assembles the selected live event and preserves archived historical identity', async () => {
    const roster: RosterSnapshotRow = {
      athlete_id: ATHLETE_ID,
      name: 'Ari Runner',
      squad_names: [],
      discipline: '100m',
      pb: '11.20',
    };
    const upcoming: DashboardUpcomingEventRow = {
      event_id: '55555555-5555-4555-8555-555555555555',
      title: 'Next Meet',
      type: 'competition',
      discipline: '100m',
      date: '2026-08-24',
      time: null,
      location_name: null,
      status: 'scheduled',
      athlete_count: '3',
    };
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('AS athletes_count')) {
        return { rows: [metricsRow({
          athletes_count: '2',
          active_athletes_count: '1',
          archived_athletes_count: '1',
          upcoming_event_count: '1',
          season_pbs: '1',
        })] };
      }
      if (sql.includes("e.status = 'in_progress'")) return { rows: [activeEventRow()] };
      if (sql.includes('FROM timeline_entries te') && sql.includes('LIMIT $4')) {
        return { rows: [timelineRow()] };
      }
      if (sql.includes('LEFT JOIN LATERAL')) return { rows: [roster] };
      if (sql.includes("e.status = 'scheduled'")) return { rows: [upcoming] };
      if (sql.includes('WITH history AS')) return { rows: [historyRow()] };
      return { rows: [] };
    });

    const dashboard = await getDashboardSummary(
      USER_ID,
      '2026-08-17',
      runner(query),
    );

    expect(dashboard).toMatchObject({
      state: 'live',
      athletesCount: 2,
      activeAthletesCount: 1,
      archivedAthletesCount: 1,
      activeEvent: {
        event: { id: EVENT_ID, status: 'in_progress' },
        progress: {
          participantCount: 4,
          athletesWithEntriesCount: 3,
          resolvedResultsCount: 2,
          entryCount: 5,
          completionPercent: 50,
        },
        latestEntries: [{ athlete: { id: ATHLETE_ID, archivedAt: TIMESTAMP.toISOString() } }],
      },
      upcomingEvents: [{ eventId: upcoming.event_id, athleteCount: 3 }],
      recentResults: [{ athlete: { id: ATHLETE_ID, archivedAt: TIMESTAMP.toISOString() } }],
      recentPbs: [{ result: { isPb: true } }],
    });

    const metricsCall = query.mock.calls.find(([sql]) =>
      (sql as string).includes('AS athletes_count'));
    expect(metricsCall?.[1]).toEqual([
      USER_ID,
      '2026-08-17',
      '2026-01-01',
      '2027-01-01',
      '100m',
    ]);
    const activeCall = query.mock.calls.find(([sql]) =>
      (sql as string).includes("e.status = 'in_progress'"));
    expect(activeCall?.[0]).toMatch(
      /ORDER BY e\.date ASC,[\s\S]*e\.time ASC NULLS LAST,[\s\S]*e\.created_at ASC,[\s\S]*e\.id ASC/,
    );
    expect(activeCall?.[0]).toContain('FROM event_participants ep');
    expect(activeCall?.[0]).toContain('AND e.discipline = $2');
    expect(activeCall?.[0]).toContain('AND te.discipline = $2');
    const upcomingCall = query.mock.calls.find(([sql]) =>
      (sql as string).includes("e.status = 'scheduled'"));
    expect(upcomingCall?.[0]).not.toContain("status = 'cancelled'");
    expect(upcomingCall?.[0]).toContain('AND e.discipline = $3');
  });

  it('rejects a malformed owner id before querying', async () => {
    const query = vi.fn();

    await expect(
      getDashboardSummary('not-a-uuid', '2026-08-17', runner(query)),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(query).not.toHaveBeenCalled();
  });
});
