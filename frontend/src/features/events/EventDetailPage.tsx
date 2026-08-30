import { useEffect, useRef, useState } from 'react';
import { cancelEvent, getEvent, updateEvent } from '../../api/events';
import { listFixtureRosters } from '../../api/fixtures';
import { ApiError } from '../../api/client';
import { Button, Modal, Toast } from '../../components';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { useWorkspace } from '../auth/WorkspaceContext';
import { EventResultsSection } from '../results/EventResultsSection';
import { type ResultCorrectionTarget } from '../results/EventResultsView';
import { ResultCorrectionForm } from '../results/ResultCorrectionForm';
import type { AthleticsEvent, EventMutationPayload, EventStatus, FixtureTeamRoster } from '../../types';
import { EventWeatherPanel } from './EventWeatherPanel';
import { FixtureHostPanel } from './FixtureHostPanel';
import { EventForm, ParticipantManager, errorMessage, formattedDate, formattedStatus, formattedType, replacement } from './EventsPage';
import styles from './EventsPage.module.css';

type LifecycleAction = 'start' | 'complete' | 'cancel';

export function EventDetailPage({ eventId, onBack, initialEvent, onEventUpdated, onBusyChange }: { eventId: string; onBack: () => void; initialEvent?: AthleticsEvent; onEventUpdated?: (event: AthleticsEvent) => void; onBusyChange?: (busy: boolean) => void }) {
  const currentUser = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const isCoach = activeWorkspace.role === 'coach';
  const [event, setEvent] = useState<AthleticsEvent | null>(initialEvent ?? null);
  const [loading, setLoading] = useState(!initialEvent);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [participantBusy, setParticipantBusy] = useState(false);
  const [resultReloadKey, setResultReloadKey] = useState(0);
  const [correctionTarget, setCorrectionTarget] = useState<ResultCorrectionTarget | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<LifecycleAction | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const correctionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [fixtureTeams, setFixtureTeams] = useState<FixtureTeamRoster[]>([]);
  const [rosterState, setRosterState] = useState<'idle' | 'loaded' | 'failed'>('idle');

  useEffect(() => { onBusyChange?.(participantBusy || correctionBusy); }, [correctionBusy, onBusyChange, participantBusy]);

  useEffect(() => {
    if (initialEvent) return;
    let current = true;
    setLoading(true);
    setLoadError(null);
    void getEvent(eventId).then((next) => {
      if (current) setEvent(next);
    }).catch((error: unknown) => {
      if (!current) return;
      if (error instanceof ApiError && error.status === 404) setLoadError('This event no longer exists or is unavailable.');
      else setLoadError(errorMessage(error));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [activeWorkspace.id, eventId, initialEvent, reloadKey]);

  useEffect(() => {
    if (!event || event.type !== 'competition') { setRosterState('loaded'); return; }
    void listFixtureRosters(event.id).then((response) => {
      setFixtureTeams(response.data);
      setRosterState('loaded');
    }).catch(() => { setRosterState('failed'); });
  }, [event?.id, event?.type]);

  const saveEditor = async (payload: EventMutationPayload) => {
    if (!event) return;
    const updated = await updateEvent(event.id, payload);
    setEvent(updated);
    onEventUpdated?.(updated);
    setEditor(false);
    setNotice(`${updated.title} updated.`);
  };
  const runLifecycle = async () => {
    if (!event || !confirmation) return;
    setLifecycleBusy(true);
    setMutationError(null);
    try {
      const nextStatus: EventStatus = confirmation === 'start' ? 'in_progress' : 'completed';
      const updated = confirmation === 'cancel'
        ? await cancelEvent(event.id)
        : await updateEvent(event.id, replacement(event, nextStatus));
      setEvent(updated);
      onEventUpdated?.(updated);
      setConfirmation(null);
      setNotice(confirmation === 'cancel' ? `${updated.title} cancelled. Its history is preserved.` : confirmation === 'start' ? `${updated.title} is now live.` : `${updated.title} marked completed.`);
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setLifecycleBusy(false);
    }
  };
  const finishCorrection = (message: string) => {
    setCorrectionTarget(null);
    setResultReloadKey((key) => key + 1);
    setNotice(message);
    window.requestAnimationFrame(() => detailRef.current?.focus());
  };

  if (loading) return <section aria-busy="true"><div className={styles.loading} role="status"><span /><span /><span /><p>Loading event...</p></div></section>;
  if (loadError) return <section className={styles.loadError} role="alert"><h1>{loadError.startsWith('This event') ? 'Event not found' : 'Event unavailable'}</h1><p>{loadError}</p><Button onClick={() => setReloadKey((key) => key + 1)}>Try again</Button><Button variant="secondary" onClick={onBack}>Back to events</Button></section>;
  if (!event) return null;

  const rosterFailed = rosterState === 'failed';
  const isHostWorkspace = !rosterFailed && (fixtureTeams.length === 0 || fixtureTeams.some((t) => t.team.workspaceId === activeWorkspace.id && t.team.status === 'accepted'));
  const hasGuestTeams = fixtureTeams.length > 1;
  const canManageLifecycle = isCoach && (rosterFailed ? event.type !== 'competition' : (!hasGuestTeams || isHostWorkspace));

  const confirmationTitle = confirmation === 'cancel' ? 'Cancel event' : confirmation === 'start' ? 'Start event' : 'Complete event';
  return <section aria-labelledby="event-detail-heading">
    <header className={styles.viewHeader}><div><p className={styles.eyebrow}>100m season calendar</p><h1 id="event-detail-heading">{event.title}</h1></div><Button variant="secondary" onClick={onBack}>Back to events</Button></header>
    {notice && <Toast variant="success" onDismiss={() => setNotice(null)}>{notice}</Toast>}
    <div ref={detailRef} className={styles.detail} hidden={Boolean(correctionTarget)} tabIndex={-1}>
      <div className={styles.detailTags}><span data-type={event.type}>{formattedType(event.type)}</span><span data-status={event.status}>{formattedStatus(event.status)}</span><span>100m</span></div>
      <dl className={styles.detailGrid}><div><dt>Date</dt><dd><time dateTime={event.date}>{formattedDate(event.date, true)}</time></dd></div><div><dt>Time</dt><dd>{event.time ?? 'Time not set'}</dd></div><div><dt>Location</dt><dd>{event.locationName ?? 'Location not set'}</dd></div><div><dt>Discipline</dt><dd>100m</dd></div></dl>
      {(event.latitude !== null || event.longitude !== null) && <p className={styles.coordinates}>Coordinates: {event.latitude ?? 'Not set'}, {event.longitude ?? 'Not set'}</p>}
       <EventWeatherPanel key={`${event.id}-${event.updatedAt}`} event={event} />
       <FixtureHostPanel event={event} isCoach={isCoach} />
       <EventResultsSection event={event} reloadKey={resultReloadKey} onCorrect={isCoach ? (target, trigger) => { correctionTriggerRef.current = trigger; setCorrectionTarget(target); } : undefined} />
      <ParticipantManager eventId={event.id} onBusyChange={setParticipantBusy} onChanged={() => setResultReloadKey((key) => key + 1)} />
       {canManageLifecycle && <div className={styles.detailActions}><Button variant="secondary" onClick={() => setEditor(true)} disabled={participantBusy || correctionBusy}>Edit event</Button>{event.status === 'scheduled' && <Button onClick={() => setConfirmation('start')} disabled={participantBusy || correctionBusy}>Start event</Button>}{(event.status === 'scheduled' || event.status === 'in_progress') && <Button onClick={() => setConfirmation('complete')} disabled={participantBusy || correctionBusy}>Mark completed</Button>}{event.status !== 'cancelled' && <Button variant="danger" onClick={() => setConfirmation('cancel')} disabled={participantBusy || correctionBusy}>Cancel event</Button>}</div>}
    </div>
    <Modal open={correctionTarget !== null} title={correctionTarget ? `Correct ${correctionTarget.athleteName}` : 'Correct result'} onClose={() => { if (!correctionBusy) { setCorrectionTarget(null); window.requestAnimationFrame(() => correctionTriggerRef.current?.focus()); } }} closeDisabled={correctionBusy}>{correctionTarget && <ResultCorrectionForm target={correctionTarget} currentUser={currentUser} onBack={() => { setCorrectionTarget(null); window.requestAnimationFrame(() => correctionTriggerRef.current?.focus()); }} onSaved={finishCorrection} onBusyChange={setCorrectionBusy} />}</Modal>
    <Modal open={editor} title="Edit event" onClose={() => { if (!editorBusy) setEditor(false); }} closeDisabled={editorBusy}><EventForm event={event} onSave={saveEditor} onCancel={() => setEditor(false)} onSubmittingChange={setEditorBusy} /></Modal>
    <Modal open={confirmation !== null} title={confirmationTitle} onClose={() => { if (!lifecycleBusy) { setConfirmation(null); setMutationError(null); } }} closeDisabled={lifecycleBusy}><div className={styles.confirmation}><p>{confirmation === 'cancel' ? <>Cancel <strong>{event.title}</strong>? The event remains in history. Participant assignments, timeline entries, and results are preserved, but cancelled-event results do not contribute to statistics.</> : confirmation === 'start' ? <>Start <strong>{event.title}</strong>? Live result logging will open for this event.</> : <>Mark <strong>{event.title}</strong> completed? Live result logging will close.</>}</p>{mutationError && <p className={styles.formError} role="alert">{mutationError}</p>}<div className={styles.formActions}><Button variant="secondary" onClick={() => setConfirmation(null)} disabled={lifecycleBusy}>Back</Button><Button variant={confirmation === 'cancel' ? 'danger' : 'primary'} onClick={() => void runLifecycle()} disabled={lifecycleBusy}>{lifecycleBusy ? 'Saving...' : confirmation === 'cancel' ? 'Cancel event' : confirmation === 'start' ? 'Start event' : 'Mark completed'}</Button></div></div></Modal>
  </section>;
}
