import { useEffect, useState } from 'react';
import { getQueueStatus } from '../../offline/actionQueue';
import styles from './QueueStatusBadge.module.css';

interface QueueStatusBadgeProps {
  eventId: string;
  userId: string;
}

export function QueueStatusBadge({ eventId, userId }: QueueStatusBadgeProps) {
  const [status, setStatus] = useState<{ pending: number; synced: number; failed: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const s = await getQueueStatus(eventId, userId);
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus(null);
      }
    }

    void loadStatus();
    const interval = setInterval(loadStatus, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventId, userId]);

  if (!status) return null;

  const { pending, synced, failed } = status;

  if (pending === 0 && synced === 0 && failed === 0) return null;

  if (failed > 0) {
    return (
      <span className={`${styles.badge} ${styles.failed}`} role="status">
        {failed} failed
      </span>
    );
  }

  if (pending > 0) {
    return (
      <span className={`${styles.badge} ${styles.pending}`} role="status">
        {pending} pending
      </span>
    );
  }

  return (
    <span className={`${styles.badge} ${styles.synced}`} role="status">
      All synced
    </span>
  );
}
