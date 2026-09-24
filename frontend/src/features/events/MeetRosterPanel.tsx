import { useEffect, useState } from 'react';
import * as meets from '../../api/meets';
import { listAthletes } from '../../api/athletes';
import { Button } from '../../components';
import type { Athlete, AthleticsEvent } from '../../types';
import type { DisciplineDefinition, DisciplineSession, MeetEntrant, SessionRegistration } from '../../types/meets';

export function MeetRosterPanel({ event, canOperate, isCoach }: { event: AthleticsEvent; canOperate: boolean; isCoach: boolean }) {
  const [definitions, setDefinitions] = useState<DisciplineDefinition[]>([]);
  const [sessions, setSessions] = useState<DisciplineSession[]>([]);
  const [entrants, setEntrants] = useState<MeetEntrant[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [registrations, setRegistrations] = useState<SessionRegistration[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [definitionId, setDefinitionId] = useState('');
  const [label, setLabel] = useState('');
  const [athleteId, setAthleteId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestClubName, setGuestClubName] = useState('');
  const [guestDetails, setGuestDetails] = useState('');
  const [relayName, setRelayName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [entrantId, setEntrantId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = sessions.find((session) => session.id === sessionId);
  const definition = definitions.find((item) => item.id === selected?.disciplineDefinitionId);
  const editable = isCoach && event.status === 'scheduled';

  const reload = async () => {
    const [catalogue, nextSessions, nextEntrants, roster] = await Promise.all([
      meets.listDisciplines(), meets.listSessions(event.id), meets.listEntrants(event.id), listAthletes({ status: 'active' }),
    ]);
    setDefinitions(catalogue.data); setSessions(nextSessions.data); setEntrants(nextEntrants.data); setAthletes(roster.data);
    if (sessionId) setRegistrations((await meets.listRegistrations(event.id, sessionId)).data);
  };
  useEffect(() => { void reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load meet setup')); }, [event.id, sessionId]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save meet setup'); } finally { setBusy(false); }
  };
  const activeRegistration = (id: string) => registrations.some((registration) => registration.entrantId === id && !registration.withdrawnAt);
  const addAthlete = () => run(async () => {
    if (!athleteId) return;
    const entrant = entrants.find((item) => item.athleteId === athleteId) ?? await meets.createEntrant(event.id, { kind: 'athlete', athleteId });
    if (sessionId && !activeRegistration(entrant.id)) await meets.registerEntrant(event.id, { disciplineSessionId: sessionId, entrantId: entrant.id });
    setAthleteId('');
  });
  const addGuest = () => run(async () => {
    const entrant = await meets.createEntrant(event.id, { kind: 'guest', name: guestName, clubName: guestClubName.trim() || null, details: guestDetails.trim() || null });
    if (sessionId) await meets.registerEntrant(event.id, { disciplineSessionId: sessionId, entrantId: entrant.id });
    setGuestName('');
    setGuestClubName('');
    setGuestDetails('');
  });
  const addRelay = () => run(async () => {
    const entrant = await meets.createEntrant(event.id, { kind: 'relay', name: relayName, memberIds });
    if (sessionId) await meets.registerEntrant(event.id, { disciplineSessionId: sessionId, entrantId: entrant.id });
    setRelayName(''); setMemberIds([]);
  });

  return <section aria-label="Multi-discipline meet roster" aria-busy={busy}>
    <h2>Meet sessions and roster</h2>
    <p>Generic meet sessions use an independent shared entrant pool. Legacy 100m participants and timeline controls do not apply here.</p>
    {error && <p role="alert">{error}</p>}
    {canOperate && ['scheduled', 'in_progress'].includes(event.status) && <form onSubmit={(form) => { form.preventDefault(); void run(async () => {
      const selectedDefinition = definitions.find((item) => item.id === definitionId);
      if (!selectedDefinition) return;
      const created = await meets.createSession(event.id, { disciplineDefinitionId: definitionId, label: label.trim() || selectedDefinition.presentation.label });
      setSessionId(created.id); setDefinitionId(''); setLabel('');
    }); }}>
      <label>Discipline <select required value={definitionId} onChange={(input) => setDefinitionId(input.target.value)}><option value="">Choose discipline</option>{definitions.filter((item) => item.kind !== 'vertical').map((item) => <option key={item.id} value={item.id}>{item.presentation.label}</option>)}</select></label>
      <label>Session label <input value={label} onChange={(input) => setLabel(input.target.value)} placeholder="Optional session name" /></label>
      <Button type="submit" disabled={busy}>Add session</Button>
    </form>}
    <label>Session <select value={sessionId} onChange={(input) => { setSessionId(input.target.value); setEntrantId(''); }}><option value="">Choose session</option>{sessions.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.status})</option>)}</select></label>
    {selected && <><p>{definition?.presentation.label ?? 'Catalogue discipline'}: {selected.status}. {selected.status === 'scheduled' && event.status === 'scheduled' ? 'Roster changes are open.' : 'Roster changes are closed.'}</p>
      {canOperate && selected.status === 'scheduled' && event.status === 'in_progress' && <Button onClick={() => void run(async () => { await meets.changeSessionState(event.id, selected.id, 'in_progress', selected.version); })} disabled={busy}>Start session</Button>}
      {canOperate && selected.status === 'in_progress' && event.status === 'in_progress' && <Button variant="secondary" onClick={() => void run(async () => { await meets.changeSessionState(event.id, selected.id, 'completed', selected.version); })} disabled={busy}>Complete session</Button>}
      {editable && <div>
        <h3>Add to shared entrant pool</h3>
        <label>Athlete <select value={athleteId} onChange={(input) => setAthleteId(input.target.value)}><option value="">Choose active athlete</option>{athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}</select></label><Button onClick={() => void addAthlete()} disabled={busy || !athleteId}>Add athlete</Button>
        <fieldset><legend>Guest entrant</legend><label>Guest name <input value={guestName} onChange={(input) => setGuestName(input.target.value)} /></label><label>Guest club (optional) <input value={guestClubName} onChange={(input) => setGuestClubName(input.target.value)} maxLength={120} /></label><label>Guest details (optional) <textarea value={guestDetails} onChange={(input) => setGuestDetails(input.target.value)} maxLength={2000} /></label><Button onClick={() => void addGuest()} disabled={busy || !guestName.trim()}>Add guest</Button></fieldset>
        <fieldset><legend>Relay team (legs are listed in selection order)</legend><label>Team name <input value={relayName} onChange={(input) => setRelayName(input.target.value)} /></label>{entrants.filter((item) => item.kind !== 'relay').map((item) => <label key={item.id}><input type="checkbox" checked={memberIds.includes(item.id)} onChange={(input) => setMemberIds((current) => input.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /> {item.name}</label>)}<Button onClick={() => void addRelay()} disabled={busy || !relayName.trim() || memberIds.length < 2}>Add relay</Button></fieldset>
      </div>}
      <h3>Session registrations</h3>
      <label>Entrant <select value={entrantId} onChange={(input) => setEntrantId(input.target.value)}><option value="">Choose entrant</option>{entrants.filter((item) => (item.kind === 'relay') === (definition?.defaultRules.entrantType === 'relay')).map((item) => <option key={item.id} value={item.id}>{item.name}{activeRegistration(item.id) ? ' (registered)' : ''}</option>)}</select></label>
      {editable && entrantId && !activeRegistration(entrantId) && <Button onClick={() => void run(async () => { await meets.registerEntrant(event.id, { disciplineSessionId: sessionId, entrantId }); })} disabled={busy}>Register for session</Button>}
      {isCoach && selected.status === 'scheduled' && event.status !== 'cancelled' && entrantId && activeRegistration(entrantId) && <Button variant="secondary" onClick={() => void run(async () => { await meets.withdrawEntrant(event.id, { disciplineSessionId: sessionId, entrantId }); })} disabled={busy}>Withdraw from session</Button>}
      <ul aria-label="Registered entrants">{registrations.map((registration) => { const entrant = entrants.find((item) => item.id === registration.entrantId); return <li key={registration.id}><span>{entrant?.name ?? 'Entrant'}: {registration.withdrawnAt ? 'withdrawn' : 'registered'}</span>{entrant?.clubName && <span> ({entrant.clubName})</span>}{entrant?.details && <span> - {entrant.details}</span>}</li>; })}</ul>
    </>}
  </section>;
}
