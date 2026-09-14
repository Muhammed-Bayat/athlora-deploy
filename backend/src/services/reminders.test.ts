import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

import { getPool } from '../db/client.js';
import {
  countUnreadEventReminders,
  listEventReminders,
  markEventReminderRead,
  reconcileEventReminders,
} from './reminders.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const REMINDER_ID = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

describe('event reminders', () => {
  it('lists unread reminders scoped to the active user and workspace', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: REMINDER_ID, event_id: EVENT_ID, event_version: 1, threshold: 'seven_days',
      scheduled_for: new Date('2026-09-01T00:00:00.000Z'), read_at: null,
      created_at: new Date('2026-08-25T00:00:00.000Z'),
    }] });

    await expect(listEventReminders(USER_ID, WORKSPACE_ID)).resolves.toEqual([expect.objectContaining({
      id: REMINDER_ID, eventId: EVENT_ID, threshold: 'seven_days', readAt: null,
    })]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id = $1 AND workspace_id = $2'), [USER_ID, WORKSPACE_ID]);
  });

  it('excludes invalidated reminders from the list', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await listEventReminders(USER_ID, WORKSPACE_ID);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('invalidated_at IS NULL');
  });

  it('excludes already-read reminders from the list', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await listEventReminders(USER_ID, WORKSPACE_ID);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('read_at IS NULL');
  });

  it('counts unread reminders in the active scope', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: '2' }] });

    await expect(countUnreadEventReminders(USER_ID, WORKSPACE_ID)).resolves.toBe(2);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('read_at IS NULL'), [USER_ID, WORKSPACE_ID]);
  });

  it('uses a scoped, idempotent update when marking a reminder read', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: REMINDER_ID }] });

    await expect(markEventReminderRead(USER_ID, WORKSPACE_ID, REMINDER_ID)).resolves.toBeUndefined();
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('COALESCE(read_at, now())');
    expect(sql).toContain('user_id = $2 AND workspace_id = $3');
    expect(parameters).toEqual([REMINDER_ID, USER_ID, WORKSPACE_ID]);
  });

  it('returns not found for a reminder outside the active scope', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(markEventReminderRead(USER_ID, WORKSPACE_ID, REMINDER_ID))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not mark an invalidated reminder as read', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(markEventReminderRead(USER_ID, WORKSPACE_ID, REMINDER_ID))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('invalidated_at IS NULL');
  });

  it('returns 0 for invalid user/workspace IDs', async () => {
    await expect(countUnreadEventReminders('invalid', WORKSPACE_ID))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(countUnreadEventReminders(USER_ID, 'invalid'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  describe('reconcileEventReminders', () => {
    it('inserts due seven-day and one-day reminders', async () => {
      query.mockResolvedValueOnce({ rowCount: 2, rows: [] });

      const count = await reconcileEventReminders(new Date('2026-08-24T00:00:00.000Z'));
      expect(count).toBe(2);
      const [sql] = query.mock.calls[0] as [string];
      expect(sql).toContain("'seven_days'");
      expect(sql).toContain("'one_day'");
    });

    it('is idempotent via ON CONFLICT DO NOTHING', async () => {
      query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const count = await reconcileEventReminders(new Date('2026-08-24T00:00:00.000Z'));
      expect(count).toBe(0);
      const [sql] = query.mock.calls[0] as [string];
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO NOTHING');
    });

    it('skips events without a start time', async () => {
      query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await reconcileEventReminders();
      const [sql] = query.mock.calls[0] as [string];
      expect(sql).toContain('e.time IS NOT NULL');
    });

    it('skips muted events', async () => {
      query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await reconcileEventReminders();
      const [sql] = query.mock.calls[0] as [string];
      expect(sql).toContain('event_reminder_mutes');
      expect(sql).toContain('mute.user_id IS NULL');
    });

    it('targets only coaches and assistants', async () => {
      query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      await reconcileEventReminders();
      const [sql] = query.mock.calls[0] as [string];
      expect(sql).toContain("wm.role IN ('coach', 'assistant')");
    });
  });
});
