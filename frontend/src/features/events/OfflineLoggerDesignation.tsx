import { useState } from 'react';
import { revokeOfflineLoggerDesignation } from '../../api/eventHelpers';
import { Button, Toast } from '../../components';
import { useCurrentUser } from '../auth/CurrentUserContext';
import type { User } from '../../types';
import styles from './OfflineLoggerDesignation.module.css';

interface OfflineDesignation {
  grantId: string;
  userId: string;
  eventId: string;
  isOfflineLogger: boolean;
  offlineQueueDeviceId: string | null;
  user?: User;
}

interface OfflineLoggerDesignationProps {
  eventId: string;
  designations: OfflineDesignation[];
  onDesignationChange?: () => void;
}

export function OfflineLoggerDesignation({
  eventId,
  designations,
  onDesignationChange,
}: OfflineLoggerDesignationProps) {
  const currentUser = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const designated = designations.find((d) => d.isOfflineLogger);
  const isDesignated = designated?.userId === currentUser?.id;

  const handleRevoke = async () => {
    if (!designated) return;
    setBusy(true);
    try {
      await revokeOfflineLoggerDesignation(eventId, designated.grantId);
      setToast('Offline logger designation revoked');
      onDesignationChange?.();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.container}>
      <h3>Offline Logger</h3>
      <p className={styles.description}>
        Designate one staff member as the offline logger for this event.
        Only the designated logger can record entries while offline.
      </p>

      {designated ? (
        <div className={styles.currentDesignation}>
          <span className={styles.designee}>
            {designated.user?.name ?? 'Unknown user'}
          </span>
          {isDesignated && (
            <span className={styles.youBadge}>You</span>
          )}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={handleRevoke}
          >
            Revoke
          </Button>
        </div>
      ) : (
        <p className={styles.noDesignation}>No offline logger designated</p>
      )}

      {toast && <Toast onDismiss={() => setToast(null)}>{toast}</Toast>}
    </div>
  );
}
