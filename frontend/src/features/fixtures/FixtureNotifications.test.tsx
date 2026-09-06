import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureNotifications } from './FixtureNotifications';

const fixtureApi = vi.hoisted(() => ({
  getUnreadFixtureNotificationCount: vi.fn(),
  listFixtureNotifications: vi.fn(),
  markFixtureNotificationRead: vi.fn(),
}));

vi.mock('../../api/fixtures', () => fixtureApi);

describe('FixtureNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(1);
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [{ id: 'notification-1', eventId: 'event-1', invitationId: 'invitation-1', kind: 'fixture_invited', payload: {}, readAt: null, createdAt: '2026-09-06T08:00:00.000Z' }],
      meta: { count: 1 },
    });
    fixtureApi.markFixtureNotificationRead.mockResolvedValue(undefined);
  });

  it('shows a themed unread notification and marks it read', async () => {
    const onCountsChange = vi.fn();
    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={onCountsChange} />);

    const trigger = await screen.findByLabelText('Fixture notifications, 1 unread');
    await user.click(trigger);
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Mark notification as read: You have a new fixture invitation/i }));

    await waitFor(() => expect(fixtureApi.markFixtureNotificationRead).toHaveBeenCalledWith('notification-1'));
    expect(trigger).toHaveAttribute('aria-label', 'Fixture notifications, 0 unread');
    expect(onCountsChange).toHaveBeenLastCalledWith({ events: 0, fixtures: 0 });
  });

  it('closes when a pointer lands outside the menu', async () => {
    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    const trigger = await screen.findByLabelText('Fixture notifications, 1 unread');
    const menu = trigger.closest('details');
    await user.click(trigger);
    expect(menu).toHaveAttribute('open');
    await user.click(document.body);
    expect(menu).not.toHaveAttribute('open');
  });
});
