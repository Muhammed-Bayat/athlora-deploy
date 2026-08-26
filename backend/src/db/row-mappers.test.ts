import { describe, expect, it } from 'vitest';
import {
  DatabaseMappingError,
  mapApplicationUserContextRow,
  mapAthleteResultHistoryRow,
  mapAthleteRow,
  mapAthleteStatisticsRow,
  mapDashboardActiveEventRow,
  mapDashboardMetricsRow,
  mapDashboardTimelineEntryRow,
  mapDashboardUpcomingEventRow,
  mapEventParticipantRow,
  mapEventParticipantSummaryRow,
  mapEventRow,
  mapResultRow,
  mapRosterSnapshotRow,
  mapTimelineEntryRow,
  mapUserRow,
  type ApplicationUserContextRow,
  type AthleteResultHistoryRow,
  type AthleteRow,
  type AthleteStatisticsRow,
  type DashboardActiveEventRow,
  type DashboardMetricsRow,
  type DashboardTimelineEntryRow,
  type DashboardUpcomingEventRow,
  type EventParticipantRow,
  type EventParticipantSummaryRow,
  type EventRow,
  type ResultRow,
  type RosterSnapshotRow,
  type TimelineEntryRow,
  type UserRow,
} from './row-mappers.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const OVERRIDER_ID = '55555555-5555-4555-8555-555555555555';
const INPUT_TIMESTAMP = '2026-08-14 10:20:30.123+02';
const ISO_TIMESTAMP = '2026-08-14T08:20:30.123Z';

const userRow: UserRow = {
  id: USER_ID,
  auth0_id: 'auth0|coach-1',
  name: 'Taylor Coach',
  email: 'taylor@example.com',
  role: 'coach',
  created_at: INPUT_TIMESTAMP,
  updated_at: new Date('2026-08-14T08:20:30.123Z'),
};

const contextRow: ApplicationUserContextRow = {
  user_id: USER_ID,
  auth0_id: 'auth0|coach-1',
  role: 'assistant',
};

const athleteRow: AthleteRow = {
  id: ATHLETE_ID,
  coach_id: USER_ID,
  name: 'Ari Runner',
  dob: '2004-02-29',
  gender: 'open',
  squad: 'Senior A',
  notes: 'Returning from injury',
  archived_at: null,
  created_at: INPUT_TIMESTAMP,
  updated_at: INPUT_TIMESTAMP,
};

const eventRow: EventRow = {
  id: EVENT_ID,
  created_by: USER_ID,
  type: 'competition',
  discipline: '100m',
  title: 'City Sprint Meet',
  date: '2026-09-01',
  time: '09:30',
  location_name: 'Central Track',
  latitude: '53.349800',
  longitude: -6.2603,
  status: 'scheduled',
  created_at: INPUT_TIMESTAMP,
  updated_at: INPUT_TIMESTAMP,
};

const participantRow: EventParticipantRow = {
  event_id: EVENT_ID,
  athlete_id: ATHLETE_ID,
  rsvp_status: 'yes',
};

const participantSummaryRow: EventParticipantSummaryRow = {
  ...participantRow,
  athlete_name: 'Ari Runner',
  athlete_squad: 'Senior A',
  athlete_archived_at: null,
};

const timelineRow: TimelineEntryRow = {
  id: ENTRY_ID,
  event_id: EVENT_ID,
  athlete_id: ATHLETE_ID,
  discipline: '100m',
  entry_type: 'attempt',
  value: '11.240',
  unit: 'seconds',
  is_foul: false,
  incident_type: null,
  note_text: null,
  recorded_by: USER_ID,
  version: 2,
  device_id: 'track-tablet-1',
  created_at: INPUT_TIMESTAMP,
  updated_at: INPUT_TIMESTAMP,
  deleted_at: null,
};

const resultRow: ResultRow = {
  event_id: EVENT_ID,
  athlete_id: ATHLETE_ID,
  discipline: '100m',
  outcome: 'valid',
  final_result: '11.240',
  unit: 'seconds',
  placing: 1,
  is_pb: true,
  is_sb: true,
  manual_override: null,
  override_reason: null,
  overridden_by: null,
  override_at: null,
  updated_at: INPUT_TIMESTAMP,
};

const statisticsRow: AthleteStatisticsRow = {
  athlete_id: ATHLETE_ID,
  discipline: '100m',
  unit: 'seconds',
  pb: '11.120',
  sb: 11.24,
  results_count: '12',
  latest_result: '11.240',
  latest_outcome: 'valid',
  updated_at: INPUT_TIMESTAMP,
};

const rosterRow: RosterSnapshotRow = {
  athlete_id: ATHLETE_ID,
  name: 'Ari Runner',
  squad: null,
  discipline: '100m',
  pb: '11.120',
};

const upcomingEventRow: DashboardUpcomingEventRow = {
  event_id: EVENT_ID,
  title: 'City Sprint Meet',
  type: 'competition',
  discipline: '100m',
  date: '2026-09-01',
  time: '09:30:00',
  location_name: 'Central Track',
  status: 'scheduled',
  athlete_count: '18',
};

const metricsRow: DashboardMetricsRow = {
  athletes_count: '30',
  active_athletes_count: 28,
  archived_athletes_count: 2,
  upcoming_event_count: '3',
  season_pbs: 7,
};

const historyRow: AthleteResultHistoryRow = {
  ...resultRow,
  athlete_name: 'Ari Runner',
  athlete_squad: 'Senior A',
  athlete_archived_at: INPUT_TIMESTAMP,
  event_title: 'City Sprint Meet',
  event_type: 'competition',
  event_discipline: '100m',
  event_date: '2026-09-01',
  event_time: '09:30:00',
  event_location_name: 'Central Track',
  event_status: 'completed',
  effective_result: '11.240',
  effective_outcome: 'valid',
  counts_towards_statistics: true,
};

const activeEventRow: DashboardActiveEventRow = {
  event_id: EVENT_ID,
  event_title: 'City Sprint Meet',
  event_type: 'competition',
  event_discipline: '100m',
  event_date: '2026-09-01',
  event_time: '09:30:00',
  event_location_name: 'Central Track',
  event_status: 'in_progress',
  participant_count: '4',
  athletes_with_entries_count: '3',
  resolved_results_count: '2',
  entry_count: '7',
};

const dashboardTimelineRow: DashboardTimelineEntryRow = {
  ...timelineRow,
  athlete_name: 'Ari Runner',
  athlete_squad: 'Senior A',
  athlete_archived_at: null,
};

function changed<Row>(row: Row, values: Record<string, unknown>): Row {
  return { ...row, ...values } as Row;
}

function expectMappingError(map: () => unknown): void {
  expect(map).toThrow(DatabaseMappingError);
}

describe('PostgreSQL row mapping', () => {
  it('maps a snake_case user row and serializes timestamps to UTC ISO', () => {
    expect(mapUserRow(userRow)).toEqual({
      id: USER_ID,
      auth0Id: 'auth0|coach-1',
      name: 'Taylor Coach',
      email: 'taylor@example.com',
      role: 'coach',
      createdAt: ISO_TIMESTAMP,
      updatedAt: ISO_TIMESTAMP,
    });
  });

  it('maps an application user context row', () => {
    expect(mapApplicationUserContextRow(contextRow)).toEqual({
      userId: USER_ID,
      auth0Id: 'auth0|coach-1',
      role: 'assistant',
      workspaceId: USER_ID,
      workspaceRole: 'assistant',
    });
  });

  it('maps an athlete row, preserving nullable values', () => {
    expect(mapAthleteRow(athleteRow)).toEqual({
      id: ATHLETE_ID,
      coachId: USER_ID,
      name: 'Ari Runner',
      dob: '2004-02-29',
      gender: 'open',
      squad: 'Senior A',
      notes: 'Returning from injury',
      archivedAt: null,
      createdAt: ISO_TIMESTAMP,
      updatedAt: ISO_TIMESTAMP,
    });

    expect(
      mapAthleteRow(
        changed(athleteRow, { dob: null, gender: null, squad: null, notes: null }),
      ),
    ).toMatchObject({ dob: null, gender: null, squad: null, notes: null });
  });

  it('serializes a pg-style local DATE without shifting the calendar day', () => {
    const pgDate = new Date(2004, 1, 29);
    expect(mapAthleteRow(changed(athleteRow, { dob: pgDate })).dob).toBe('2004-02-29');
  });

  it('maps an event row, converting NUMERIC coordinates and normalizing TIME', () => {
    expect(mapEventRow(eventRow)).toEqual({
      id: EVENT_ID,
      createdBy: USER_ID,
      type: 'competition',
      discipline: '100m',
      title: 'City Sprint Meet',
      date: '2026-09-01',
      time: '09:30:00',
      locationName: 'Central Track',
      latitude: 53.3498,
      longitude: -6.2603,
      status: 'scheduled',
      createdAt: ISO_TIMESTAMP,
      updatedAt: ISO_TIMESTAMP,
    });

    expect(
      mapEventRow(
        changed(eventRow, {
          discipline: null,
          time: null,
          location_name: null,
          latitude: null,
          longitude: null,
        }),
      ),
    ).toMatchObject({
      discipline: null,
      time: null,
      locationName: null,
      latitude: null,
      longitude: null,
    });
  });

  it('accepts coordinate boundaries and an HH:mm:ss time', () => {
    expect(mapEventRow(changed(eventRow, { latitude: '-90', longitude: '180', time: '23:59:59' })))
      .toMatchObject({ latitude: -90, longitude: 180, time: '23:59:59' });
    expect(mapEventRow(changed(eventRow, { latitude: 90, longitude: -180 }))).toMatchObject({
      latitude: 90,
      longitude: -180,
    });
  });

  it('maps an event participant row', () => {
    expect(mapEventParticipantRow(participantRow)).toEqual({
      eventId: EVENT_ID,
      athleteId: ATHLETE_ID,
      rsvpStatus: 'yes',
    });
  });

  it('maps an event participant with its athlete summary', () => {
    expect(mapEventParticipantSummaryRow(participantSummaryRow)).toEqual({
      eventId: EVENT_ID,
      athleteId: ATHLETE_ID,
      rsvpStatus: 'yes',
      athlete: {
        id: ATHLETE_ID,
        name: 'Ari Runner',
        squad: 'Senior A',
        archivedAt: null,
      },
    });
    expect(
      mapEventParticipantSummaryRow(
        changed(participantSummaryRow, {
          athlete_squad: null,
          athlete_archived_at: INPUT_TIMESTAMP,
        }),
      ),
    ).toMatchObject({ athlete: { squad: null, archivedAt: ISO_TIMESTAMP } });
  });

  it('maps a timeline entry row and converts its NUMERIC value', () => {
    expect(mapTimelineEntryRow(timelineRow)).toEqual({
      id: ENTRY_ID,
      eventId: EVENT_ID,
      athleteId: ATHLETE_ID,
      discipline: '100m',
      entryType: 'attempt',
      value: 11.24,
      unit: 'seconds',
      isFoul: false,
      incidentType: null,
      noteText: null,
      recordedBy: USER_ID,
      version: 2,
      deviceId: 'track-tablet-1',
      createdAt: ISO_TIMESTAMP,
      updatedAt: ISO_TIMESTAMP,
      deletedAt: null,
    });

    expect(
      mapTimelineEntryRow(
        changed(timelineRow, {
          entry_type: 'note',
          value: null,
          unit: null,
          note_text: 'Wind reading unavailable',
          device_id: null,
          deleted_at: INPUT_TIMESTAMP,
        }),
      ),
    ).toMatchObject({
      entryType: 'note',
      value: null,
      unit: null,
      noteText: 'Wind reading unavailable',
      deviceId: null,
      deletedAt: ISO_TIMESTAMP,
    });
  });

  it('maps valid and no-result result rows', () => {
    expect(mapResultRow(resultRow)).toEqual({
      eventId: EVENT_ID,
      athleteId: ATHLETE_ID,
      discipline: '100m',
      outcome: 'valid',
      finalResult: 11.24,
      unit: 'seconds',
      placing: 1,
      isPb: true,
      isSb: true,
      manualOverride: null,
      overrideReason: null,
      overriddenBy: null,
      overrideAt: null,
      updatedAt: ISO_TIMESTAMP,
    });

    expect(
      mapResultRow(
        changed(resultRow, {
          outcome: 'no_result',
          final_result: null,
          unit: null,
          placing: null,
          is_pb: false,
          is_sb: false,
        }),
      ),
    ).toMatchObject({ outcome: 'no_result', finalResult: null, unit: null, placing: null });
  });

  it('maps a complete manual override audit relationship', () => {
    expect(
      mapResultRow(
        changed(resultRow, {
          manual_override: '11.10',
          override_reason: 'Photo finish correction',
          overridden_by: OVERRIDER_ID,
          override_at: INPUT_TIMESTAMP,
        }),
      ),
    ).toMatchObject({
      manualOverride: 11.1,
      overrideReason: 'Photo finish correction',
      overriddenBy: OVERRIDER_ID,
      overrideAt: ISO_TIMESTAMP,
    });
  });

  it('maps athlete statistics and COUNT/bigint values', () => {
    expect(mapAthleteStatisticsRow(statisticsRow)).toEqual({
      athleteId: ATHLETE_ID,
      discipline: '100m',
      unit: 'seconds',
      pb: 11.12,
      sb: 11.24,
      resultsCount: 12,
      latestResult: 11.24,
      latestOutcome: 'valid',
      updatedAt: ISO_TIMESTAMP,
    });
  });

  it('maps athlete history with raw and effective result data', () => {
    expect(mapAthleteResultHistoryRow(historyRow)).toMatchObject({
      athlete: {
        id: ATHLETE_ID,
        name: 'Ari Runner',
        squad: 'Senior A',
        archivedAt: ISO_TIMESTAMP,
      },
      event: {
        id: EVENT_ID,
        type: 'competition',
        status: 'completed',
      },
      result: { finalResult: 11.24, outcome: 'valid' },
      effectiveResult: 11.24,
      effectiveOutcome: 'valid',
      countsTowardsStatistics: true,
    });
  });

  it('maps a roster snapshot row with a nullable PB', () => {
    expect(mapRosterSnapshotRow(changed(rosterRow, { pb: null }))).toEqual({
      athleteId: ATHLETE_ID,
      name: 'Ari Runner',
      squad: null,
      discipline: '100m',
      pb: null,
    });
  });

  it('maps a dashboard upcoming event row', () => {
    expect(mapDashboardUpcomingEventRow(upcomingEventRow)).toEqual({
      eventId: EVENT_ID,
      title: 'City Sprint Meet',
      type: 'competition',
      discipline: '100m',
      date: '2026-09-01',
      time: '09:30:00',
      locationName: 'Central Track',
      status: 'scheduled',
      athleteCount: 18,
    });
  });

  it('maps all four dashboard metrics', () => {
    expect(mapDashboardMetricsRow(metricsRow)).toEqual({
      athletesCount: 30,
      activeAthletesCount: 28,
      archivedAthletesCount: 2,
      upcomingEventCount: 3,
      seasonPbs: 7,
    });
  });

  it('maps live dashboard progress and latest-entry identity', () => {
    expect(mapDashboardActiveEventRow(activeEventRow)).toMatchObject({
      event: { id: EVENT_ID, status: 'in_progress' },
      progress: {
        participantCount: 4,
        athletesWithEntriesCount: 3,
        resolvedResultsCount: 2,
        entryCount: 7,
        completionPercent: 50,
      },
    });
    expect(mapDashboardTimelineEntryRow(dashboardTimelineRow)).toMatchObject({
      entry: { id: ENTRY_ID },
      athlete: { id: ATHLETE_ID, name: 'Ari Runner', archivedAt: null },
    });
  });
});

describe('persisted value validation', () => {
  it('rejects malformed, nonfinite, and nonpositive race numerics', () => {
    for (const latitude of ['', '1e2', 'NaN', Number.NaN, Number.POSITIVE_INFINITY]) {
      expectMappingError(() => mapEventRow(changed(eventRow, { latitude })));
    }
    for (const value of ['Infinity', 'not-a-number', 0, '-1']) {
      expectMappingError(() => mapTimelineEntryRow(changed(timelineRow, { value })));
    }
    for (const final_result of [0, '-0.1', Number.NEGATIVE_INFINITY]) {
      expectMappingError(() => mapResultRow(changed(resultRow, { final_result })));
    }
  });

  it('rejects coordinates outside PostgreSQL latitude/longitude ranges', () => {
    expectMappingError(() => mapEventRow(changed(eventRow, { latitude: '90.000001' })));
    expectMappingError(() => mapEventRow(changed(eventRow, { longitude: -180.000001 })));
  });

  it('rejects negative, fractional, and unsafe COUNT/bigint values', () => {
    for (const athlete_count of ['-1', '1.5', '9007199254740992', Number.MAX_SAFE_INTEGER + 1]) {
      expectMappingError(() =>
        mapDashboardUpcomingEventRow(changed(upcomingEventRow, { athlete_count })),
      );
    }
  });

  it('rejects invalid INT versions and placings', () => {
    for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2']) {
      expectMappingError(() => mapTimelineEntryRow(changed(timelineRow, { version })));
    }
    for (const placing of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expectMappingError(() => mapResultRow(changed(resultRow, { placing })));
    }
  });

  it('rejects invalid DATE, TIME, and TIMESTAMPTZ values', () => {
    expectMappingError(() => mapEventRow(changed(eventRow, { date: '2026-02-29' })));
    expectMappingError(() => mapEventRow(changed(eventRow, { time: '24:00' })));
    expectMappingError(() => mapEventRow(changed(eventRow, { time: '09:30:00.100' })));
    expectMappingError(() =>
      mapUserRow(changed(userRow, { created_at: '2026-08-14T10:20:30' })),
    );
    expectMappingError(() =>
      mapUserRow(changed(userRow, { created_at: '2026-02-30T10:20:30Z' })),
    );
    expectMappingError(() => mapUserRow(changed(userRow, { created_at: new Date('invalid') })));
  });

  it('rejects malformed UUIDs and empty persisted strings', () => {
    expectMappingError(() => mapUserRow(changed(userRow, { id: 'not-a-uuid' })));
    expectMappingError(() => mapUserRow(changed(userRow, { auth0_id: '  ' })));
    expectMappingError(() => mapAthleteRow(changed(athleteRow, { squad: '' })));
  });

  it('rejects invalid roles, enums, and fixed contract constants', () => {
    expectMappingError(() => mapUserRow(changed(userRow, { role: 'admin' })));
    expectMappingError(() => mapEventRow(changed(eventRow, { type: 'race' })));
    expectMappingError(() => mapEventRow(changed(eventRow, { status: 'postponed' })));
    expectMappingError(() => mapEventRow(changed(eventRow, { discipline: '200m' })));
    expectMappingError(() =>
      mapEventParticipantRow(changed(participantRow, { rsvp_status: 'maybe' })),
    );
    expectMappingError(() =>
      mapTimelineEntryRow(changed(timelineRow, { entry_type: 'measurement' })),
    );
    expectMappingError(() =>
      mapTimelineEntryRow(changed(timelineRow, { incident_type: 'injury' })),
    );
    expectMappingError(() => mapTimelineEntryRow(changed(timelineRow, { unit: 'metres' })));
    expectMappingError(() => mapResultRow(changed(resultRow, { outcome: 'pending' })));
    expectMappingError(() =>
      mapAthleteStatisticsRow(changed(statisticsRow, { discipline: '200m' })),
    );
  });

  it('rejects non-boolean persisted flags', () => {
    expectMappingError(() => mapTimelineEntryRow(changed(timelineRow, { is_foul: 0 })));
    expectMappingError(() => mapResultRow(changed(resultRow, { is_pb: 'true' })));
  });
});

describe('relationship consistency', () => {
  it('requires timeline values and units to be null or present together', () => {
    expectMappingError(() => mapTimelineEntryRow(changed(timelineRow, { unit: null })));
    expectMappingError(() =>
      mapTimelineEntryRow(changed(timelineRow, { value: null, unit: 'seconds' })),
    );
  });

  it('enforces 100m note and foul invariants', () => {
    expectMappingError(() => mapTimelineEntryRow(changed(timelineRow, { is_foul: true })));
    expectMappingError(() =>
      mapTimelineEntryRow(
        changed(timelineRow, { entry_type: 'note', value: null, unit: null, note_text: null }),
      ),
    );
    expectMappingError(() => mapTimelineEntryRow(changed(timelineRow, { note_text: 'Not a note' })));
  });

  it('requires result outcome, value, and unit to agree', () => {
    expectMappingError(() =>
      mapResultRow(changed(resultRow, { outcome: 'valid', final_result: null, unit: null })),
    );
    expectMappingError(() =>
      mapResultRow(
        changed(resultRow, {
          outcome: 'dq',
          final_result: '11.24',
          unit: 'seconds',
          placing: null,
          is_pb: false,
          is_sb: false,
        }),
      ),
    );
    expectMappingError(() => mapResultRow(changed(resultRow, { unit: null })));
    expectMappingError(() =>
      mapResultRow(
        changed(resultRow, {
          outcome: 'dns',
          final_result: null,
          unit: null,
          placing: 1,
          is_pb: false,
          is_sb: false,
        }),
      ),
    );
  });

  it('requires all manual override audit fields together', () => {
    expectMappingError(() =>
      mapResultRow(changed(resultRow, { manual_override: '11.10' })),
    );
    expectMappingError(() =>
      mapResultRow(
        changed(resultRow, {
          override_reason: 'Correction',
          overridden_by: OVERRIDER_ID,
          override_at: INPUT_TIMESTAMP,
        }),
      ),
    );
  });

  it('keeps complete override audit alongside a derived no-result outcome', () => {
    expect(mapResultRow(changed(resultRow, {
      outcome: 'no_result',
      final_result: null,
      unit: null,
      placing: 1,
      is_pb: true,
      is_sb: true,
      manual_override: '11.10',
      override_reason: 'Correction',
      overridden_by: OVERRIDER_ID,
      override_at: INPUT_TIMESTAMP,
    }))).toMatchObject({
      outcome: 'no_result',
      finalResult: null,
      manualOverride: 11.1,
      placing: 1,
      isPb: true,
      isSb: true,
    });
  });

  it('requires athlete-statistics latest outcome and value to agree', () => {
    expectMappingError(() =>
      mapAthleteStatisticsRow(changed(statisticsRow, { latest_result: null })),
    );
    expectMappingError(() =>
      mapAthleteStatisticsRow(
        changed(statisticsRow, { latest_outcome: 'dnf', latest_result: '11.24' }),
      ),
    );
  });
});
