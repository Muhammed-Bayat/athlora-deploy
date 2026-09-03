import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { createPublicLoggerEntry, getPublicLoggerSnapshot, startPublicLoggerSession } from '../../api/publicLoggers';
import type { IncidentType, PublicLoggerSnapshot } from '../../types';
import { Button, Input } from '../../components';
import styles from './PublicLoggerPage.module.css';

const SESSION_KEY = 'athlora_public_logger_session';
const EVENT_KEY = 'athlora_public_logger_event';

function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(EVENT_KEY);
}

function timelineDescription(entry: PublicLoggerSnapshot['timeline'][number]): string {
  if (entry.entryType === 'attempt' && entry.value !== null) return `${entry.value.toFixed(2)} seconds`;
  if (entry.incidentType) return entry.incidentType.replace('_', ' ');
  return entry.entryType;
}

export function PublicLoggerPage() {
  const { token } = useParams();
  const [name, setName] = useState('');
  const [club, setClub] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PublicLoggerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState('');
  const [incident, setIncident] = useState<Exclude<IncidentType, null>>('false_start');

  useEffect(() => {
    const storedSession = sessionStorage.getItem(SESSION_KEY);
    const eventId = sessionStorage.getItem(EVENT_KEY);
    if (!storedSession || !eventId) return;
    let current = true;
    void getPublicLoggerSnapshot(storedSession, eventId).then((next) => {
      if (current) { setSession(storedSession); setSnapshot(next); setSelectedAthlete(next.participants[0]?.athleteId ?? ''); }
    }).catch(() => { clearSession(); });
    return () => { current = false; };
  }, []);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setBusy(true); setError(null);
    try {
      const next = await startPublicLoggerSession(token, name, club);
      sessionStorage.setItem(SESSION_KEY, next.sessionToken);
      sessionStorage.setItem(EVENT_KEY, next.snapshot.event.id);
      setSession(next.sessionToken); setSnapshot(next.snapshot); setSelectedAthlete(next.snapshot.participants[0]?.athleteId ?? '');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to open this logger.');
    } finally { setBusy(false); }
  };

  const refresh = async () => {
    if (!session || !snapshot) return;
    setBusy(true); setError(null);
    try { setSnapshot(await getPublicLoggerSnapshot(session, snapshot.event.id)); }
    catch (requestError) {
      clearSession(); setSession(null); setSnapshot(null);
      setError(requestError instanceof Error ? requestError.message : 'This logger is no longer available.');
    } finally { setBusy(false); }
  };

  const addEntry = async (kind: 'attempt' | 'penalty') => {
    if (!session || !snapshot || !selectedAthlete) return;
    setBusy(true); setError(null);
    try {
      const payload = kind === 'attempt'
        ? { athleteId: selectedAthlete, entryType: 'attempt' as const, value: Number(time), unit: 'seconds' as const, isFoul: false as const, incidentType: null, noteText: null }
        : { athleteId: selectedAthlete, entryType: 'penalty' as const, value: null, unit: null, isFoul: false as const, incidentType: incident, noteText: null };
      await createPublicLoggerEntry(session, snapshot.event.id, payload);
      if (kind === 'attempt') setTime('');
      await refresh();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'PUBLIC_LOGGER_SESSION_INVALID') clearSession();
      setError(requestError instanceof Error ? requestError.message : 'Could not record this entry.');
    } finally { setBusy(false); }
  };

  if (!snapshot) return <main className={styles.page}><section className={styles.card}><p className={styles.kicker}>Athlora public logger</p><h1>Join event logging</h1><p>Enter the name and club that should identify your logging session.</p><form onSubmit={(event) => void start(event)} className={styles.form}><label htmlFor="logger-name">Name</label><Input id="logger-name" value={name} onChange={(event) => setName(event.target.value)} required disabled={busy} /><label htmlFor="logger-club">Club</label><Input id="logger-club" value={club} onChange={(event) => setClub(event.target.value)} required disabled={busy} />{error && <p role="alert">{error}</p>}<Button type="submit" disabled={busy || !token}>{busy ? 'Opening...' : 'Open logger'}</Button></form></section></main>;

  const loggingOpen = snapshot.event.status === 'in_progress';
  return <main className={styles.page}><section className={styles.card}><header className={styles.header}><div><p className={styles.kicker}>Athlora public logger</p><h1>{snapshot.event.title}</h1><p className={styles.status}>Status: {snapshot.event.status.replace('_', ' ')}</p></div><Button variant="secondary" onClick={() => void refresh()} disabled={busy}>Refresh</Button></header>{error && <p role="alert">{error}</p>}<section><h2>Participants</h2><div className={styles.participants}>{snapshot.participants.map((participant) => <button key={participant.athleteId} type="button" className={selectedAthlete === participant.athleteId ? styles.selected : ''} onClick={() => setSelectedAthlete(participant.athleteId)} disabled={!loggingOpen || busy}>{participant.name}</button>)}</div></section>{loggingOpen ? <section className={styles.logForm}><h2>Record entry</h2><label htmlFor="attempt-time">100m time in seconds</label><div className={styles.actions}><Input id="attempt-time" inputMode="decimal" value={time} onChange={(event) => setTime(event.target.value)} placeholder="e.g. 11.42" disabled={busy} /><Button onClick={() => void addEntry('attempt')} disabled={busy || !selectedAthlete || !Number.isFinite(Number(time)) || Number(time) <= 0}>Record attempt</Button></div><label htmlFor="incident-type">Incident</label><div className={styles.actions}><select id="incident-type" value={incident} onChange={(event) => setIncident(event.target.value as Exclude<IncidentType, null>)} disabled={busy}><option value="false_start">False start</option><option value="dq">Disqualified</option><option value="dnf">Did not finish</option><option value="dns">Did not start</option><option value="lane_infringement">Lane infringement</option></select><Button variant="secondary" onClick={() => void addEntry('penalty')} disabled={busy || !selectedAthlete}>Record incident</Button></div></section> : <p className={styles.readOnly}>Logging opens when the event is in progress.</p>}<section><h2>Timeline</h2>{snapshot.timeline.length === 0 ? <p>No timeline entries yet.</p> : <ol className={styles.timeline}>{snapshot.timeline.map((entry) => { const participant = snapshot.participants.find((item) => item.athleteId === entry.athleteId); return <li key={entry.id}><strong>{participant?.name ?? 'Participant'}</strong><span>{timelineDescription(entry)}</span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString()}</time></li>; })}</ol>}</section></section></main>;
}
