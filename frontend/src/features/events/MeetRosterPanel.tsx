import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import * as meets from '../../api/meets';
import { listAthletes } from '../../api/athletes';
import { addEventParticipant, listEventParticipants, updateEventParticipant } from '../../api/participants';
import { addGuestFixtureParticipant, listGuestFixtureParticipants, updateGuestFixtureParticipant } from '../../api/fixtures';
import { Button, Select } from '../../components';
import type { Athlete, AthleticsEvent, EventParticipantSummary, RsvpStatus } from '../../types';
import type { DisciplineDefinition, DisciplineSession, MeetEntrant, SessionRegistration } from '../../types/meets';
import { sortDisciplines } from '../../utils/disciplineOrder';
import styles from './MeetRosterPanel.module.css';

const RSVP_OPTIONS: Array<{ value: RsvpStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'yes', label: 'Attending' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'Not attending' },
];

function entrantDescription(entrant: MeetEntrant, entrants: MeetEntrant[]): string {
  if (entrant.kind === 'relay') {
    const legs = entrant.memberIds.map((id, index) => `${index + 1}. ${entrants.find((item) => item.id === id)?.name ?? 'Member'}`).join(' -> ');
    return legs ? `Relay team: ${legs}` : 'Relay team';
  }
  if (entrant.kind === 'guest') return entrant.clubName ? `External entrant - ${entrant.clubName}` : 'External entrant';
  return 'Athlete';
}

export function MeetRosterPanel({ event, canOperate, isCoach, activeWorkspaceId, isGuest }: { event: AthleticsEvent; canOperate: boolean; isCoach: boolean; activeWorkspaceId: string; isGuest: boolean }) {
  const [definitions, setDefinitions] = useState<DisciplineDefinition[]>([]);
  const [sessions, setSessions] = useState<DisciplineSession[]>([]);
  const [entrants, setEntrants] = useState<MeetEntrant[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [participants, setParticipants] = useState<EventParticipantSummary[]>([]);
  const [registrations, setRegistrations] = useState<SessionRegistration[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [rsvpFilter, setRsvpFilter] = useState<RsvpStatus | 'all'>('all');
  const [athletePickerOpen, setAthletePickerOpen] = useState(false);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [relayName, setRelayName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [editingRelayId, setEditingRelayId] = useState('');
  const [editRelayName, setEditRelayName] = useState('');
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sessionTabRefs = useRef(new Map<string, HTMLButtonElement>());
  const reloadRequestRef = useRef(0);
  const selected = sessions.find((session) => session.id === sessionId);
  const definition = definitions.find((item) => item.id === selected?.disciplineDefinitionId);
  const relaySession = definition?.defaultRules.entrantType === 'relay';
  const canAddToRoster = isCoach && event.status === 'scheduled' && selected?.status === 'scheduled';
  const canUpdateRsvp = isCoach && event.status !== 'cancelled' && Boolean(selected) && !['completed', 'cancelled'].includes(selected?.status ?? 'cancelled');

  const reload = useCallback(async () => {
    const request = ++reloadRequestRef.current;
    const [catalogue, nextSessions, nextEntrants, roster, eventParticipants] = await Promise.all([
      meets.listDisciplines(), meets.listSessions(event.id), meets.listEntrants(event.id), listAthletes({ status: 'active' }), isGuest ? listGuestFixtureParticipants(event.id) : listEventParticipants(event.id),
    ]);
    if (request !== reloadRequestRef.current) return;
    setDefinitions(catalogue.data);
    setSessions(sortDisciplines(nextSessions.data, (session) => catalogue.data.find((item) => item.id === session.disciplineDefinitionId)?.code ?? session.disciplineDefinitionId));
    setEntrants(nextEntrants.data);
    setAthletes(roster.data);
    setParticipants(eventParticipants.data);
    if (!sessionId) {
      setRegistrations([]);
      return;
    }
    const nextRegistrations = await meets.listRegistrations(event.id, sessionId);
    if (request === reloadRequestRef.current) setRegistrations(nextRegistrations.data);
  }, [event.id, isGuest, sessionId]);

  useEffect(() => { void reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load the event roster')); }, [reload]);

  useEffect(() => {
    if (sessions.some((session) => session.id === sessionId)) return;
    setSessionId(sessions[0]?.id ?? '');
  }, [sessionId, sessions]);

  const run = async (action: () => Promise<void>, reloadAfter = true) => {
    setBusy(true);
    setError('');
    try {
      await action();
      if (reloadAfter) await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the event roster');
    } finally {
      setBusy(false);
    }
  };

  const selectSession = (nextSessionId: string, focus = false) => {
    setSessionId(nextSessionId);
    setAthletePickerOpen(false);
    setSelectedAthleteIds([]);
    setEditingRelayId('');
    if (focus) window.requestAnimationFrame(() => sessionTabRefs.current.get(nextSessionId)?.focus());
  };

  const moveSessionTab = (currentId: string, offset: number) => {
    const currentIndex = sessions.findIndex((session) => session.id === currentId);
    const next = sessions[(currentIndex + offset + sessions.length) % sessions.length];
    if (next) selectSession(next.id, true);
  };

  const participantFor = (entrant: MeetEntrant) => entrant.athleteId ? participants.find((participant) => participant.athleteId === entrant.athleteId) : undefined;
  const rsvpFor = (entrant: MeetEntrant | undefined): RsvpStatus | null => entrant?.athleteId ? participantFor(entrant)?.rsvpStatus ?? 'pending' : null;
  const ownsEntrant = (entrant: MeetEntrant) => entrant.workspaceId === activeWorkspaceId;
  const activeRegistrations = registrations.filter((registration) => {
    const entrant = entrants.find((item) => item.id === registration.entrantId);
    return !registration.withdrawnAt && Boolean(entrant && ownsEntrant(entrant));
  });
  const visibleRegistrations = activeRegistrations.filter((registration) => {
    if (relaySession || rsvpFilter === 'all') return true;
    const entrant = entrants.find((item) => item.id === registration.entrantId);
    return rsvpFor(entrant) === rsvpFilter;
  });
  const rsvpCounts = activeRegistrations.reduce<Record<RsvpStatus, number>>((counts, registration) => {
    const entrant = entrants.find((item) => item.id === registration.entrantId);
    const rsvpStatus = rsvpFor(entrant);
    return rsvpStatus ? { ...counts, [rsvpStatus]: counts[rsvpStatus] + 1 } : counts;
  }, { pending: 0, yes: 0, no: 0, maybe: 0 });
  const registeredEntrantIds = new Set(activeRegistrations.map((registration) => registration.entrantId));
  const athleteMatchesSession = (athlete: Athlete | undefined) => Boolean(athlete && selected?.disciplineDefinitionId && athlete.preferredDisciplineIds.includes(selected.disciplineDefinitionId));
  const availableAthletes = athletes.filter((athlete) => {
    const entrant = entrants.find((item) => item.athleteId === athlete.id);
    return athleteMatchesSession(athlete) && (relaySession ? !entrant : !entrant || !registeredEntrantIds.has(entrant.id));
  });
  const athleteEntrants = entrants.filter((entrant) => entrant.kind === 'athlete' && ownsEntrant(entrant) && athleteMatchesSession(athletes.find((athlete) => athlete.id === entrant.athleteId)));
  const relaySize = definition?.defaultRules.teamSize ?? 2;
  const canManageEntrant = (entrant: MeetEntrant) => isCoach && canUpdateRsvp && ownsEntrant(entrant);
  const relayReadiness = (ids: string[]) => {
    const members = ids.map((id) => athleteEntrants.find((item) => item.id === id)).filter((item): item is MeetEntrant => Boolean(item));
    const declined = members.filter((item) => rsvpFor(item) === 'no').map((item) => item.name);
    const allAttending = members.length === relaySize && members.every((item) => rsvpFor(item) === 'yes');
    const message = declined.length > 0
      ? `${declined[0]} is not attending. A relay needs ${relaySize} attending athletes — remove them and select a new athlete.`
      : members.length > 0 && members.length < relaySize
        ? `You need ${relaySize} athletes for a relay — select ${relaySize - members.length} more.`
        : members.length === relaySize && !allAttending
          ? `Set all ${relaySize} athletes to Attending to name the team.`
          : '';
    return { allAttending, needsReplacement: declined.length > 0, message };
  };
  const readiness = relayReadiness(memberIds);
  const poolCounts = athleteEntrants.reduce<Record<RsvpStatus, number>>((counts, entrant) => {
    const status = rsvpFor(entrant);
    return status ? { ...counts, [status]: counts[status] + 1 } : counts;
  }, { pending: 0, yes: 0, no: 0, maybe: 0 });
  const renderMemberChoices = (ids: string[], setIds: Dispatch<SetStateAction<string[]>>) => athleteEntrants.map((entrant) => {
    const leg = ids.indexOf(entrant.id);
    const checked = leg >= 0;
    const atCapacity = ids.length >= relaySize && !checked;
    return <div className={styles.memberChoice} key={entrant.id}>
      <label className={styles.memberPick}>
        <input type="checkbox" checked={checked} disabled={atCapacity} onChange={(input) => setIds((current) => input.target.checked ? [...current, entrant.id] : current.filter((id) => id !== entrant.id))} />
        {checked && <span className={styles.legNumber} aria-hidden="true">{leg + 1}</span>}
        <span>{entrant.name}<small>Athlete</small></span>
      </label>
      {canManageEntrant(entrant) && <Select aria-label={`RSVP for ${entrant.name}`} value={rsvpFor(entrant) ?? 'pending'} onChange={(input) => void updateRsvp(entrant, input.target.value as RsvpStatus)} options={RSVP_OPTIONS} disabled={busy} />}
    </div>;
  });

  const addSelectedAthletes = () => run(async () => {
    if (!selected) return;
    if (isGuest) {
      for (const athleteId of selectedAthleteIds) {
        const entrant = entrants.find((item) => item.athleteId === athleteId) ?? await meets.createEntrant(event.id, { kind: 'athlete', athleteId });
        if (!participants.some((participant) => participant.athleteId === athleteId)) await addGuestFixtureParticipant(event.id, athleteId);
        if (!relaySession && !registeredEntrantIds.has(entrant.id)) await meets.registerEntrant(event.id, { disciplineSessionId: selected.id, entrantId: entrant.id });
      }
      setSelectedAthleteIds([]);
      setAthletePickerOpen(false);
      await reload();
      return;
    }
    const added = await meets.bulkAddRoster(event.id, selected.id, selectedAthleteIds);
    setEntrants((current) => [...current, ...added.entrants]);
    setParticipants((current) => {
      const existing = new Set(current.map((participant) => participant.athleteId));
      return [...current, ...added.participants.filter((participant) => !existing.has(participant.athleteId)).map((participant) => ({
        ...participant,
        athlete: athletes.find((athlete) => athlete.id === participant.athleteId)!,
        statusReviewRequired: false,
      }))];
    });
    setRegistrations((current) => [...current.filter((registration) => !added.registrations.some((next) => next.id === registration.id)), ...added.registrations]);
    setSelectedAthleteIds([]);
    setAthletePickerOpen(false);
  }, false);

  const addRelay = () => run(async () => {
    if (!selected) return;
    const entrant = await meets.createEntrant(event.id, { kind: 'relay', name: relayName, memberIds });
    await meets.registerEntrant(event.id, { disciplineSessionId: selected.id, entrantId: entrant.id });
    setRelayName('');
    setMemberIds([]);
  });

  const updateRsvp = (entrant: MeetEntrant, rsvpStatus: RsvpStatus) => run(async () => {
    if (!entrant.athleteId) return;
    if (isGuest) {
      if (!participantFor(entrant)) await addGuestFixtureParticipant(event.id, entrant.athleteId);
      await updateGuestFixtureParticipant(event.id, entrant.athleteId, rsvpStatus);
    } else {
      if (!participantFor(entrant)) await addEventParticipant(event.id, entrant.athleteId);
      await updateEventParticipant(event.id, entrant.athleteId, rsvpStatus);
    }
  });

  const beginEditRelay = (relay: MeetEntrant) => {
    setEditingRelayId(relay.id);
    setEditRelayName(relay.name);
    setEditMemberIds(relay.memberIds);
  };

  const saveRelayEdit = () => run(async () => {
    await meets.updateEntrant(event.id, editingRelayId, { name: editRelayName, memberIds: editMemberIds });
    setEditingRelayId('');
  });

  return <section className={styles.roster} aria-label="Event roster" aria-busy={busy}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {sessions.length === 0 && <p className={styles.empty}>No discipline sessions have been added to this event yet.</p>}
    {sessions.length > 0 && <div className={styles.rosterCard}><div className={styles.sessionTabs} role="tablist" aria-label="Event discipline sessions">
      {sessions.map((session) => {
        const sessionDefinition = definitions.find((item) => item.id === session.disciplineDefinitionId);
        const active = session.id === sessionId;
        return <button key={session.id} ref={(node) => { if (node) sessionTabRefs.current.set(session.id, node); else sessionTabRefs.current.delete(session.id); }} type="button" role="tab" id={`meet-session-${session.id}-tab`} aria-selected={active} aria-controls={`meet-session-${session.id}-panel`} tabIndex={active ? 0 : -1} onClick={() => selectSession(session.id)} onKeyDown={(keyboardEvent) => {
          if (keyboardEvent.key === 'ArrowRight' || keyboardEvent.key === 'ArrowDown') { keyboardEvent.preventDefault(); moveSessionTab(session.id, 1); }
          if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'ArrowUp') { keyboardEvent.preventDefault(); moveSessionTab(session.id, -1); }
          if (keyboardEvent.key === 'Home') { keyboardEvent.preventDefault(); selectSession(sessions[0]!.id, true); }
          if (keyboardEvent.key === 'End') { keyboardEvent.preventDefault(); selectSession(sessions[sessions.length - 1]!.id, true); }
        }}>
          <span>{sessionDefinition?.presentation.label ?? 'Discipline'}</span>
          <small>{session.label === sessionDefinition?.presentation.label ? session.status.replace('_', ' ') : session.label}</small>
        </button>;
      })}
    </div>

    {selected && <div className={styles.sessionPanel} role="tabpanel" id={`meet-session-${selected.id}-panel`} aria-labelledby={`meet-session-${selected.id}-tab`} tabIndex={0}>
      <header className={styles.rosterHeader}>
        <div><p>Event roster</p><h2>Assigned {relaySession ? 'teams' : 'athletes'} <span>{activeRegistrations.length}</span></h2></div>
        {!relaySession && <div className={styles.rosterFilter}><span>Roster filter</span><Select aria-label="Roster filter" value={rsvpFilter} onChange={(input) => setRsvpFilter(input.target.value as RsvpStatus | 'all')} options={[{ value: 'all', label: 'All athletes' }, ...RSVP_OPTIONS]} /></div>}
      </header>

      {!isGuest && canOperate && selected.status === 'scheduled' && event.status === 'in_progress' && <Button className={styles.sessionAction} onClick={() => void run(async () => { await meets.changeSessionState(event.id, selected.id, 'in_progress', selected.version); })} disabled={busy}>Start session</Button>}
      {!isGuest && canOperate && selected.status === 'in_progress' && event.status === 'in_progress' && <Button className={styles.sessionAction} variant="secondary" onClick={() => void run(async () => {
        await meets.queueSessionFinalization(event.id, selected.id, selected.version);
      })} disabled={busy}>Complete session</Button>}

      {canAddToRoster && <div className={styles.addAthletes}>
        <div><strong>{relaySession ? 'Build a relay team' : 'Add athletes'}</strong><p>{relaySession ? 'Add athletes with this relay discipline to the event pool, then choose their relay legs below.' : `Add athletes with ${definition?.presentation.label ?? 'this discipline'} selected to the roster.`}</p></div>
        <Button variant="secondary" onClick={() => setAthletePickerOpen((open) => !open)} disabled={busy || availableAthletes.length === 0}>{athletePickerOpen ? 'Close athlete picker' : relaySession ? 'Add relay athletes' : 'Add athletes'}</Button>
      </div>}

      {athletePickerOpen && <section className={styles.athletePicker} aria-label={`Add athletes to ${definition?.presentation.label ?? 'session'} roster`}>
        <div><h3>Choose athletes</h3><p>Select one or more active athletes who have this discipline selected.</p></div>
        {availableAthletes.length === 0 && <p className={styles.empty}>No eligible active athletes are available for {definition?.presentation.label ?? 'this discipline'}.</p>}
        {availableAthletes.length > 0 && <div className={styles.athleteChoices}>{availableAthletes.map((athlete) => <label className={styles.athleteChoice} key={athlete.id}><input type="checkbox" checked={selectedAthleteIds.includes(athlete.id)} onChange={(input) => setSelectedAthleteIds((current) => input.target.checked ? [...current, athlete.id] : current.filter((id) => id !== athlete.id))} /><span><strong>{athlete.name}</strong></span></label>)}</div>}
        <div className={styles.pickerActions}><Button onClick={() => void addSelectedAthletes()} disabled={busy || selectedAthleteIds.length === 0}>{relaySession ? `Add ${selectedAthleteIds.length || ''} athlete${selectedAthleteIds.length === 1 ? '' : 's'} to team pool` : `Add ${selectedAthleteIds.length || ''} athlete${selectedAthleteIds.length === 1 ? '' : 's'}`}</Button><Button variant="ghost" onClick={() => { setAthletePickerOpen(false); setSelectedAthleteIds([]); }} disabled={busy}>Cancel</Button></div>
      </section>}

      {relaySession && canAddToRoster && <fieldset className={styles.relayBuilder} disabled={busy}>
        <legend>Relay team <small>Legs follow selection order</small></legend>
        <label>Team name<input value={relayName} onChange={(input) => setRelayName(input.target.value)} disabled={!readiness.allAttending} /></label>
        {athleteEntrants.length === 0 && <p className={styles.empty}>Add relay athletes before selecting the team.</p>}
        {athleteEntrants.length > 0 && <div className={styles.memberChoices}>{renderMemberChoices(memberIds, setMemberIds)}</div>}
        {readiness.message && <p className={readiness.needsReplacement ? styles.error : styles.empty}>{readiness.message}</p>}
        <Button onClick={() => void addRelay()} disabled={busy || !relayName.trim() || !readiness.allAttending}>Add relay</Button>
      </fieldset>}

      {activeRegistrations.length === 0 && <p className={styles.empty}>No {relaySession ? 'teams' : 'athletes'} are assigned to this session yet.</p>}
      {activeRegistrations.length > 0 && <ul className={styles.registrationList} aria-label="Session roster">{visibleRegistrations.map((registration) => {
        const entrant = entrants.find((item) => item.id === registration.entrantId);
        if (!entrant) return null;
        const athlete = entrant.athleteId ? athletes.find((item) => item.id === entrant.athleteId) : undefined;
        return <li key={registration.id}>
          <span className={styles.entrantIdentity}><strong>{entrant.name}</strong><small>{entrantDescription(entrant, entrants)}{athlete && <i data-status={athlete.status}>{athlete.status[0].toUpperCase() + athlete.status.slice(1)}</i>}</small></span>
          <div className={styles.entrantActions}>{canManageEntrant(entrant) && !relaySession && entrant.athleteId && <Select aria-label={`RSVP for ${entrant.name}`} value={rsvpFor(entrant) ?? 'pending'} onChange={(input) => void updateRsvp(entrant, input.target.value as RsvpStatus)} options={RSVP_OPTIONS} disabled={busy} />}
            {canAddToRoster && canManageEntrant(entrant) && entrant.kind === 'relay' && relaySession && editingRelayId !== entrant.id && <Button variant="secondary" onClick={() => beginEditRelay(entrant)} disabled={busy}>Edit team</Button>}
            {canManageEntrant(entrant) && <Button variant="ghost" aria-label={`Remove ${entrant.name} from session`} onClick={() => void run(async () => {
              await meets.withdrawEntrant(event.id, { disciplineSessionId: selected.id, entrantId: entrant.id });
              setRegistrations((current) => current.map((item) => item.id === registration.id ? { ...item, withdrawnAt: new Date().toISOString(), withdrawnBy: null } : item));
            }, false)} disabled={busy}>Remove</Button>}
          </div>
        </li>;
      })}</ul>}
      {activeRegistrations.length > 0 && visibleRegistrations.length === 0 && <p className={styles.empty}>No {relaySession ? 'teams' : 'athletes'} match this RSVP filter.</p>}

      {!relaySession && <div className={styles.rsvpSummary}><strong>RSVP</strong><span>Pending {rsvpCounts.pending} · Yes {rsvpCounts.yes} · No {rsvpCounts.no} · Maybe {rsvpCounts.maybe}</span></div>}
      {relaySession && athleteEntrants.length > 0 && <div className={styles.rsvpSummary}><strong>RSVP</strong><span>Pending {poolCounts.pending} · Yes {poolCounts.yes} · No {poolCounts.no} · Maybe {poolCounts.maybe}</span></div>}

      {relaySession && editingRelayId && (() => {
        const relay = entrants.find((item) => item.id === editingRelayId);
        if (!relay) return null;
        const editReadiness = relayReadiness(editMemberIds);
        return <fieldset className={styles.relayBuilder} disabled={busy}>
          <legend>Edit relay team <small>Legs follow selection order</small></legend>
          <label>Team name<input value={editRelayName} onChange={(input) => setEditRelayName(input.target.value)} disabled={!editReadiness.allAttending} /></label>
          <div className={styles.memberChoices}>{renderMemberChoices(editMemberIds, setEditMemberIds)}</div>
          {editReadiness.message && <p className={editReadiness.needsReplacement ? styles.error : styles.empty}>{editReadiness.message}</p>}
          <div className={styles.pickerActions}><Button onClick={() => void saveRelayEdit()} disabled={busy || !editRelayName.trim() || !editReadiness.allAttending}>Save team</Button><Button variant="secondary" onClick={() => setEditingRelayId('')} disabled={busy}>Cancel</Button></div>
        </fieldset>;
      })()}
    </div>}
    </div>}
  </section>;
}
