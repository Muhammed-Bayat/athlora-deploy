import { expect, test } from '@playwright/test';
import pg from 'pg';

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL is required for migration tests');
  }
  return value;
}

test.describe('migration verification', () => {
  let pool: pg.Pool;

  test.beforeAll(() => {
    pool = new pg.Pool({ connectionString: databaseUrl() });
  });

  test.afterAll(async () => {
    await pool.end();
  });

  test('all 20 migrations are tracked in schema_migrations', async () => {
    const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions = result.rows.map((r) => r.version);
    expect(versions.length).toBeGreaterThanOrEqual(20);
  });

  test('core tables exist', async () => {
    const expectedTables = [
      'users',
      'workspaces',
      'workspace_members',
      'athletes',
      'events',
      'event_participants',
      'timeline_entries',
      'results',
      'squads',
      'athlete_squads',
      'athlete_status_transitions',
      'fixture_invitations',
      'fixture_invitation_responses',
      'event_fixture_workspaces',
      'event_participant_status_reviews',
      'event_participant_rsvp_audit',
      'account_deletions',
      'event_reminders',
      'event_reminder_mutes',
      'event_helper_invitations',
      'event_helper_grants',
      'event_helper_audit_logs',
      'public_logger_links',
      'public_logger_sessions',
      'fixture_notifications',
      'athlete_injuries',
      'sync_action_receipts',
      'clubs',
      'club_join_requests',
      'workspace_invitations',
      'workspace_membership_audit',
    ];

    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tables = result.rows.map((r) => r.table_name);

    for (const expected of expectedTables) {
      expect(tables, `Table ${expected} should exist`).toContain(expected);
    }
  });

  test('athlete lifecycle status column exists', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'athletes' AND column_name = 'status'
    `);
    expect(result.rows.length).toBe(1);
  });

  test('results override columns exist', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'results' AND column_name IN ('manual_override', 'override_reason', 'overridden_by', 'override_at')
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
  });

  test('workspace role column exists on workspace_members', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'workspace_members' AND column_name = 'role'
    `);
    expect(result.rows.length).toBe(1);
  });

  test('injury table has correct columns', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'athlete_injuries' AND column_name IN ('body_region', 'severity', 'resolved_date', 'deleted_at')
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
  });

  test('public_logger_links table has token_hash column', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'public_logger_links' AND column_name = 'token_hash'
    `);
    expect(result.rows.length).toBe(1);
  });

  test('fixture_notifications table has kind column', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'fixture_notifications' AND column_name = 'kind'
    `);
    expect(result.rows.length).toBe(1);
  });

  test('clubs table exists with workspace_id', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clubs' AND column_name = 'workspace_id'
    `);
    expect(result.rows.length).toBe(1);
  });

  test('account_deletions table exists for tombstone pattern', async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'account_deletions' AND column_name = 'auth0_id'
    `);
    expect(result.rows.length).toBe(1);
  });
});
