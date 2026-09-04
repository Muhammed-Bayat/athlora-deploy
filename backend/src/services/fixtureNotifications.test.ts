import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

import { getPool } from '../db/client.js';
import { countUnreadFixtureNotifications, listFixtureNotifications, markFixtureNotificationRead } from './fixtureNotifications.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const NOTIFICATION_ID = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

describe('fixture notifications', () => {
  it('lists only notifications scoped to the active user and workspace', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: NOTIFICATION_ID, event_id: EVENT_ID, invitation_id: null, kind: 'fixture_started',
      payload: { revision: 2 }, read_at: null, created_at: new Date('2026-09-01T00:00:00.000Z'),
    }] });

    await expect(listFixtureNotifications(USER_ID, WORKSPACE_ID)).resolves.toEqual([expect.objectContaining({
      id: NOTIFICATION_ID, eventId: EVENT_ID, kind: 'fixture_started', readAt: null,
    })]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('recipient_user_id = $1 AND workspace_id = $2'), [USER_ID, WORKSPACE_ID]);
  });

  it('counts unread notifications in the active scope', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: '3' }] });

    await expect(countUnreadFixtureNotifications(USER_ID, WORKSPACE_ID)).resolves.toBe(3);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('read_at IS NULL'), [USER_ID, WORKSPACE_ID]);
  });

  it('uses a scoped, idempotent update when marking a notification read', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: NOTIFICATION_ID }] });

    await expect(markFixtureNotificationRead(USER_ID, WORKSPACE_ID, NOTIFICATION_ID)).resolves.toBeUndefined();
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('COALESCE(read_at, now())');
    expect(sql).toContain('recipient_user_id = $2 AND workspace_id = $3');
    expect(parameters).toEqual([NOTIFICATION_ID, USER_ID, WORKSPACE_ID]);
  });

  it('returns not found for a notification outside the active scope', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(markFixtureNotificationRead(USER_ID, WORKSPACE_ID, NOTIFICATION_ID))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
