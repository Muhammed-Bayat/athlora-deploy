import { useEffect, useState } from 'react';
import { listAthletes } from '../../api/athletes';
import {
  addGuestFixtureParticipant,
  removeGuestFixtureParticipant,
  updateGuestFixtureParticipant,
} from '../../api/fixtures';
import { listEventParticipants } from '../../api/participants';
import { Button, Card, Select } from '../../components';
import type { Athlete, EventParticipantSummary, RsvpStatus } from '../../types';
import { errorMessage } from './EventsPage';
import { useWorkspace } from '../auth/WorkspaceContext';

export function GuestRosterPanel({ eventId, scheduled, onChanged }: { eventId: string; scheduled: boolean; onChanged: () => void }) {
  const { activeWorkspace } = useWorkspace();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [participants, setParticipants] = useState<EventParticipantSummary[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void Promise.all([listAthletes({ status: 'active' }), listEventParticipants(eventId)])
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

  return <Card>
    <header><p>Shared event roster</p><h3>Participating athletes</h3><p>All teams can view the roster. Only your club can change its athletes.</p></header>
    {error && <p role="alert">{error}</p>}
    {scheduled && <div>
      <label htmlFor={`guest-athlete-${eventId}`}>Assign active athlete</label>
      <Select id={`guest-athlete-${eventId}`} value={candidateId} onChange={(event) => setCandidateId(event.target.value)} options={[{ value: '', label: candidates.length ? 'Choose an athlete' : 'No active athletes available' }, ...candidates.map((athlete) => ({ value: athlete.id, label: athlete.name }))]} disabled={busy} />
      <Button disabled={busy || !candidateId} onClick={() => void run(async () => { await addGuestFixtureParticipant(eventId, candidateId); setCandidateId(''); })}>Assign athlete</Button>
    </div>}
    {participants.length === 0 ? <p>No athletes selected yet.</p> : <ul>{participants.map((participant) => <li key={participant.athleteId}><strong>{participant.athlete.name}</strong>{participant.participantWorkspaceName && <span> · {participant.participantWorkspaceName}</span>}{scheduled && (participant.participantWorkspaceId === undefined || participant.participantWorkspaceId === activeWorkspace.id) && <><label htmlFor={`guest-rsvp-${participant.athleteId}`}> RSVP</label><Select id={`guest-rsvp-${participant.athleteId}`} value={participant.rsvpStatus} onChange={(event) => void run(async () => { await updateGuestFixtureParticipant(eventId, participant.athleteId, event.target.value as RsvpStatus); })} options={[{ value: 'pending', label: 'Pending' }, { value: 'yes', label: 'Attending' }, { value: 'no', label: 'Not attending' }, { value: 'maybe', label: 'Maybe' }]} disabled={busy} /><Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await removeGuestFixtureParticipant(eventId, participant.athleteId); })}>Remove</Button></>}</li>)}</ul>}
  </Card>;
}
