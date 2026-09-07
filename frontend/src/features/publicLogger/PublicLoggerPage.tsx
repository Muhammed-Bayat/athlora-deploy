import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import {
  createPublicLoggerEntry,
  getPublicLoggerSnapshot,
  removePublicLoggerEntry,
  startPublicLoggerSession,
  updatePublicLoggerEntry,
} from '../../api/publicLoggers';
import type { IncidentType, PublicLoggerSnapshot } from '../../types';
import { Button, Input, Modal } from '../../components';
import { format100mSeconds, getIncidentTypeLabel, has100mHundredthPrecision } from '../results/resultPresentation';
import styles from '../timeline/LiveLoggingPage.module.css';
import joinStyles from './PublicLoggerPage.module.css';

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

  const load = async (sessionToken: string, eventId: string) => {
    setSnapshot(await getPublicLoggerSnapshot(sessionToken, eventId));
  };
  useEffect(() => {
    if (!keys) return;
    const storedSession = sessionStorage.getItem(keys.session);
    const eventId = sessionStorage.getItem(keys.event);
    if (!storedSession || !eventId) return;
    void load(storedSession, eventId).then(() => setSession(storedSession)).catch(() => clearSession(keys));
  }, [keys]);

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
    try {
      await createPublicLoggerEntry(session, snapshot.event.id, entryType === 'attempt'
        ? { athleteId, entryType, value: Number(raw), unit: 'seconds', isFoul: false, incidentType: null, noteText: null }
        : { athleteId, entryType, value: null, unit: null, isFoul: false, incidentType: incidentType ?? 'false_start', noteText: null });
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
    try {
      await updatePublicLoggerEntry(session, snapshot.event.id, editing.id, editing.entryType === 'attempt'
        ? { expectedVersion: editing.version, value: Number(editValue) }
        : { expectedVersion: editing.version, incidentType: editIncident });
      setEditing(null); await load(session, snapshot.event.id);
    } catch (requestError) { handleError(requestError, 'Could not update this entry.'); } finally { setBusy(null); }
  };
  const undo = async (entry: PublicLoggerSnapshot['timeline'][number]) => {
    if (!session || !snapshot) return;
    setBusy(`undo-${entry.id}`); setError(null);
    try { await removePublicLoggerEntry(session, snapshot.event.id, entry.id, { expectedVersion: entry.version }); await load(session, snapshot.event.id); }
    catch (requestError) { handleError(requestError, 'Could not undo this entry.'); } finally { setBusy(null); }
  };

  if (!snapshot) return <main className={joinStyles.page}><section className={joinStyles.join}><p className={joinStyles.kicker}>Athlora public logger</p><h1>Join event logging</h1><p>Identify this track-side logging session before recording.</p><form onSubmit={(event) => void open(event)}><label htmlFor="logger-name">Name</label><Input id="logger-name" value={name} onChange={(event) => setName(event.target.value)} required disabled={Boolean(busy)} /><label htmlFor="logger-club">Club or organization</label><Input id="logger-club" value={club} onChange={(event) => setClub(event.target.value)} required disabled={Boolean(busy)} />{error && <p role="alert">{error}</p>}<Button type="submit" disabled={Boolean(busy) || !token}>{busy ? 'Opening...' : 'Open logger'}</Button></form></section></main>;

  const loggingOpen = snapshot.event.status === 'in_progress';
  return <main className={styles.container}><div className={styles.activeHeader}><div><span className={styles.eyebrow}>Live Session Active</span><h2>{snapshot.event.title}</h2><p>Track · 100m · {snapshot.participants.length} assigned athletes</p></div><div className={styles.headerButtons}><Button variant="secondary" onClick={() => void refresh()} disabled={Boolean(busy)}>{busy === 'refresh' ? 'Refreshing...' : 'Refresh'}</Button></div></div>{error && <div className={styles.errorAlert} role="alert">{error}</div>}<div className={styles.workspace}><section className={styles.consoleSection} aria-label="Athlete logging console"><h3>Assigned Athletes ({snapshot.participants.length})</h3><div className={styles.athleteList}>{snapshot.participants.map((participant) => { const value = finishInputs[participant.athleteId] ?? ''; const recording = busy === `${participant.athleteId}-attempt`; return <div key={participant.athleteId} className={styles.athleteRow}><div className={styles.athleteInfo}><b>{participant.name}</b><small>{participant.teamName ?? 'Team not recorded'}</small></div><div className={styles.controlsGroup}><div className={styles.finishInputGroup}><Input aria-label={`Finish time for ${participant.name}`} type="number" inputMode="decimal" min="0.01" max="99.99" step="0.01" placeholder="10.25" value={value} onChange={(event) => setFinishInputs((current) => ({ ...current, [participant.athleteId]: event.target.value }))} disabled={!loggingOpen || Boolean(busy)} /><Button disabled={!loggingOpen || Boolean(busy) || !value.trim()} onClick={() => void record(participant.athleteId, 'attempt')}>{recording ? 'Logging...' : 'Record'}</Button></div><div className={styles.incidentButtonGroup}>{(['false_start', 'lane_infringement', 'dq', 'dnf', 'dns'] as const).map((incident) => <Button key={incident} variant="secondary" disabled={!loggingOpen || Boolean(busy)} onClick={() => void record(participant.athleteId, 'penalty', incident)}>{getIncidentTypeLabel(incident)}</Button>)}</div></div></div>; })}</div></section><aside className={styles.feedAside} aria-label="Timeline feed"><div className={styles.feedCard}><h3>Chronological Timeline</h3>{snapshot.timeline.length === 0 ? <p className={styles.mutedText}>No timeline entries recorded yet.</p> : <div className={styles.timelineList}>{snapshot.timeline.map((entry) => <div key={entry.id} className={styles.timelineItem}><div className={styles.timelineMeta}><b>{snapshot.participants.find((participant) => participant.athleteId === entry.athleteId)?.name ?? entry.athleteId}</b><small>{new Date(entry.createdAt).toLocaleTimeString()}</small></div><div className={styles.timelineBody}>{entry.entryType === 'attempt' && entry.value !== null ? <span className={styles.successBadge}>Finish: {format100mSeconds(entry.value)}</span> : <span className={styles.dangerBadge}>Incident: {entry.incidentType ? getIncidentTypeLabel(entry.incidentType) : entry.entryType}</span>}</div>{entry.canEdit && <div className={styles.timelineActions}><button type="button" className={styles.linkButton} disabled={Boolean(busy)} onClick={() => { setEditing(entry); setEditValue(entry.value === null ? '' : String(entry.value)); setEditIncident(entry.incidentType); }}>Edit</button>{entry.canUndo && <button type="button" className={styles.dangerLinkButton} disabled={Boolean(busy)} onClick={() => void undo(entry)}>Undo</button>}</div>}</div>)}</div>}</div></aside></div><Modal open={Boolean(editing)} title="Edit Timeline Entry" onClose={() => { if (!busy) setEditing(null); }} closeDisabled={Boolean(busy)}>{editing && <div className={styles.editForm}>{editing.entryType === 'attempt' ? <><label htmlFor="public-edit-time">Finish time in seconds</label><Input id="public-edit-time" type="number" inputMode="decimal" min="0.01" max="99.99" step="0.01" value={editValue} onChange={(event) => setEditValue(event.target.value)} disabled={Boolean(busy)} /></> : <><label htmlFor="public-edit-incident">Incident</label><select id="public-edit-incident" value={editIncident ?? ''} onChange={(event) => setEditIncident(event.target.value as IncidentType)} disabled={Boolean(busy)}><option value="false_start">False Start</option><option value="lane_infringement">Lane Infringement</option><option value="dq">Disqualified (DQ)</option><option value="dnf">Did Not Finish (DNF)</option><option value="dns">Did Not Start (DNS)</option></select></>}<div className={styles.modalActions}><Button variant="secondary" onClick={() => setEditing(null)} disabled={Boolean(busy)}>Cancel</Button><Button onClick={() => void saveEdit()} disabled={Boolean(busy)}>{busy ? 'Saving...' : 'Save Changes'}</Button></div></div>}</Modal></main>;
}
