import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApplicationUserContext } from '../middleware/auth.js';
import { countUnreadEventReminders, listEventReminders, markEventReminderRead } from '../services/reminders.js';
import { list, markRead, unreadCount } from './reminders.js';

vi.mock('../middleware/auth.js', () => ({ getApplicationUserContext: vi.fn() }));
vi.mock('../services/reminders.js', () => ({
  countUnreadEventReminders: vi.fn(),
  listEventReminders: vi.fn(),
  markEventReminderRead: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getApplicationUserContext).mockReturnValue({ userId: USER_ID, workspaceId: WORKSPACE_ID } as never);
});

describe('reminder controllers', () => {
  it('lists reminders with their count and returns unread count', async () => {
    vi.mocked(listEventReminders).mockResolvedValue([{ id: 'reminder-1' }] as never);
    vi.mocked(countUnreadEventReminders).mockResolvedValue(3);
    const json = vi.fn();
    const next = vi.fn();

    await list({} as Request, { json } as unknown as Response, next);
    await unreadCount({} as Request, { json } as unknown as Response, next);

    expect(listEventReminders).toHaveBeenCalledWith(USER_ID, WORKSPACE_ID);
    expect(countUnreadEventReminders).toHaveBeenCalledWith(USER_ID, WORKSPACE_ID);
    expect(json).toHaveBeenNthCalledWith(1, { data: [{ id: 'reminder-1' }], meta: { count: 1 } });
    expect(json).toHaveBeenNthCalledWith(2, { data: { count: 3 } });
    expect(next).not.toHaveBeenCalled();
  });

  it('marks a reminder read and forwards service errors', async () => {
    const end = vi.fn();
    const status = vi.fn().mockReturnValue({ end });
    const next = vi.fn();

    await markRead({ params: { reminderId: 'reminder-1' } } as unknown as Request, { status } as unknown as Response, next);
    expect(markEventReminderRead).toHaveBeenCalledWith(USER_ID, WORKSPACE_ID, 'reminder-1');
    expect(status).toHaveBeenCalledWith(204);
    expect(end).toHaveBeenCalledOnce();

    const error = new Error('unavailable');
    vi.mocked(listEventReminders).mockRejectedValueOnce(error);
    await list({} as Request, { json: vi.fn() } as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
