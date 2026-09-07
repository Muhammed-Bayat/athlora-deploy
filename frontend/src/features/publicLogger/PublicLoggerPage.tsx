import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { createPublicLoggerEntry, getPublicLoggerSnapshot, startPublicLoggerSession } from '../../api/publicLoggers';
import type { IncidentType, PublicLoggerSnapshot } from '../../types';
import { Button, Input } from '../../components';
import styles from './PublicLoggerPage.module.css';

const SESSION_KEY = 'athlora_public_logger_session';
const EVENT_KEY = 'athlora_public_logger_event';

function clearSession(): void { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(EVENT_KEY); }
function entryText(entry: PublicLoggerSnapshot['timeline'][number]): string {
  if (entry.entryType === 'attempt' && entry.value !== null) return `${entry.value.toFixed(2)} seconds`;
  return entry.incidentType?.replace('_', ' ') ?? entry.entryType;
}

export function PublicLoggerPage() {
  const { token } = useParams();
  const [name, setName] = useState('');
  const [club, setClub] = useState('Independent');
  const [session, setSession] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PublicLoggerSnapshot | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState('');
  const [time, setTime] = useState('');
  const [incident, setIncident] = useState<Exclude<IncidentType, null>>('false_start');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (sessionToken: string, eventId: string) => {
    const next = await getPublicLoggerSnapshot(sessionToken, eventId);
    setSnapshot(next);
    setSelectedAthlete((current) => current || next.participants[0]?.athleteId || '');
  };
  useEffect(() => {
    const storedSession = sessionStorage.getItem(SESSION_KEY);
    const eventId = sessionStorage.getItem(EVENT_KEY);
    if (!storedSession || !eventId) return;
    void load(storedSession, eventId).then(() => setSession(storedSession)).catch(clearSession);
  }, []);
  const open = async (event: React.FormEvent) => {
    event.preventDefault(); if (!token) return;
    setBusy(true); setError(null);
    try {
      const next = await startPublicLoggerSession(token, name, club);
      sessionStorage.setItem(SESSION_KEY, next.sessionToken); sessionStorage.setItem(EVENT_KEY, next.snapshot.event.id);
      setSession(next.sessionToken); setSnapshot(next.snapshot); setSelectedAthlete(next.snapshot.participants[0]?.athleteId ?? '');
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to open this logger.'); } finally { setBusy(false); }
  };
  const refresh = async () => {
    if (!session || !snapshot) return;
    setBusy(true); setError(null);
    try { await load(session, snapshot.event.id); } catch (requestError) { clearSession(); setSession(null); setSnapshot(null); setError(requestError instanceof Error ? requestError.message : 'This logger is no longer available.'); } finally { setBusy(false); }
  };
  const record = async (entryType: 'attempt' | 'penalty') => {
    if (!session || !snapshot || !selectedAthlete) return;
    setBusy(true); setError(null);
    try {
      await createPublicLoggerEntry(session, snapshot.event.id, entryType === 'attempt'
        ? { athleteId: selectedAthlete, entryType, value: Number(time), unit: 'seconds', isFoul: false, incidentType: null, noteText: null }
        : { athleteId: selectedAthlete, entryType, value: null, unit: null, isFoul: false, incidentType: incident, noteText: null });
      setTime(''); await refresh();
    } catch (requestError) { if (requestError instanceof ApiError && requestError.code === 'PUBLIC_LOGGER_SESSION_INVALID') clearSession(); setError(requestError instanceof Error ? requestError.message : 'Could not record this entry.'); } finally { setBusy(false); }
  };

  if (!snapshot) return <main className={styles.page}><section className={styles.join}><p className={styles.kicker}>Athlora public logger</p><h1>Join event logging</h1><p>Identify this track-side logging session before recording.</p><form onSubmit={(event) => void open(event)}><label htmlFor="logger-name">Name</label><Input id="logger-name" value={name} onChange={(event) => setName(event.target.value)} required disabled={busy} /><label htmlFor="logger-club">Club or organization</label><Input id="logger-club" value={club} onChange={(event) => setClub(event.target.value)} required disabled={busy} />{error && <p role="alert">{error}</p>}<Button type="submit" disabled={busy || !token}>{busy ? 'Opening...' : 'Open logger'}</Button></form></section></main>;

  const loggingOpen = snapshot.event.status === 'in_progress';
  const selected = snapshot.participants.find((participant) => participant.athleteId === selectedAthlete);
  return <main className={styles.page}><header className={styles.header}><div><p className={styles.kicker}>Athlora public logger</p><h1>{snapshot.event.title}</h1><p>{loggingOpen ? 'Live logging open' : 'Waiting for event start'}</p></div><Button variant="secondary" onClick={() => void refresh()} disabled={busy}>Refresh</Button></header>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.workspace}><section className={styles.roster}><h2>Assigned athletes <span>{snapshot.participants.length}</span></h2>{snapshot.participants.map((participant) => <button key={participant.athleteId} className={participant.athleteId === selectedAthlete ? styles.selected : ''} type="button" onClick={() => setSelectedAthlete(participant.athleteId)} disabled={busy || !loggingOpen}><strong>{participant.name}</strong><small>{participant.teamName ?? 'Team not recorded'}</small></button>)}</section><section className={styles.logger}><h2>{selected?.name ?? 'Select an athlete'}</h2><p>{selected?.teamName ?? 'Choose a participant to record an entry.'}</p>{loggingOpen ? <><label htmlFor="attempt-time">100m time in seconds</label><div className={styles.actionRow}><Input id="attempt-time" inputMode="decimal" value={time} onChange={(event) => setTime(event.target.value)} placeholder="10.25" disabled={busy} /><Button onClick={() => void record('attempt')} disabled={busy || !selectedAthlete || !Number.isFinite(Number(time)) || Number(time) <= 0}>Record attempt</Button></div><label htmlFor="incident-type">Incident</label><div className={styles.actionRow}><select id="incident-type" value={incident} onChange={(event) => setIncident(event.target.value as Exclude<IncidentType, null>)} disabled={busy}><option value="false_start">False start</option><option value="dq">Disqualified</option><option value="dnf">Did not finish</option><option value="dns">Did not start</option><option value="lane_infringement">Lane infringement</option></select><Button variant="secondary" onClick={() => void record('penalty')} disabled={busy || !selectedAthlete}>Record incident</Button></div></> : <p>Logging opens when the event is in progress.</p>}</section><section className={styles.timeline}><h2>Live timeline</h2>{snapshot.timeline.length === 0 ? <p>No entries recorded.</p> : <ul>{snapshot.timeline.map((entry) => { const participant = snapshot.participants.find((item) => item.athleteId === entry.athleteId); return <li key={entry.id}><strong>{participant?.name ?? 'Athlete'}</strong><small>{participant?.teamName}</small><span>{entryText(entry)}</span></li>; })}</ul>}</section></div></main>;
}
