import { useEffect, useState } from 'react';
import { getUnreadFixtureNotificationCount, listFixtureNotifications, markFixtureNotificationRead } from '../../api/fixtures';
import type { FixtureNotification } from '../../types';
import { useWorkspace } from '../auth/WorkspaceContext';
import styles from './FixtureNotifications.module.css';

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

function notificationDate(notification: FixtureNotification): string {
  return new Date(notification.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

  return <details className={styles.notifications}>
    <summary aria-label={`Fixture notifications, ${unreadCount} unread`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
      {unreadCount > 0 && <span className={styles.badge} aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </summary>
    <section className={styles.panel} aria-label="Fixture notifications">
      <header className={styles.panelHeader}>
        <div><p>Fixture activity</p><h2>Notifications</h2></div>
        <span>{unreadCount ? `${unreadCount} new` : 'All caught up'}</span>
      </header>
      {notifications.length === 0 ? <div className={styles.empty}><i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg></i><p>No fixture notifications yet.</p></div> : <ul className={styles.list}>{notifications.map((notification) => <li key={notification.id}><button type="button" data-read={Boolean(notification.readAt)} onClick={() => void markRead(notification)} disabled={Boolean(notification.readAt)} aria-label={notification.readAt ? `Notification read: ${notificationCopy(notification)}` : `Mark notification as read: ${notificationCopy(notification)}`}><i aria-hidden="true" /><span><strong>{notification.readAt ? 'Read' : 'New'}</strong><span>{notificationCopy(notification)}</span></span><time dateTime={notification.createdAt}>{notificationDate(notification)}</time></button></li>)}</ul>}
    </section>
  </details>;
}
