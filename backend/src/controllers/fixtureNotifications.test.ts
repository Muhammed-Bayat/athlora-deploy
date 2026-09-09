import { beforeEach, describe, expect, it, vi } from 'vitest';
const services = vi.hoisted(() => ({ countUnreadFixtureNotifications: vi.fn(), listFixtureNotifications: vi.fn(), markFixtureNotificationRead: vi.fn() }));
const auth = vi.hoisted(() => ({ getApplicationUserContext: vi.fn(() => ({ userId: 'user-1', workspaceId: 'workspace-1' })) }));
vi.mock('../services/fixtureNotifications.js', () => services);
vi.mock('../middleware/auth.js', () => auth);
import * as notifications from './fixtureNotifications.js';
function response() { const value = { status: vi.fn(), json: vi.fn(), end: vi.fn() }; value.status.mockReturnValue(value); return value; }
describe('fixture notification controllers', () => {
  beforeEach(() => { vi.clearAllMocks(); services.listFixtureNotifications.mockResolvedValue([{ id: 'notice-1' }]); services.countUnreadFixtureNotifications.mockResolvedValue(2); services.markFixtureNotificationRead.mockResolvedValue(undefined); });
  it('lists, counts, and marks notifications read', async () => { for (const handler of [notifications.list, notifications.unreadCount, notifications.markRead]) { const res = response(); const next = vi.fn(); await handler({ params: { notificationId: 'notice-1' } } as never, res as never, next); expect(next).not.toHaveBeenCalled(); } expect(services.markFixtureNotificationRead).toHaveBeenCalledWith('user-1', 'workspace-1', 'notice-1'); });
});
