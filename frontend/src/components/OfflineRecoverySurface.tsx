import { Button } from './Button';
import styles from './OfflineRecoverySurface.module.css';

export interface OfflineRecoveryAction {
  id: string;
  actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
  status: 'pending' | 'synced' | 'failed';
  createdAt: number;
  syncedAt?: number;
  deviceId: string;
  subject: string;
  target: string;
  error?: string;
}

export interface OfflineLoggerStatus {
  label: string;
  deviceId: string | null;
  isCurrentDevice: boolean;
}

interface OfflineRecoverySurfaceProps {
  isOnline: boolean;
  actions: OfflineRecoveryAction[];
  cacheFreshness?: number | null;
  designation?: OfflineLoggerStatus | null;
  isSyncing?: boolean;
  onRefresh?: () => void | Promise<void>;
  onSyncNow?: () => void | Promise<void>;
  onRetryAction?: (actionId: string) => void | Promise<void>;
}

function formatTime(timestamp: number | null | undefined): string {
  if (!timestamp) return 'Not yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function actionLabel(actionType: OfflineRecoveryAction['actionType']): string {
  if (actionType === 'create_entry') return 'Record entry';
  if (actionType === 'edit_entry') return 'Edit entry';
  return 'Undo entry';
}

function actionStatus(status: OfflineRecoveryAction['status']): string {
  if (status === 'pending') return 'Queued locally';
  if (status === 'synced') return 'Synced to server';
  return 'Needs recovery';
}

export function OfflineRecoverySurface({
  isOnline,
  actions,
  cacheFreshness = null,
  designation,
  isSyncing = false,
  onRefresh,
  onSyncNow,
  onRetryAction,
}: OfflineRecoverySurfaceProps) {
  const pendingCount = actions.filter((action) => action.status === 'pending').length;
  const failedCount = actions.filter((action) => action.status === 'failed').length;
  const lastSyncedAt = actions.reduce<number | null>((latest, action) => (
    action.syncedAt && (!latest || action.syncedAt > latest) ? action.syncedAt : latest
  ), null);

  return (
    <section className={styles.surface} aria-label="Offline recovery status" aria-live="polite">
      <div className={styles.summary}>
        <div>
          <p className={styles.kicker}>{isOnline ? 'Connection available' : 'Offline mode'}</p>
          <h3>{isOnline ? 'Sync and recovery' : 'Changes are stored on this device'}</h3>
          <p className={styles.explainer}>
            {isOnline
              ? 'Refresh retrieves server-canonical data. Local queued changes remain separate until the server accepts them.'
              : 'You can keep recording. Queued changes will not be server-canonical until this device reconnects and sync completes.'}
          </p>
        </div>
        <div className={styles.actions}>
          {onRefresh && <Button variant="secondary" onClick={() => void onRefresh()}>Refresh data</Button>}
          {onSyncNow && <Button onClick={() => void onSyncNow()} disabled={!isOnline || pendingCount === 0 || isSyncing}>
            {isSyncing ? 'Syncing...' : pendingCount > 0 ? `Sync ${pendingCount}` : 'Up to date'}
          </Button>}
        </div>
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>Cached data</dt>
          <dd>{cacheFreshness ? `Updated ${formatTime(cacheFreshness)}` : 'No local cache yet'}</dd>
        </div>
        <div>
          <dt>Last local sync</dt>
          <dd>{formatTime(lastSyncedAt)}</dd>
        </div>
        <div>
          <dt>Designated logger</dt>
          <dd>{designation ? `${designation.label}${designation.isCurrentDevice ? ' (this device)' : ''}` : 'No designation recorded'}</dd>
          {designation?.deviceId && <small>Device: {designation.deviceId}</small>}
        </div>
        <div>
          <dt>Recovery state</dt>
          <dd className={failedCount > 0 ? styles.errorText : undefined}>
            {failedCount > 0 ? `${failedCount} action${failedCount === 1 ? '' : 's'} need attention` : `${pendingCount} waiting to sync`}
          </dd>
        </div>
      </dl>

      <details className={styles.queue} open={actions.length > 0}>
        <summary>Local action history ({actions.length})</summary>
        {actions.length === 0 ? (
          <p className={styles.empty}>No locally stored actions for this event.</p>
        ) : (
          <ol className={styles.actionList}>
            {actions.map((action) => (
              <li key={action.id} className={styles.action} data-status={action.status}>
                <div>
                  <strong>{actionLabel(action.actionType)}</strong>
                  <span className={styles.status}>{actionStatus(action.status)}</span>
                  <p>{action.subject} · {action.target}</p>
                  <small>Created {formatTime(action.createdAt)} · Device: {action.deviceId}</small>
                  {action.syncedAt && <small>Server receipt recorded {formatTime(action.syncedAt)}</small>}
                  {action.error && <p className={styles.errorText}>Server response: {action.error}</p>}
                </div>
                {action.status === 'failed' && onRetryAction && (
                  <Button variant="secondary" onClick={() => void onRetryAction(action.id)}>Retry</Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}
