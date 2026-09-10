import { useOnlineStatus } from '../hooks/useOnlineStatus';
import styles from './OfflineIndicator.module.css';

export function OfflineIndicator() {
  const { isOnline } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <span className={styles.badge} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      Offline
    </span>
  );
}
