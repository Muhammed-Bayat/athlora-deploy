import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureNotifications } from './FixtureNotifications';

const fixtureApi = vi.hoisted(() => ({
  deleteFixtureNotification: vi.fn(),
  getUnreadFixtureNotificationCount: vi.fn(),
  listFixtureNotifications: vi.fn(),
  markFixtureNotificationRead: vi.fn(),
  starFixtureNotification: vi.fn(),
  unstarFixtureNotification: vi.fn(),
}));

const reminderApi = vi.hoisted(() => ({
  getUnreadEventReminderCount: vi.fn(),
  listEventReminders: vi.fn(),
  markEventReminderRead: vi.fn(),
}));

vi.mock('../../api/fixtures', () => fixtureApi);
vi.mock('../../api/reminders', () => reminderApi);

describe('FixtureNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(1);
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [{ id: 'notification-1', eventId: 'event-1', invitationId: 'invitation-1', kind: 'fixture_invited', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' }],
      meta: { count: 1 },
    });
    fixtureApi.markFixtureNotificationRead.mockResolvedValue(undefined);
    fixtureApi.deleteFixtureNotification.mockResolvedValue(undefined);
    fixtureApi.starFixtureNotification.mockResolvedValue(undefined);
    fixtureApi.unstarFixtureNotification.mockResolvedValue(undefined);
    reminderApi.getUnreadEventReminderCount.mockResolvedValue(0);
    reminderApi.listEventReminders.mockResolvedValue({ data: [], meta: { count: 0 } });
    reminderApi.markEventReminderRead.mockResolvedValue(undefined);
  });

  it('shows a themed unread notification and marks it read', async () => {
    const onCountsChange = vi.fn();
    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={onCountsChange} />);

    const trigger = await screen.findByLabelText('Notifications, 1 unread');
    await user.click(trigger);
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Mark notification as read: You have a new fixture invitation/i }));

    await waitFor(() => expect(fixtureApi.markFixtureNotificationRead).toHaveBeenCalledWith('notification-1'));
    expect(trigger).toHaveAttribute('aria-label', 'Notifications, 0 unread');
    expect(onCountsChange).toHaveBeenLastCalledWith({ events: 0, fixtures: 0, reminders: 0 });
  });

  it('closes when a pointer lands outside the menu', async () => {
    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    const trigger = await screen.findByLabelText('Notifications, 1 unread');
    const menu = trigger.closest('details');
    await user.click(trigger);
    expect(menu).toHaveAttribute('open');
    await user.click(document.body);
    expect(menu).not.toHaveAttribute('open');
  });

  it('shows a guest change request and its message to the host', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [{
        id: 'notification-2', eventId: 'event-1', invitationId: 'invitation-1', kind: 'fixture_responded',
        payload: { response: 'change_requested', message: 'Can we start at 10:00?', guestWorkspaceName: 'Team B' },
        readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z',
      }],
      meta: { count: 1 },
    });

    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    await user.click(await screen.findByLabelText('Notifications, 1 unread'));
    expect(screen.getByText('Team B change requested to your fixture invitation. Can we start at 10:00?')).toBeInTheDocument();
  });

  it('stars and unstars a notification', async () => {
    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    await user.click(await screen.findByLabelText('Notifications, 1 unread'));
    const starBtn = screen.getByRole('button', { name: /Star notification: You have a new fixture invitation/i });
    await user.click(starBtn);

    await waitFor(() => expect(fixtureApi.starFixtureNotification).toHaveBeenCalledWith('notification-1'));
    expect(starBtn).toHaveAttribute('aria-label', 'Unstar notification: You have a new fixture invitation.');

    await user.click(starBtn);
    await waitFor(() => expect(fixtureApi.unstarFixtureNotification).toHaveBeenCalledWith('notification-1'));
  });

  it('shows delete button only for read notifications', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [
        { id: 'n1', eventId: 'e1', invitationId: null, kind: 'fixture_invited', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' },
        { id: 'n2', eventId: 'e1', invitationId: null, kind: 'fixture_started', payload: { revision: 1 }, readAt: '2026-09-06T09:00:00.000Z', starredAt: null, createdAt: '2026-09-06T07:00:00.000Z' },
      ],
      meta: { count: 2 },
    });

    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    await user.click(await screen.findByLabelText('Notifications, 1 unread'));
    expect(screen.queryByRole('button', { name: /Delete notification: You have a new fixture invitation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete notification: A fixture you are participating in has started/i })).toBeInTheDocument();
  });

  it('shows event_coming_up notification copy', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [
        { id: 'n1', eventId: 'e1', invitationId: null, kind: 'event_coming_up', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' },
      ],
      meta: { count: 1 },
    });

    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    await user.click(await screen.findByLabelText('Notifications, 1 unread'));
    expect(screen.getByText('An event has been scheduled.')).toBeInTheDocument();
  });

  it('shows live_logger_started notification copy', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [
        { id: 'n1', eventId: 'e1', invitationId: null, kind: 'live_logger_started', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' },
      ],
      meta: { count: 1 },
    });

    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    await user.click(await screen.findByLabelText('Notifications, 1 unread'));
    expect(screen.getByText('Live logging has started for an event.')).toBeInTheDocument();
  });

  it('shows event_ended notification copy', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [
        { id: 'n1', eventId: 'e1', invitationId: null, kind: 'event_ended', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' },
      ],
      meta: { count: 1 },
    });

    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    await user.click(await screen.findByLabelText('Notifications, 1 unread'));
    expect(screen.getByText('An event has ended.')).toBeInTheDocument();
  });

  it('counts event lifecycle notifications as events category', async () => {
    const onCountsChange = vi.fn();
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [
        { id: 'n1', eventId: 'e1', invitationId: null, kind: 'event_coming_up', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' },
        { id: 'n2', eventId: 'e1', invitationId: null, kind: 'live_logger_started', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' },
        { id: 'n3', eventId: 'e1', invitationId: null, kind: 'event_ended', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' },
        { id: 'n4', eventId: 'e1', invitationId: null, kind: 'fixture_invited', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' },
      ],
      meta: { count: 4 },
    });
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(4);

    render(<FixtureNotifications onCountsChange={onCountsChange} />);

    await screen.findByLabelText('Notifications, 4 unread');
    expect(onCountsChange).toHaveBeenLastCalledWith({ events: 3, fixtures: 1, reminders: 0 });
  });

  it('deletes a read notification and removes it from the list', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [
        { id: 'n1', eventId: 'e1', invitationId: null, kind: 'fixture_started', payload: { revision: 1 }, readAt: '2026-09-06T09:00:00.000Z', starredAt: null, createdAt: '2026-09-06T07:00:00.000Z' },
      ],
      meta: { count: 1 },
    });
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(0);

    const onCountsChange = vi.fn();
    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={onCountsChange} />);

    await user.click(await screen.findByLabelText('Notifications, 0 unread'));
    const deleteBtn = screen.getByRole('button', { name: /Delete notification: A fixture you are participating in has started/i });
    await user.click(deleteBtn);

    await waitFor(() => expect(fixtureApi.deleteFixtureNotification).toHaveBeenCalledWith('n1'));
    expect(screen.queryByText('A fixture you are participating in has started.')).not.toBeInTheDocument();
  });

  it('shows a seven-day reminder and marks it read', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({ data: [], meta: { count: 0 } });
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(0);
    reminderApi.listEventReminders.mockResolvedValue({
      data: [{ id: 'rem-1', eventId: 'event-1', eventVersion: 1, threshold: 'seven_days', scheduledFor: '2026-09-01T00:00:00.000Z', readAt: null, createdAt: '2026-08-25T00:00:00.000Z' }],
      meta: { count: 1 },
    });
    reminderApi.getUnreadEventReminderCount.mockResolvedValue(1);

    const onCountsChange = vi.fn();
    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={onCountsChange} />);

    const trigger = await screen.findByLabelText('Notifications, 1 unread');
    await user.click(trigger);
    expect(screen.getByText('An event is coming up in 7 days.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Mark notification as read: An event is coming up in 7 days/i }));
    await waitFor(() => expect(reminderApi.markEventReminderRead).toHaveBeenCalledWith('rem-1'));
    expect(onCountsChange).toHaveBeenLastCalledWith({ events: 0, fixtures: 0, reminders: 0 });
  });

  it('shows a one-day reminder', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({ data: [], meta: { count: 0 } });
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(0);
    reminderApi.listEventReminders.mockResolvedValue({
      data: [{ id: 'rem-2', eventId: 'event-2', eventVersion: 1, threshold: 'one_day', scheduledFor: '2026-09-06T00:00:00.000Z', readAt: null, createdAt: '2026-09-05T00:00:00.000Z' }],
      meta: { count: 1 },
    });
    reminderApi.getUnreadEventReminderCount.mockResolvedValue(1);

    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    await user.click(await screen.findByLabelText('Notifications, 1 unread'));
    expect(screen.getByText('An event is coming up tomorrow.')).toBeInTheDocument();
  });

  it('combines notification and reminder unread counts', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({
      data: [{ id: 'n1', eventId: 'e1', invitationId: null, kind: 'fixture_invited', payload: {}, readAt: null, starredAt: null, createdAt: '2026-09-06T08:00:00.000Z' }],
      meta: { count: 1 },
    });
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(1);
    reminderApi.listEventReminders.mockResolvedValue({
      data: [{ id: 'rem-1', eventId: 'e1', eventVersion: 1, threshold: 'seven_days', scheduledFor: '2026-09-01T00:00:00.000Z', readAt: null, createdAt: '2026-08-25T00:00:00.000Z' }],
      meta: { count: 1 },
    });
    reminderApi.getUnreadEventReminderCount.mockResolvedValue(1);

    render(<FixtureNotifications onCountsChange={vi.fn()} />);
    await screen.findByLabelText('Notifications, 2 unread');
  });

  it('does not show star or delete buttons for reminder items', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({ data: [], meta: { count: 0 } });
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(0);
    reminderApi.listEventReminders.mockResolvedValue({
      data: [{ id: 'rem-1', eventId: 'e1', eventVersion: 1, threshold: 'seven_days', scheduledFor: '2026-09-01T00:00:00.000Z', readAt: null, createdAt: '2026-08-25T00:00:00.000Z' }],
      meta: { count: 1 },
    });
    reminderApi.getUnreadEventReminderCount.mockResolvedValue(1);

    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);

    await user.click(await screen.findByLabelText('Notifications, 1 unread'));
    expect(screen.queryByRole('button', { name: /Star notification/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete notification/i })).not.toBeInTheDocument();
  });

  it('reports reminders count in onCountsChange', async () => {
    const onCountsChange = vi.fn();
    fixtureApi.listFixtureNotifications.mockResolvedValue({ data: [], meta: { count: 0 } });
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(0);
    reminderApi.listEventReminders.mockResolvedValue({
      data: [
        { id: 'rem-1', eventId: 'e1', eventVersion: 1, threshold: 'seven_days', scheduledFor: '2026-09-01T00:00:00.000Z', readAt: null, createdAt: '2026-08-25T00:00:00.000Z' },
        { id: 'rem-2', eventId: 'e2', eventVersion: 1, threshold: 'one_day', scheduledFor: '2026-09-06T00:00:00.000Z', readAt: null, createdAt: '2026-09-05T00:00:00.000Z' },
      ],
      meta: { count: 2 },
    });
    reminderApi.getUnreadEventReminderCount.mockResolvedValue(2);

    render(<FixtureNotifications onCountsChange={onCountsChange} />);
    await screen.findByLabelText('Notifications, 2 unread');
    expect(onCountsChange).toHaveBeenLastCalledWith({ events: 0, fixtures: 0, reminders: 2 });
  });

  it('marks read reminder does not show New label', async () => {
    fixtureApi.listFixtureNotifications.mockResolvedValue({ data: [], meta: { count: 0 } });
    fixtureApi.getUnreadFixtureNotificationCount.mockResolvedValue(0);
    reminderApi.listEventReminders.mockResolvedValue({
      data: [{ id: 'rem-1', eventId: 'e1', eventVersion: 1, threshold: 'seven_days', scheduledFor: '2026-09-01T00:00:00.000Z', readAt: '2026-08-26T00:00:00.000Z', createdAt: '2026-08-25T00:00:00.000Z' }],
      meta: { count: 1 },
    });
    reminderApi.getUnreadEventReminderCount.mockResolvedValue(0);

    const user = userEvent.setup();
    render(<FixtureNotifications onCountsChange={vi.fn()} />);
    await user.click(screen.getByLabelText('Notifications, 0 unread'));
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });
});
