import { useEffect, useState } from 'react';
import { Button, Card } from '../../components';
import { getUnreadFixtureNotificationCount, listFixtureNotifications, markFixtureNotificationRead } from '../../api/fixtures';
import type { FixtureNotification } from '../../types';
import { useWorkspace } from '../auth/WorkspaceContext';

export interface FixtureNotificationCounts {
  events: number;
  fixtures: number;
}

function notificationCopy(notification: FixtureNotification): string {
  const response = typeof notification.payload.response === 'string' ? notification.payload.response.replace('_', ' ') : null;
  const club = typeof notification.payload.guestWorkspaceName === 'string' ? notification.payload.guestWorkspaceName : 'A guest club';
  if (notification.kind === 'fixture_started') return 'A fixture you are participating in has started.';
  if (notification.kind === 'fixture_invited') return 'You have a new fixture invitation.';
  if (notification.kind === 'fixture_reacceptance_required') return 'A fixture changed and needs your club to reaccept.';
  return `${club} ${response ?? 'responded'} to your fixture invitation.`;
}

export function FixtureNotifications({ onCountsChange }: { onCountsChange: (counts: FixtureNotificationCounts) => void }) {
  const { activeWorkspace } = useWorkspace();
  const [notifications, setNotifications] = useState<FixtureNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let current = true;
    const load = () => {
      void Promise.all([listFixtureNotifications(), getUnreadFixtureNotificationCount()]).then(([response, unread]) => {
        if (!current) return;
        setNotifications(response.data);
        setUnreadCount(unread);
        onCountsChange({
          events: response.data.filter((item) => item.readAt === null && item.kind === 'fixture_started').length,
          fixtures: response.data.filter((item) => item.readAt === null && item.kind !== 'fixture_started').length,
        });
      }).catch(() => {
        if (current) onCountsChange({ events: 0, fixtures: 0 });
      });
    };
    load();
    window.addEventListener('fixture-notifications-changed', load);
    return () => { current = false; window.removeEventListener('fixture-notifications-changed', load); };
  }, [activeWorkspace.id, onCountsChange]);

  const markRead = async (notification: FixtureNotification) => {
    if (notification.readAt) return;
    await markFixtureNotificationRead(notification.id);
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    onCountsChange({
      events: notifications.filter((item) => item.id !== notification.id && item.readAt === null && item.kind === 'fixture_started').length,
      fixtures: notifications.filter((item) => item.id !== notification.id && item.readAt === null && item.kind !== 'fixture_started').length,
    });
  };

  return <details>
    <summary aria-label={`Fixture notifications, ${unreadCount} unread`}>Notifications{unreadCount ? ` (${unreadCount})` : ''}</summary>
    <Card>
      <h2>Fixture notifications</h2>
      {notifications.length === 0 ? <p>No fixture notifications.</p> : <ul>{notifications.map((notification) => <li key={notification.id}><Button variant="ghost" onClick={() => void markRead(notification)}><strong>{notification.readAt ? 'Read' : 'Unread'}</strong> {notificationCopy(notification)}</Button></li>)}</ul>}
    </Card>
  </details>;
}
