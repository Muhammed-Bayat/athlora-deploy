import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { DbExecutor } from '../db/client.js';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import type { EventStatus, EventType, ResultOutcome } from '../types/domain.js';
import { getDashboardSummary } from './dashboard.js';
import { getAthleteStatisticsDetail } from './statistics.js';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDB = connectionString ? describe : describe.skip;
const TABLES = [
  'results',
  'timeline_entries',
  'event_participants',
  'events',
  'athletes',
  'users',
  'schema_migrations',
];

describeDB('aggregate APIs against a real database', () => {
  let pool: pg.Pool;
  let migrations: Awaited<ReturnType<typeof loadMigrations>>;

  const runReadTransaction = async <T>(
    operation: (client: DbExecutor) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  beforeEach(async () => {
    pool = new pg.Pool({ connectionString });
    migrations = await loadMigrations();
    const client = await pool.connect();
    try {
      await applyMigrations(client, migrations);
    } finally {
      client.release();
    }
  });

  afterEach(async () => {
    const client = await pool.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS ${TABLES.join(', ')} CASCADE`);
    } finally {
      client.release();
    }
    await pool.end();
  });

  async function seedCoach(suffix: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (auth0_id, name, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`auth0|aggregate-${suffix}`, `Coach ${suffix}`, `aggregate-${suffix}@example.com`],
    );
    return rows[0].id;
  }

  async function seedAthlete(
    coachId: string,
    name: string,
    archived = false,
  ): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO athletes (coach_id, name, squad, archived_at)
       VALUES ($1, $2, 'Sprint', ${archived ? 'now()' : 'NULL'})
       RETURNING id`,
      [coachId, name],
    );
    return rows[0].id;
  }

  async function seedEvent(
    coachId: string,
    title: string,
    date: string,
    type: EventType,
    status: EventStatus,
    time: string | null = null,
  ): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO events
         (created_by, type, discipline, title, date, time, location_name, status)
       VALUES ($1, $2, '100m', $3, $4, $5, 'Central Track', $6)
       RETURNING id`,
      [coachId, type, title, date, time, status],
    );
    return rows[0].id;
  }

  async function seedResult(options: {
    coachId: string;
    eventId: string;
    athleteId: string;
    outcome: ResultOutcome;
    finalResult?: number;
    manualOverride?: number;
    isPb?: boolean;
    isSb?: boolean;
  }): Promise<void> {
    const {
      coachId,
      eventId,
      athleteId,
      outcome,
      finalResult,
      manualOverride,
      isPb = false,
      isSb = false,
    } = options;
    await pool.query(
      `INSERT INTO results
         (event_id, athlete_id, discipline, outcome, final_result, unit,
          "placing", is_pb, is_sb, manual_override, override_reason, overridden_by, override_at)
       VALUES
         ($1, $2, '100m', $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11)`,
      [
        eventId,
        athleteId,
        outcome,
        finalResult ?? null,
        finalResult === undefined ? null : 'seconds',
        isPb,
        isSb,
        manualOverride ?? null,
        manualOverride === undefined ? null : 'Official timing correction',
        manualOverride === undefined ? null : coachId,
        manualOverride === undefined ? null : new Date('2026-08-17T12:00:00.000Z'),
      ],
    );
  }

  it('derives year-scoped statistics from effective results while retaining history', async () => {
    const coachId = await seedCoach('statistics');
    const otherCoachId = await seedCoach('statistics-other');
    const athleteId = await seedAthlete(coachId, 'Archived Runner', true);
    const previousYear = await seedEvent(
      coachId,
      'Previous Year Meet',
      '2025-12-31',
      'competition',
      'completed',
    );
    const currentTraining = await seedEvent(
      coachId,
      'New Year Training',
      '2026-01-01',
      'training',
      'completed',
    );
    const disqualified = await seedEvent(
      coachId,
      'August Meet',
      '2026-08-01',
      'competition',
      'completed',
    );
    const cancelled = await seedEvent(
      coachId,
      'Cancelled Meet',
      '2026-08-02',
      'competition',
      'cancelled',
    );

    await seedResult({
      coachId,
      eventId: previousYear,
      athleteId,
      outcome: 'valid',
      finalResult: 11,
    });
    await seedResult({
      coachId,
      eventId: currentTraining,
      athleteId,
      outcome: 'no_result',
      manualOverride: 10.8,
      isPb: true,
      isSb: true,
    });
    await seedResult({
      coachId,
      eventId: disqualified,
      athleteId,
      outcome: 'dq',
      manualOverride: 10,
    });
    await seedResult({
      coachId,
      eventId: cancelled,
      athleteId,
      outcome: 'valid',
      finalResult: 9,
    });

    const statistics = await getAthleteStatisticsDetail(
      coachId,
      athleteId,
      '2026-08-17',
      runReadTransaction,
    );

    expect(statistics).toMatchObject({
      athlete: { id: athleteId, archivedAt: expect.any(String) },
      pb: 10.8,
      sb: 10.8,
      resultsCount: 1,
      latestResult: null,
      latestOutcome: 'dq',
      resultCounts: {
        allTime: 2,
        currentYear: 1,
        competitionAllTime: 1,
        trainingAllTime: 1,
      },
      latest: {
        event: { id: disqualified },
        effectiveResult: null,
        effectiveOutcome: 'dq',
      },
    });
    expect(statistics.recentResults.competitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: expect.objectContaining({ id: cancelled, status: 'cancelled' }),
          countsTowardsStatistics: false,
        }),
      ]),
    );
    expect(statistics.recentResults.training[0]).toMatchObject({
      result: { outcome: 'no_result', finalResult: null, manualOverride: 10.8 },
      effectiveResult: 10.8,
      effectiveOutcome: 'valid',
    });

    await expect(
      getAthleteStatisticsDetail(
        otherCoachId,
        athleteId,
        '2026-08-17',
        runReadTransaction,
      ),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('builds both dashboard modes with deterministic ownership-scoped summaries', async () => {
    const coachId = await seedCoach('dashboard');
    const otherCoachId = await seedCoach('dashboard-other');
    const activeAthleteId = await seedAthlete(coachId, 'Active Runner');
    const archivedAthleteId = await seedAthlete(coachId, 'Archived Runner', true);
    const unassignedAthleteId = await seedAthlete(coachId, 'Removed Runner', true);
    const foreignAthleteId = await seedAthlete(otherCoachId, 'Foreign Runner');

    const selectedActive = await seedEvent(
      coachId,
      'Early Live Meet',
      '2026-08-17',
      'competition',
      'in_progress',
      '08:00:00',
    );
    await seedEvent(
      coachId,
      'Later Live Meet',
      '2026-08-17',
      'training',
      'in_progress',
      '10:00:00',
    );
    const upcoming = await seedEvent(
      coachId,
      'Upcoming Meet',
      '2026-08-18',
      'competition',
      'scheduled',
    );
    const completed = await seedEvent(
      coachId,
      'Recent Completed Meet',
      '2026-08-16',
      'competition',
      'completed',
    );
    const cancelled = await seedEvent(
      coachId,
      'Cancelled Future Meet',
      '2026-08-19',
      'competition',
      'cancelled',
    );
    const foreignEvent = await seedEvent(
      otherCoachId,
      'Foreign Upcoming Meet',
      '2026-08-18',
      'competition',
      'scheduled',
    );
    await pool.query(
      `INSERT INTO events (created_by, type, discipline, title, date, status)
       VALUES
         ($1, 'competition', NULL, 'Legacy Live Event', '2026-01-01', 'in_progress'),
         ($1, 'competition', NULL, 'Legacy Scheduled Event', '2026-08-18', 'scheduled')`,
      [coachId],
    );

    await pool.query(
      `INSERT INTO event_participants (event_id, athlete_id)
       VALUES ($1, $2), ($1, $3), ($4, $2), ($5, $6)`,
      [selectedActive, activeAthleteId, archivedAthleteId, upcoming, foreignEvent, foreignAthleteId],
    );
    await pool.query(
      `INSERT INTO timeline_entries
         (event_id, athlete_id, discipline, entry_type, value, unit, recorded_by, deleted_at)
       VALUES
         ($1, $2, '100m', 'attempt', 11.2, 'seconds', $4, NULL),
         ($1, $3, '100m', 'attempt', 12.1, 'seconds', $4, now()),
         ($1, $5, '100m', 'attempt', 11.8, 'seconds', $4, NULL),
         ($1, $2, 'long_jump', 'attempt', 6.2, 'metres', $4, NULL)`,
      [selectedActive, activeAthleteId, archivedAthleteId, coachId, unassignedAthleteId],
    );
    await seedResult({
      coachId,
      eventId: selectedActive,
      athleteId: activeAthleteId,
      outcome: 'valid',
      finalResult: 11.2,
    });
    await seedResult({
      coachId,
      eventId: selectedActive,
      athleteId: archivedAthleteId,
      outcome: 'dns',
    });
    await seedResult({
      coachId,
      eventId: selectedActive,
      athleteId: unassignedAthleteId,
      outcome: 'valid',
      finalResult: 11.8,
    });
    await seedResult({
      coachId,
      eventId: completed,
      athleteId: archivedAthleteId,
      outcome: 'valid',
      finalResult: 10.9,
      isPb: true,
      isSb: true,
    });
    await seedResult({
      coachId,
      eventId: cancelled,
      athleteId: activeAthleteId,
      outcome: 'valid',
      finalResult: 9.5,
      isPb: true,
      isSb: true,
    });
    await seedResult({
      coachId: otherCoachId,
      eventId: foreignEvent,
      athleteId: foreignAthleteId,
      outcome: 'valid',
      finalResult: 9.4,
      isPb: true,
      isSb: true,
    });

    const dashboard = await getDashboardSummary(
      coachId,
      '2026-08-17',
      runReadTransaction,
    );

    expect(dashboard).toMatchObject({
      state: 'live',
      athletesCount: 3,
      activeAthletesCount: 1,
      archivedAthletesCount: 2,
      upcomingEventCount: 1,
      seasonPbs: 1,
      activeEvent: {
        event: { id: selectedActive, title: 'Early Live Meet' },
        progress: {
          participantCount: 2,
          athletesWithEntriesCount: 1,
          resolvedResultsCount: 2,
          entryCount: 1,
          completionPercent: 100,
        },
      },
      upcomingEvents: [expect.objectContaining({ eventId: upcoming, athleteCount: 1 })],
      rosterSnapshot: [expect.objectContaining({ athleteId: activeAthleteId, pb: 11.2 })],
      recentPbs: [
        expect.objectContaining({
          athlete: expect.objectContaining({ id: archivedAthleteId, archivedAt: expect.any(String) }),
          event: expect.objectContaining({ id: completed }),
        }),
      ],
    });
    expect(dashboard.activeEvent?.latestEntries).toHaveLength(2);
    expect(dashboard.activeEvent?.latestEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          athlete: expect.objectContaining({ id: activeAthleteId }),
        }),
        expect.objectContaining({
          athlete: expect.objectContaining({ id: unassignedAthleteId }),
        }),
      ]),
    );
    expect(dashboard.recentResults.some((entry) => entry.event.id === cancelled)).toBe(false);
    expect(dashboard.recentResults.some((entry) => entry.event.id === foreignEvent)).toBe(false);

    await pool.query(
      `UPDATE events SET status = 'completed'
       WHERE created_by = $1 AND status = 'in_progress'`,
      [coachId],
    );
    const summaryDashboard = await getDashboardSummary(
      coachId,
      '2026-08-17',
      runReadTransaction,
    );
    expect(summaryDashboard).toMatchObject({ state: 'summary', activeEvent: null });
  });
});
