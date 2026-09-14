import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import {
  createPublicLoggerEntry,
  getPublicLoggerSnapshot,
  removePublicLoggerEntry,
  startPublicLoggerSession,
  updatePublicLoggerEntry,
} from '../../api/publicLoggers';
import { getCachedPublicSnapshot, cachePublicSnapshot } from '../../offline/publicEventCache';
import { usePublicOfflineSync } from '../../hooks/usePublicOfflineSync';
import type { IncidentType, PublicLoggerSnapshot } from '../../types';
import { Button, Input, Modal } from '../../components';
import { getIncidentTypeLabel, has100mHundredthPrecision } from '../results/resultPresentation';
function getDeviceId(): string {
  const stored = localStorage.getItem('athlora_device_id');
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem('athlora_device_id', id);
  return id;
}
import styles from '../timeline/LiveLoggingPage.module.css';
import joinStyles from './PublicLoggerPage.module.css';
import badgeStyles from '../timeline/QueueStatusBadge.module.css';

function storageKeys(linkToken: string | undefined): { session: string; event: string } | null {
  if (!linkToken) return null;
  let hash = 2166136261;
  for (let index = 0; index < linkToken.length; index += 1) hash = Math.imul(hash ^ linkToken.charCodeAt(index), 16777619);
  const scope = (hash >>> 0).toString(36);
  return { session: `athlora_public_logger_session_${scope}`, event: `athlora_public_logger_event_${scope}` };
}

function clearSession(keys: { session: string; event: string } | null): void {
  if (!keys) return;
  sessionStorage.removeItem(keys.session);
  sessionStorage.removeItem(keys.event);
}

function SyncBadge({ isOnline, pendingCount, failedCount }: { isOnline: boolean; pendingCount: number; failedCount: number }) {
  if (pendingCount === 0 && failedCount === 0) return null;
  if (!isOnline) {
    return (
      <span className={`${badgeStyles.badge} ${badgeStyles.pending}`} role="status">
        Offline — {pendingCount} queued
      </span>
    );
  }
  if (failedCount > 0) {
    return (
      <span className={`${badgeStyles.badge} ${badgeStyles.failed}`} role="status">
        {failedCount} failed
      </span>
    );
  }
  return (
    <span className={`${badgeStyles.badge} ${badgeStyles.pending}`} role="status">
      Syncing {pendingCount}...
    </span>
  );
}

export function PublicLoggerPage() {
  const { token } = useParams();
  const [name, setName] = useState('');
  const [club, setClub] = useState('Independent');
  const [session, setSession] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PublicLoggerSnapshot | null>(null);
  const [finishInputs, setFinishInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PublicLoggerSnapshot['timeline'][number] | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editIncident, setEditIncident] = useState<IncidentType>(null);
  const keys = useMemo(() => storageKeys(token), [token]);
  const deviceId = useMemo(() => getDeviceId(), []);

  const offlineSync = usePublicOfflineSync({
    sessionToken: session ?? '',
    eventId: snapshot?.event.id ?? '',
    deviceId,
  });

  const loadRef = useRef<((sessionToken: string, eventId: string) => Promise<void>) | null>(null);

  const load = useCallback(async (sessionToken: string, eventId: string) => {
    try {
      const fresh = await getPublicLoggerSnapshot(sessionToken, eventId);
      setSnapshot(fresh);
      await cachePublicSnapshot(eventId, fresh as unknown as Record<string, unknown>, sessionToken);
    } catch {
      const cached = await getCachedPublicSnapshot(eventId, sessionToken);
      if (cached) {
        setSnapshot(cached as unknown as PublicLoggerSnapshot);
      } else {
        throw new Error('No cached data available');
      }
    }
  }, []);

  loadRef.current = load;

  useEffect(() => {
    if (!keys) return;
    const storedSession = sessionStorage.getItem(keys.session);
    const eventId = sessionStorage.getItem(keys.event);
    if (!storedSession || !eventId) return;
    void loadRef.current?.(storedSession, eventId).then(() => setSession(storedSession)).catch(() => clearSession(keys));
  }, [keys]);

  useEffect(() => {
    if (offlineSync.sessionExpired) {
      clearSession(keys);
      setSession(null);
      setSnapshot(null);
      offlineSync.clearSessionExpired();
      setError('Your session has expired. Please open the logger link again.');
    }
  }, [offlineSync.sessionExpired, keys, offlineSync.clearSessionExpired]);

  const handleError = (requestError: unknown, fallback: string) => {
    if (requestError instanceof ApiError && requestError.code === 'PUBLIC_LOGGER_SESSION_INVALID') {
      clearSession(keys); setSession(null); setSnapshot(null);
    }
    setError(requestError instanceof Error ? requestError.message : fallback);
  };

  const open = async (event: React.FormEvent) => {
    event.preventDefault(); if (!token) return;
    setBusy('open'); setError(null);
    try {
      const next = await startPublicLoggerSession(token, name, club);
      if (keys) { sessionStorage.setItem(keys.session, next.sessionToken); sessionStorage.setItem(keys.event, next.snapshot.event.id); }
      setSession(next.sessionToken); setSnapshot(next.snapshot);
      await cachePublicSnapshot(next.snapshot.event.id, next.snapshot as unknown as Record<string, unknown>, next.sessionToken);
    } catch (requestError) { handleError(requestError, 'Unable to open this logger.'); } finally { setBusy(null); }
  };

  const refresh = async () => {
    if (!session || !snapshot) return;
    setBusy('refresh'); setError(null);
    try { await load(session, snapshot.event.id); } catch (requestError) { handleError(requestError, 'This logger is no longer available.'); } finally { setBusy(null); }
  };

  const record = async (athleteId: string, entryType: 'attempt' | 'penalty', incidentType?: IncidentType) => {
    if (!session || !snapshot) return;
    const raw = finishInputs[athleteId] ?? '';
    if (entryType === 'attempt' && (!raw.trim() || !has100mHundredthPrecision(raw) || Number(raw) < 0.01 || Number(raw) > 99.99)) {
      setError('Enter a finish time from 0.01 to 99.99 seconds using no more than two decimal places.'); return;
    }
    setBusy(`${athleteId}-${entryType}`); setError(null);

    const payload = entryType === 'attempt'
      ? { athleteId, entryType, value: Number(raw), unit: 'seconds' as const, isFoul: false as const, incidentType: null, noteText: null }
      : { athleteId, entryType, value: null, unit: null, isFoul: false as const, incidentType: incidentType ?? 'false_start', noteText: null };

    try {
      if (!offlineSync.isOnline) {
        await offlineSync.enqueue({ actionType: 'create_entry', payload });
        setFinishInputs((current) => ({ ...current, [athleteId]: '' }));
        return;
      }
      await createPublicLoggerEntry(session, snapshot.event.id, payload);
      setFinishInputs((current) => ({ ...current, [athleteId]: '' }));
      await load(session, snapshot.event.id);
    } catch (requestError) { handleError(requestError, 'Could not record this entry.'); } finally { setBusy(null); }
  };

  const saveEdit = async () => {
    if (!session || !snapshot || !editing) return;
    if (editing.entryType === 'attempt' && (!has100mHundredthPrecision(editValue) || Number(editValue) < 0.01 || Number(editValue) > 99.99)) {
      setError('Enter a finish time from 0.01 to 99.99 seconds using no more than two decimal places.'); return;
    }
    setBusy(`edit-${editing.id}`); setError(null);

    const payload = editing.entryType === 'attempt'
      ? { expectedVersion: editing.version, value: Number(editValue) }
      : { expectedVersion: editing.version, incidentType: editIncident };

    try {
      if (!offlineSync.isOnline) {
        await offlineSync.enqueue({ actionType: 'edit_entry', payload, entryId: editing.id, expectedVersion: editing.version });
        setEditing(null);
        return;
      }
      await updatePublicLoggerEntry(session, snapshot.event.id, editing.id, payload);
      setEditing(null); await load(session, snapshot.event.id);
    } catch (requestError) { handleError(requestError, 'Could not update this entry.'); } finally { setBusy(null); }
  };

  const undo = async (entry: PublicLoggerSnapshot['timeline'][number]) => {
    if (!session || !snapshot) return;
    setBusy(`undo-${entry.id}`); setError(null);
    try {
      if (!offlineSync.isOnline) {
        await offlineSync.enqueue({ actionType: 'undo_entry', payload: { entryId: entry.id, expectedVersion: entry.version }, entryId: entry.id, expectedVersion: entry.version });
        return;
      }
      await removePublicLoggerEntry(session, snapshot.event.id, entry.id, { expectedVersion: entry.version });
      await load(session, snapshot.event.id);
    } catch (requestError) { handleError(requestError, 'Could not undo this entry.'); } finally { setBusy(null); }
  };

  if (!snapshot) {
    return (
      <main className={joinStyles.page}>
        <section className={joinStyles.join}>
          <p className={joinStyles.kicker}>Athlora public logger</p>
          <h1>Join event logging</h1>
          <p>Identify this track-side logging session before recording.</p>
          <form onSubmit={(event) => void open(event)}>
            <label htmlFor="logger-name">Name</label>
            <Input id="logger-name" value={name} onChange={(event) => setName(event.target.value)} required disabled={Boolean(busy)} />
            <label htmlFor="logger-club">Club or organization</label>
            <Input id="logger-club" value={club} onChange={(event) => setClub(event.target.value)} required disabled={Boolean(busy)} />
            {error && <p role="alert">{error}</p>}
            <Button type="submit" disabled={Boolean(busy) || !token}>{busy ? 'Opening...' : 'Open logger'}</Button>
          </form>
        </section>
      </main>
    );
  }

  const loggingOpen = snapshot.event.status === 'in_progress';
  return (
    <main className={styles.container}>
      <div className={styles.activeHeader}>
        <div>
          <span className={styles.eyebrow}>Live Session Active</span>
          <h2>{snapshot.event.title}</h2>
          <p>Track · 100m · {snapshot.participants.length} assigned athletes</p>
        </div>
        <div className={styles.headerButtons}>
          {!offlineSync.isOnline && (
            <span className={`${badgeStyles.badge} ${badgeStyles.pending}`} role="status">
              Offline
            </span>
          )}
          <SyncBadge isOnline={offlineSync.isOnline} pendingCount={offlineSync.pendingCount} failedCount={offlineSync.failedCount} />
          <Button variant="secondary" onClick={() => void refresh()} disabled={Boolean(busy)}>{busy === 'refresh' ? 'Refreshing...' : 'Refresh'}</Button>
        </div>
      </div>

      {error && <div className={styles.errorAlert} role="alert">{error}</div>}

      <div className={styles.workspace}>
        <section className={styles.consoleSection} aria-label="Athlete logging console">
          <h3>Assigned Athletes ({snapshot.participants.length})</h3>
          <div className={styles.athleteList}>
            {snapshot.participants.map((participant) => {
              const value = finishInputs[participant.athleteId] ?? '';
              const recording = busy === `${participant.athleteId}-attempt`;
              return (
                <div key={participant.athleteId} className={styles.athleteRow}>
                  <div className={styles.athleteInfo}>
                    <b>{participant.name}</b>
                    <small>{participant.teamName ?? 'Team not recorded'}</small>
                  </div>
                  <div className={styles.controlsGroup}>
                    <div className={styles.finishInputGroup}>
                      <Input
                        aria-label={`Finish time for ${participant.name}`}
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        max="99.99"
                        step="0.01"
                        placeholder="10.25"
                        value={value}
                        onChange={(event) => setFinishInputs((current) => ({ ...current, [participant.athleteId]: event.target.value }))}
                        disabled={!loggingOpen || Boolean(busy)}
                      />
                      <Button
                        disabled={!loggingOpen || Boolean(busy) || !value.trim()}
                        onClick={() => void record(participant.athleteId, 'attempt')}
                      >
                        {recording ? 'Logging...' : 'Record'}
                      </Button>
                    </div>
                    <div className={styles.incidentButtonGroup}>
                      {(['false_start', 'lane_infringement', 'dq', 'dnf', 'dns'] as const).map((incident) => (
                        <Button
                          key={incident}
                          variant="secondary"
                          disabled={!loggingOpen || Boolean(busy)}
                          onClick={() => void record(participant.athleteId, 'penalty', incident)}
                        >
                          {getIncidentTypeLabel(incident)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.timelineSection} aria-label="Recorded timeline">
          <h3>Timeline ({snapshot.timeline.length} entries)</h3>
          <div className={styles.timelineList}>
            {snapshot.timeline.length === 0 && <p>No entries recorded yet.</p>}
            {snapshot.timeline.map((entry) => (
              <div key={entry.id} className={styles.timelineEntry}>
                <div className={styles.entryHeader}>
                  <span className={styles.entryAthlete}>{snapshot.participants.find(p => p.athleteId === entry.athleteId)?.name ?? entry.athleteId}</span>
                  <span className={styles.entryType}>{entry.entryType === 'attempt' ? 'Attempt' : getIncidentTypeLabel(entry.incidentType)}</span>
                  <span className={styles.entryValue}>
                    {entry.entryType === 'attempt' && entry.value != null ? `${entry.value.toFixed(2)}s` : entry.incidentType}
                  </span>
                  <span className={styles.entryActions}>
                    {entry.canEdit !== false && (
                      <Button variant="secondary" onClick={() => { setEditing(entry); setEditValue(entry.value?.toFixed(2) ?? ''); setEditIncident(entry.incidentType); }} disabled={Boolean(busy)}>Edit</Button>
                    )}
                    {entry.canUndo !== false && (
                      <Button variant="danger" onClick={() => void undo(entry)} disabled={Boolean(busy)}>{busy === `undo-${entry.id}` ? 'Undoing...' : 'Undo'}</Button>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {editing && (
        <Modal open={Boolean(editing)} title="Edit Entry" onClose={() => setEditing(null)}>
          {editing.entryType === 'attempt' ? (
            <Input
              aria-label="Finish time in seconds"
              type="number"
              inputMode="decimal"
              min="0.01"
              max="99.99"
              step="0.01"
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
            />
          ) : (
            <select value={editIncident ?? ''} onChange={(event) => setEditIncident(event.target.value as IncidentType)}>
              {(['false_start', 'lane_infringement', 'dq', 'dnf', 'dns'] as const).map((incident) => (
                <option key={incident} value={incident}>{getIncidentTypeLabel(incident)}</option>
              ))}
            </select>
          )}
          <div className={styles.modalActions}>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={Boolean(busy)}>Cancel</Button>
            <Button onClick={() => void saveEdit()} disabled={Boolean(busy)}>{busy === `edit-${editing.id}` ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
