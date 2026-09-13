import { useEffect, useRef, useState } from 'react';
import { deleteFixtureNotification, getUnreadFixtureNotificationCount, listFixtureNotifications, markFixtureNotificationRead, starFixtureNotification, unstarFixtureNotification } from '../../api/fixtures';
import { getUnreadEventReminderCount, listEventReminders, markEventReminderRead } from '../../api/reminders';
import type { EventReminder, FixtureNotification } from '../../types';
import { useWorkspace } from '../auth/WorkspaceContext';
import styles from './FixtureNotifications.module.css';

export interface FixtureNotificationCounts {
  events: number;
  fixtures: number;
  reminders: number;
}

const EVENT_LIFECYCLE_KINDS: ReadonlySet<FixtureNotification['kind']> = new Set(['fixture_started', 'event_coming_up', 'live_logger_started', 'event_ended']);

interface DisplayItem {
  kind: 'notification' | 'reminder';
  id: string;
  eventId: string;
  readAt: string | null;
  createdAt: string;
  notification?: FixtureNotification;
  reminder?: EventReminder;
}

function reminderCopy(reminder: EventReminder): string {
  if (reminder.threshold === 'seven_days') return 'An event is coming up in 7 days.';
  return 'An event is coming up tomorrow.';
}

function notificationCopy(notification: FixtureNotification): string {
  const response = typeof notification.payload.response === 'string' ? notification.payload.response.replace('_', ' ') : null;
  const club = typeof notification.payload.guestWorkspaceName === 'string' ? notification.payload.guestWorkspaceName : 'A guest club';
  if (notification.kind === 'fixture_started') return 'A fixture you are participating in has started.';
  if (notification.kind === 'fixture_invited') return 'You have a new fixture invitation.';
  if (notification.kind === 'fixture_reacceptance_required') return 'A fixture changed and needs your club to reaccept.';
  if (notification.kind === 'event_coming_up') return 'An event has been scheduled.';
  if (notification.kind === 'live_logger_started') return 'Live logging has started for an event.';
  if (notification.kind === 'event_ended') return 'An event has ended.';
  const message = typeof notification.payload.message === 'string' ? notification.payload.message : null;
  return `${club} ${response ?? 'responded'} to your fixture invitation.${message ? ` ${message}` : ''}`;
}

function itemCopy(item: DisplayItem): string {
  if (item.kind === 'reminder' && item.reminder) return reminderCopy(item.reminder);
  if (item.notification) return notificationCopy(item.notification);
  return '';
}

function itemDate(item: DisplayItem): string {
  return new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toDisplayItems(notifications: FixtureNotification[], reminders: EventReminder[]): DisplayItem[] {
  const items: DisplayItem[] = [
    ...notifications.map((n) => ({ kind: 'notification' as const, id: n.id, eventId: n.eventId, readAt: n.readAt, createdAt: n.createdAt, notification: n })),
    ...reminders.map((r) => ({ kind: 'reminder' as const, id: r.id, eventId: r.eventId, readAt: r.readAt, createdAt: r.createdAt, reminder: r })),
  ];
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

export function FixtureNotifications({ onCountsChange }: { onCountsChange: (counts: FixtureNotificationCounts) => void }) {
  const { activeWorkspace } = useWorkspace();
  const notificationsRef = useRef<HTMLDetailsElement | null>(null);
  const [notifications, setNotifications] = useState<FixtureNotification[]>([]);
  const [reminders, setReminders] = useState<EventReminder[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let current = true;
    const load = () => {
      void Promise.all([
        listFixtureNotifications(),
        getUnreadFixtureNotificationCount(),
        listEventReminders(),
        getUnreadEventReminderCount(),
      ]).then(([response, unread, reminderResponse, reminderUnread]) => {
        if (!current) return;
        setNotifications(response.data);
        setReminders(reminderResponse.data);
        setUnreadCount(unread + reminderUnread);
        onCountsChange({
          events: response.data.filter((item) => item.readAt === null && EVENT_LIFECYCLE_KINDS.has(item.kind)).length,
          fixtures: response.data.filter((item) => item.readAt === null && !EVENT_LIFECYCLE_KINDS.has(item.kind)).length,
          reminders: reminderUnread,
        });
      }).catch(() => {
        if (current) onCountsChange({ events: 0, fixtures: 0, reminders: 0 });
      });
    };
    load();
    const refreshTimer = window.setInterval(load, 15_000);
    window.addEventListener('fixture-notifications-changed', load);
    return () => {
      current = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('fixture-notifications-changed', load);
    };
  }, [activeWorkspace.id, onCountsChange]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (notificationsRef.current?.open && !notificationsRef.current.contains(event.target as Node)) notificationsRef.current.removeAttribute('open');
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  const markNotificationRead = async (notification: FixtureNotification) => {
    if (notification.readAt) return;
    await markFixtureNotificationRead(notification.id);
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    onCountsChange({
      events: notifications.filter((item) => item.id !== notification.id && item.readAt === null && EVENT_LIFECYCLE_KINDS.has(item.kind)).length,
      fixtures: notifications.filter((item) => item.id !== notification.id && item.readAt === null && !EVENT_LIFECYCLE_KINDS.has(item.kind)).length,
      reminders: reminders.filter((item) => item.readAt === null).length,
    });
  };

  const markReminderRead = async (reminder: EventReminder) => {
    if (reminder.readAt) return;
    await markEventReminderRead(reminder.id);
    setReminders((current) => current.map((item) => item.id === reminder.id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    onCountsChange({
      events: notifications.filter((item) => item.readAt === null && EVENT_LIFECYCLE_KINDS.has(item.kind)).length,
      fixtures: notifications.filter((item) => item.readAt === null && !EVENT_LIFECYCLE_KINDS.has(item.kind)).length,
      reminders: reminders.filter((item) => item.id !== reminder.id && item.readAt === null).length,
    });
  };

  const handleMarkRead = async (item: DisplayItem) => {
    if (item.kind === 'reminder' && item.reminder) {
      await markReminderRead(item.reminder);
    } else if (item.notification) {
      await markNotificationRead(item.notification);
    }
  };

  const toggleStar = async (e: React.MouseEvent, notification: FixtureNotification) => {
    e.stopPropagation();
    const wasStarred = notification.starredAt !== null;
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, starredAt: wasStarred ? null : new Date().toISOString() } : item));
    if (wasStarred) {
      await unstarFixtureNotification(notification.id);
    } else {
      await starFixtureNotification(notification.id);
    }
  };

  const handleDelete = async (e: React.MouseEvent, notification: FixtureNotification) => {
    e.stopPropagation();
    await deleteFixtureNotification(notification.id);
    setNotifications((current) => current.filter((item) => item.id !== notification.id));
    if (!notification.readAt) {
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    onCountsChange({
      events: notifications.filter((item) => item.id !== notification.id && item.readAt === null && EVENT_LIFECYCLE_KINDS.has(item.kind)).length,
      fixtures: notifications.filter((item) => item.id !== notification.id && item.readAt === null && !EVENT_LIFECYCLE_KINDS.has(item.kind)).length,
      reminders: reminders.filter((item) => item.readAt === null).length,
    });
  };

  const displayItems = toDisplayItems(notifications, reminders);

  return <details ref={notificationsRef} className={styles.notifications}>
    <summary aria-label={`Notifications, ${unreadCount} unread`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
      {unreadCount > 0 && <span className={styles.badge} aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </summary>
    <section className={styles.panel} aria-label="Notifications">
      <header className={styles.panelHeader}>
        <div><p>Updates</p><h2>Notifications</h2></div>
        <span>{unreadCount ? `${unreadCount} new` : 'All caught up'}</span>
      </header>
      {displayItems.length === 0 ? <div className={styles.empty}><i aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg></i><p>No notifications yet.</p></div> : <ul className={styles.list}>{displayItems.map((item) => <li key={`${item.kind}-${item.id}`} className={styles.item}><button type="button" data-read={Boolean(item.readAt)} onClick={() => void handleMarkRead(item)} disabled={Boolean(item.readAt)} aria-label={item.readAt ? `Notification read: ${itemCopy(item)}` : `Mark notification as read: ${itemCopy(item)}`}><i aria-hidden="true" /><span><strong>{item.readAt ? 'Read' : 'New'}</strong><span>{itemCopy(item)}</span></span><time dateTime={item.createdAt}>{itemDate(item)}</time></button>{item.kind === 'notification' && item.notification && <span className={styles.actions}><button type="button" className={styles.starBtn} data-starred={Boolean(item.notification.starredAt)} onClick={(e) => void toggleStar(e, item.notification!)} aria-label={item.notification.starredAt ? `Unstar notification: ${notificationCopy(item.notification!)}` : `Star notification: ${notificationCopy(item.notification!)}`}><svg viewBox="0 0 24 24" fill={item.notification.starredAt ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg></button>{item.notification.readAt && <button type="button" className={styles.deleteBtn} onClick={(e) => void handleDelete(e, item.notification!)} aria-label={`Delete notification: ${notificationCopy(item.notification!)}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>}</span>}</li>)}</ul>}
    </section>
  </details>;
}
