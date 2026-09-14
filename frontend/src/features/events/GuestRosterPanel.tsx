import { useEffect, useState } from 'react';
import { listAthletes } from '../../api/athletes';
import {
  addGuestFixtureParticipant,
  listGuestFixtureParticipants,
  removeGuestFixtureParticipant,
  updateGuestFixtureParticipant,
} from '../../api/fixtures';
import { Button, Select } from '../../components';
import type { Athlete, EventParticipantSummary, RsvpStatus } from '../../types';
import { errorMessage } from './EventsPage';
import styles from './EventsPage.module.css';

export function GuestRosterPanel({ eventId, scheduled, onChanged }: { eventId: string; scheduled: boolean; onChanged: () => void }) {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [participants, setParticipants] = useState<EventParticipantSummary[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [rsvpFilter, setRsvpFilter] = useState<RsvpStatus | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void Promise.all([listAthletes({ status: 'active' }), listGuestFixtureParticipants(eventId)])
      .then(([athleteResponse, participantResponse]) => {
        setAthletes(athleteResponse.data.filter((athlete) => athlete.status === 'active'));
        setParticipants(participantResponse.data);
      })
      .catch((loadError: unknown) => setError(errorMessage(loadError)));
  };

  useEffect(load, [eventId]);
  const candidates = athletes.filter((athlete) => !participants.some((participant) => participant.athleteId === athlete.id));
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await operation(); load(); onChanged(); } catch (requestError) { setError(errorMessage(requestError)); } finally { setBusy(false); }
  };

  const rsvpCounts = participants.reduce<Record<RsvpStatus, number>>((counts, participant) => ({ ...counts, [participant.rsvpStatus]: counts[participant.rsvpStatus] + 1 }), { pending: 0, yes: 0, no: 0, maybe: 0 });

  return <section className={styles.participants} aria-labelledby={`guest-participants-${eventId}`} aria-busy={busy}>
    <header><div><p>Event roster</p><h3 id={`guest-participants-${eventId}`}>Assigned athletes <span>{participants.length}</span></h3></div><div className={styles.rosterFilter}><span>Roster filter</span><Select aria-label="Roster filter" value={rsvpFilter} onChange={(event) => setRsvpFilter(event.target.value as RsvpStatus | 'all')} options={[{ value: 'all', label: 'All athletes' }, { value: 'yes', label: 'Attending' }, { value: 'maybe', label: 'Maybe attending' }, { value: 'pending', label: 'Pending' }, { value: 'no', label: 'Not attending' }]} /></div></header>
    {error && <p role="alert">{error}</p>}
    {scheduled && <div className={styles.assignment}>
      <span>Assign an active athlete</span>
      <Select id={`guest-athlete-${eventId}`} value={candidateId} onChange={(event) => setCandidateId(event.target.value)} options={[{ value: '', label: candidates.length ? 'Choose an athlete' : 'No active athletes available' }, ...candidates.map((athlete) => ({ value: athlete.id, label: athlete.name }))]} disabled={busy} />
      <Button disabled={busy || !candidateId} onClick={() => void run(async () => { await addGuestFixtureParticipant(eventId, candidateId); setCandidateId(''); })}>Assign athlete</Button>
    </div>}
    {participants.length === 0 ? <p className={styles.inlineEmpty}>No athletes are assigned to this event yet.</p> : <ul className={styles.participantList}>{participants.filter((participant) => rsvpFilter === 'all' || participant.rsvpStatus === rsvpFilter).map((participant) => <li key={participant.athleteId}><span className={styles.participantIdentity}><b>{participant.athlete.name}</b><small>{participant.athlete.squadNames?.join(', ') || 'No squad assigned'}</small></span>{scheduled && <><span className={styles.srOnly}>RSVP for {participant.athlete.name}</span><Select id={`guest-rsvp-${participant.athleteId}`} aria-label={`RSVP for ${participant.athlete.name}`} value={participant.rsvpStatus} onChange={(event) => void run(async () => { await updateGuestFixtureParticipant(eventId, participant.athleteId, event.target.value as RsvpStatus); })} options={[{ value: 'pending', label: 'Pending' }, { value: 'yes', label: 'Attending' }, { value: 'no', label: 'Not attending' }, { value: 'maybe', label: 'Maybe' }]} disabled={busy} /><Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await removeGuestFixtureParticipant(eventId, participant.athleteId); })}>Remove</Button></>}</li>)}</ul>}
    <div className={styles.rsvpSummary}><strong>RSVP</strong><span>Pending {rsvpCounts.pending} · Yes {rsvpCounts.yes} · No {rsvpCounts.no} · Maybe {rsvpCounts.maybe}</span></div>
  </section>;
}
