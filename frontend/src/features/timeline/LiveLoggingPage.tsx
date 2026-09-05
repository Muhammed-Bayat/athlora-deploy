import { useEffect, useRef, useState, type FormEvent } from 'react';
import { listAthletes } from '../../api/athletes';
import { getEvent, listEvents, updateEvent } from '../../api/events';
import { listEventParticipants } from '../../api/participants';
import { listTimelineEntries, createTimelineEntry, updateTimelineEntry, deleteTimelineEntry } from '../../api/timeline';
import { listResults } from '../../api/results';
import { ApiError } from '../../api/client';
import { Button, Card, EmptyState, Input, Modal, Toast } from '../../components';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { useWorkspace } from '../auth/WorkspaceContext';
import { useRealtimeRoom } from '../realtime/useRealtimeRoom';
import { EventResultsView } from '../results/EventResultsView';
import { format100mSeconds, getIncidentTypeLabel, has100mHundredthPrecision } from '../results/resultPresentation';
import type {
  AthleticsEvent,
  Athlete,
  EventParticipantSummary,
  TimelineEntry,
  Result,
  IncidentType,
  TimelineEntryPatchPayload,
} from '../../types';
import styles from './LiveLoggingPage.module.css';

function hasApiCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

type EventReloadResult = 'loaded' | 'closed' | 'failed';

function mutationFeedback(message: string, reload: EventReloadResult): string {
  if (reload === 'closed') return `${message} The event is now closed.`;
  if (reload === 'failed') return `${message} Latest event data could not be loaded.`;
  return message;
}

export interface LiveLoggingPageProps {
  initialEventId?: string | null;
  onOpenEvent?: (eventId: string) => void;
  onBackToEventList?: () => void;
}

export function LiveLoggingPage({ initialEventId = null, onOpenEvent, onBackToEventList }: LiveLoggingPageProps = {}) {
  const currentUser = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const [events, setEvents] = useState<AthleticsEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId);
  const [activeEvent, setActiveEvent] = useState<AthleticsEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipantSummary[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventDataLoading, setEventDataLoading] = useState(false);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Per-athlete finish input drafts and submittals
  const [finishInputs, setFinishInputs] = useState<Record<string, string>>({});
  const [submittingAthleteId, setSubmittingAthleteId] = useState<string | null>(null);
  const [submittingIncidentKey, setSubmittingIncidentKey] = useState<string | null>(null);
  const [eventMutation, setEventMutation] = useState<string | null>(null);

  // Edit entry state
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editIncident, setEditIncident] = useState<IncidentType>(null);
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [undoTarget, setUndoTarget] = useState<TimelineEntry | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const eventDataRequestRef = useRef(0);
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const timelineHeadingRef = useRef<HTMLHeadingElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const undoTriggerRef = useRef<HTMLButtonElement | null>(null);
  const loadEventDataRef = useRef<(
    eventId: string,
    waitForSecondary?: boolean,
  ) => Promise<EventReloadResult>>(
    async () => 'failed',
  );
  const editErrorRef = useRef<HTMLParagraphElement>(null);
  const mutationBusy = Boolean(
    submittingAthleteId || submittingIncidentKey || eventMutation || editBusy || undoBusy,
  );

  const openEvent = (eventId: string) => {
    if (onOpenEvent) {
      onOpenEvent(eventId);
      return;
    }
    setSelectedEventId(eventId);
  };

  const returnToEventList = () => {
    if (onBackToEventList) {
      onBackToEventList();
      return;
    }
    setSelectedEventId(null);
  };

  const loadEvents = async (): Promise<boolean> => {
    setEventsLoading(true);
    setError(null);
    try {
      const res = await listEvents();
      setEvents(res.data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
      return false;
    } finally {
      setEventsLoading(false);
    }
  };

  const loadSecondaryData = async (eventId: string, requestId: number): Promise<void> => {
    setSecondaryLoading(true);
    const [resultsResult, athletesResult] = await Promise.allSettled([
      listResults(eventId),
      listAthletes({ includeArchived: true }),
    ]);
    if (requestId !== eventDataRequestRef.current) return;
    if (resultsResult.status === 'fulfilled') setResults(resultsResult.value.data);
    else setResults([]);
    if (athletesResult.status === 'fulfilled') setAthletes(athletesResult.value.data);
    else setAthletes([]);
    if (resultsResult.status === 'rejected' || athletesResult.status === 'rejected') {
      setSecondaryError('Live standings are temporarily unavailable. Logging remains open.');
    }
    setSecondaryLoading(false);
  };

  const loadEventData = async (
    eventId: string,
    waitForSecondary = false,
  ): Promise<EventReloadResult> => {
    const requestId = ++eventDataRequestRef.current;
    setEventDataLoading(true);
    setSecondaryLoading(false);
    setError(null);
    setSecondaryError(null);
    try {
      const [eventRes, participantsRes, timelineRes] = await Promise.all([
        getEvent(eventId),
        listEventParticipants(eventId),
        listTimelineEntries(eventId),
      ]);
      if (requestId !== eventDataRequestRef.current) return 'failed';
      if (eventRes.status !== 'in_progress') {
        setEvents((current) => current.filter((event) => event.id !== eventId));
        setSelectedEventId(null);
        setToast('This event is no longer in progress. Choose another event to continue logging.');
        void loadEvents();
        return 'closed';
      }
      setActiveEvent(eventRes);
      setParticipants(participantsRes.data);
      setTimeline(timelineRes.data);
      setEventDataLoading(false);

      const secondary = loadSecondaryData(eventId, requestId);
      if (waitForSecondary) await secondary;
      else void secondary;
      return 'loaded';
    } catch (err) {
      if (requestId === eventDataRequestRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load event data');
      }
      return 'failed';
    } finally {
      if (requestId === eventDataRequestRef.current) setEventDataLoading(false);
    }
  };
  loadEventDataRef.current = loadEventData;

  useEffect(() => {
    void loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      void loadEventDataRef.current(selectedEventId);
    } else {
      eventDataRequestRef.current += 1;
      setEventDataLoading(false);
      setSecondaryLoading(false);
      setError(null);
      setSecondaryError(null);
      setActiveEvent(null);
      setParticipants([]);
      setAthletes([]);
      setTimeline([]);
      setResults([]);
    }
  }, [selectedEventId]);

  useEffect(() => {
    if (editError) window.requestAnimationFrame(() => editErrorRef.current?.focus());
  }, [editError]);

  useRealtimeRoom({
    workspaceId: activeWorkspace.id,
    eventId: selectedEventId,
    onInvalidate: async () => {
      if (selectedEventId) await loadEventDataRef.current(selectedEventId);
    },
  });

  const restoreTimelineFocus = (trigger: HTMLButtonElement | null) => {
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      else if (timelineHeadingRef.current?.isConnected) timelineHeadingRef.current.focus();
      else pageHeadingRef.current?.focus();
    });
  };

  const handleStartEvent = async (event: AthleticsEvent) => {
    if (mutationBusy) return;
    setEventMutation(`start-${event.id}`);
    setError(null);
    try {
      const updated = await updateEvent(event.id, {
        type: event.type,
        discipline: '100m',
        title: event.title,
        date: event.date,
        time: event.time,
        locationName: event.locationName,
        latitude: event.latitude,
        longitude: event.longitude,
        status: 'in_progress',
      });
      setEvents((current) => current.map((item) => item.id === updated.id ? updated : item));
      setActiveEvent(updated);
      openEvent(updated.id);
      setToast(`Started event: ${updated.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start event');
    } finally {
      setEventMutation(null);
    }
  };

  const handleCompleteEvent = async () => {
    if (!activeEvent || mutationBusy) return;
    setEventMutation('complete');
    try {
      const updated = await updateEvent(activeEvent.id, {
        type: activeEvent.type,
        discipline: '100m',
        title: activeEvent.title,
        date: activeEvent.date,
        time: activeEvent.time,
        locationName: activeEvent.locationName,
        latitude: activeEvent.latitude,
        longitude: activeEvent.longitude,
        status: 'completed',
      });
      setEvents((current) => current.filter((item) => item.id !== updated.id));
      setToast(`Completed event: ${updated.title}`);
      returnToEventList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete event');
    } finally {
      setEventMutation(null);
    }
  };

  const recoverClosedEvent = async (error: unknown): Promise<boolean> => {
    if (!hasApiCode(error, 'EVENT_NOT_IN_PROGRESS')) return false;
    const closedEventId = selectedEventId;
    setEditingEntry(null);
    setUndoTarget(null);
    if (closedEventId) setEvents((current) => current.filter((event) => event.id !== closedEventId));
    returnToEventList();
    const refreshed = await loadEvents();
    setToast(refreshed
      ? 'This event is no longer in progress. The event list has been refreshed.'
      : 'This event is no longer in progress. The event list could not be refreshed.');
    return true;
  };

  const handleRecordFinish = async (athleteId: string) => {
    if (!selectedEventId) return;
    const rawVal = finishInputs[athleteId] ?? '';
    const num = Number(rawVal);
    if (!rawVal.trim() || !Number.isFinite(num) || num <= 0 || num > 99.99 || !has100mHundredthPrecision(rawVal)) {
      setError('Enter a finish time from 0.01 to 99.99 seconds using no more than two decimal places.');
      return;
    }

    setSubmittingAthleteId(athleteId);
    setError(null);
    setConflictNotice(null);

    try {
      await createTimelineEntry(selectedEventId, {
        athleteId,
        discipline: '100m',
        entryType: 'attempt',
        value: num,
        unit: 'seconds',
      });
      setFinishInputs(prev => ({ ...prev, [athleteId]: '' }));
      const reload = await loadEventData(selectedEventId, true);
      setToast(mutationFeedback('Finish time recorded successfully.', reload));
    } catch (err) {
      if (!(await recoverClosedEvent(err))) {
        setError(err instanceof Error ? err.message : 'Failed to record finish');
      }
    } finally {
      setSubmittingAthleteId(null);
    }
  };

  const handleRecordIncident = async (athleteId: string, incidentType: IncidentType) => {
    if (!selectedEventId) return;
    const key = `${athleteId}-${incidentType}`;
    setSubmittingIncidentKey(key);
    setError(null);
    setConflictNotice(null);

    try {
      await createTimelineEntry(selectedEventId, {
        athleteId,
        discipline: '100m',
        entryType: 'penalty',
        incidentType,
        value: null,
      });
      const reload = await loadEventData(selectedEventId, true);
      setToast(mutationFeedback(`Recorded incident: ${getIncidentTypeLabel(incidentType)}`, reload));
    } catch (err) {
      if (!(await recoverClosedEvent(err))) {
        setError(err instanceof Error ? err.message : 'Failed to record incident');
      }
    } finally {
      setSubmittingIncidentKey(null);
    }
  };

  const handleOpenEdit = (entry: TimelineEntry, trigger: HTMLButtonElement) => {
    editTriggerRef.current = trigger;
    setEditError(null);
    setEditingEntry(entry);
    setEditValue(entry.value !== null && entry.value !== undefined ? String(entry.value) : '');
    setEditIncident(entry.incidentType);
    setEditNote(entry.noteText ?? '');
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !editingEntry || mutationBusy) return;

    const valNum = editValue.trim() ? Number(editValue) : null;
    const isTimedEntry = editingEntry.entryType === 'attempt' || editingEntry.entryType === 'split';
    if (isTimedEntry &&
        (!editValue.trim() || !Number.isFinite(valNum) || valNum! <= 0 || !has100mHundredthPrecision(editValue))) {
      setEditError('Enter a positive value using no more than two decimal places.');
      return;
    }
    if (editingEntry.entryType === 'note' && !editNote.trim()) {
      setEditError('Enter a note before saving.');
      return;
    }
    if (editingEntry.entryType === 'penalty' && !editIncident) {
      setEditError('Choose an incident before saving.');
      return;
    }

    setEditBusy(true);
    setEditError(null);
    setConflictNotice(null);

    let shouldRestoreFocus = false;
    try {
      const patch: TimelineEntryPatchPayload = editingEntry.entryType === 'note'
        ? { expectedVersion: editingEntry.version, noteText: editNote.trim() }
        : {
            expectedVersion: editingEntry.version,
            value: isTimedEntry ? valNum : null,
            incidentType: editIncident,
          };
      await updateTimelineEntry(selectedEventId, editingEntry.id, patch);
      setEditingEntry(null);
      shouldRestoreFocus = true;
      const reload = await loadEventData(selectedEventId, true);
      setToast(mutationFeedback('Timeline entry updated successfully.', reload));
    } catch (err) {
      if (hasApiCode(err, 'TIMELINE_ENTRY_VERSION_CONFLICT')) {
        setEditingEntry(null);
        shouldRestoreFocus = true;
        setConflictNotice('This entry changed on another device. Latest entries reloaded; reopen it to continue editing.');
        await loadEventData(selectedEventId);
      } else if (!(await recoverClosedEvent(err))) {
        setEditError(err instanceof Error ? err.message : 'Failed to update entry');
      } else {
        shouldRestoreFocus = true;
      }
    } finally {
      setEditBusy(false);
      if (shouldRestoreFocus) restoreTimelineFocus(editTriggerRef.current);
    }
  };

  const handleUndoEntry = async () => {
    if (!selectedEventId || !undoTarget || mutationBusy) return;

    setUndoBusy(true);
    setUndoError(null);
    setConflictNotice(null);

    let shouldRestoreFocus = false;
    try {
      await deleteTimelineEntry(selectedEventId, undoTarget.id, {
        expectedVersion: undoTarget.version,
      });
      setUndoTarget(null);
      shouldRestoreFocus = true;
      const reload = await loadEventData(selectedEventId, true);
      setToast(mutationFeedback('Entry undone/deleted.', reload));
    } catch (err) {
      if (hasApiCode(err, 'TIMELINE_ENTRY_VERSION_CONFLICT')) {
        setUndoTarget(null);
        shouldRestoreFocus = true;
        setConflictNotice('This entry changed on another device. Latest entries reloaded; review it before undoing.');
        await loadEventData(selectedEventId);
      } else if (!(await recoverClosedEvent(err))) {
        setUndoError(err instanceof Error ? err.message : 'Failed to delete entry');
      } else {
        shouldRestoreFocus = true;
      }
    } finally {
      setUndoBusy(false);
      if (shouldRestoreFocus) restoreTimelineFocus(undoTriggerRef.current);
    }
  };

  if (!selectedEventId || !activeEvent) {
    const activeOrScheduled = events.filter(e => e.status === 'scheduled' || e.status === 'in_progress');
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 ref={pageHeadingRef} tabIndex={-1}>Live Race Logger</h1>
          <p>Select an in-progress or scheduled 100m event to launch track-side recording.</p>
        </div>
        {error && <div className={styles.errorAlert} role="alert">{error}</div>}
        {toast && <Toast onDismiss={() => setToast(null)}>{toast}</Toast>}

        {eventsLoading || (selectedEventId !== null && eventDataLoading) ? (
          <p aria-busy="true">{eventsLoading ? 'Loading events...' : 'Loading event data...'}</p>
        ) : activeOrScheduled.length === 0 ? (
          <EmptyState
            title="No events available"
            description="Create or schedule a 100m event from the Events view to begin live logging."
          />
        ) : (
          <div className={styles.eventGrid}>
            {activeOrScheduled.map(ev => (
              <Card key={ev.id} className={styles.eventCard}>
                <div className={styles.eventCardHeader}>
                  <span className={styles.badge} data-status={ev.status}>
                    {ev.status.replace('_', ' ')}
                  </span>
                  <span className={styles.date}>{ev.date}</span>
                </div>
                <h3>{ev.title}</h3>
                <p>{ev.locationName ?? 'Track & Field Arena'} · 100m</p>
                <div className={styles.eventActions}>
                  {ev.status === 'in_progress' ? (
                    <Button
                      variant="primary"
                      disabled={mutationBusy}
                      onClick={() => {
                        if (selectedEventId === ev.id) void loadEventData(ev.id);
                        else openEvent(ev.id);
                      }}
                      style={{ minHeight: '44px', minWidth: '44px' }}
                    >
                      Open Live Logger ›
                    </Button>
                    ) : (
                    <Button
                      variant="secondary"
                      disabled={mutationBusy}
                      onClick={() => void handleStartEvent(ev)}
                      style={{ minHeight: '44px', minWidth: '44px' }}
                    >
                      {eventMutation === `start-${ev.id}` ? 'Starting...' : 'Start Event'}
                    </Button>
                    )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.activeHeader}>
        <div>
          <span className={styles.eyebrow}>Live Session Active</span>
          <h2 ref={pageHeadingRef} tabIndex={-1}>{activeEvent.title}</h2>
          <p>{activeEvent.locationName ?? 'Track'} · 100m · {participants.length} assigned athletes</p>
        </div>
        <div className={styles.headerButtons}>
          <Button
            variant="secondary"
            onClick={returnToEventList}
            disabled={mutationBusy}
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            Switch Event
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleCompleteEvent()}
            disabled={mutationBusy}
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            {eventMutation === 'complete' ? 'Completing...' : 'Complete Event'}
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorAlert} role="alert">{error}</div>}
      {conflictNotice && <div className={styles.conflictAlert} role="alert">{conflictNotice}</div>}
      {secondaryError && <div className={styles.conflictAlert} role="status">{secondaryError}</div>}
      {toast && <Toast onDismiss={() => setToast(null)}>{toast}</Toast>}

      <div className={styles.workspace}>
        {/* Left: Athlete Logging Console */}
        <section className={styles.consoleSection} aria-label="Athlete logging console">
          <h3>Assigned Athletes ({participants.length})</h3>
          {participants.length === 0 ? (
            <EmptyState
              title="No athletes assigned"
              description="Assign athletes to this event from the Events view to record finishes and incidents."
            />
          ) : (
            <div className={styles.athleteList}>
              {participants.map(p => {
                const athleteId = p.athleteId;
                const isSubmitting = submittingAthleteId === athleteId;
                const val = finishInputs[athleteId] ?? '';
                return (
                  <div key={athleteId} className={styles.athleteRow}>
                    <div className={styles.athleteInfo}>
                      <b>{p.athlete.name}</b>
                      <small>{p.athlete.squadNames?.join(', ') || 'Sprint'} · RSVP: {p.rsvpStatus}</small>
                    </div>

                    <div className={styles.controlsGroup}>
                      <div className={styles.finishInputGroup}>
                        <Input
                          aria-label={`Finish time for ${p.athlete.name}`}
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          max="99.99"
                          step="0.01"
                          placeholder="10.25"
                          value={val}
                          onChange={e => setFinishInputs(prev => ({ ...prev, [athleteId]: e.target.value }))}
                          disabled={mutationBusy}
                        />
                        <Button
                          variant="primary"
                          disabled={mutationBusy || !val.trim()}
                          onClick={() => void handleRecordFinish(athleteId)}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                        >
                          {isSubmitting ? 'Logging...' : 'Record'}
                        </Button>
                      </div>

                      <div className={styles.incidentButtonGroup}>
                        <Button
                          variant="secondary"
                          disabled={mutationBusy}
                          onClick={() => void handleRecordIncident(athleteId, 'false_start')}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                          title="False Start"
                        >
                          False Start
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={mutationBusy}
                          onClick={() => void handleRecordIncident(athleteId, 'lane_infringement')}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                          title="Lane Infringement"
                        >
                          Lane Inf.
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={mutationBusy}
                          onClick={() => void handleRecordIncident(athleteId, 'dq')}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                          title="Disqualified"
                        >
                          DQ
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={mutationBusy}
                          onClick={() => void handleRecordIncident(athleteId, 'dnf')}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                          title="Did Not Finish"
                        >
                          DNF
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={mutationBusy}
                          onClick={() => void handleRecordIncident(athleteId, 'dns')}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                          title="Did Not Start"
                        >
                          DNS
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Timeline & Live Standings Feed */}
        <aside className={styles.feedAside} aria-label="Timeline feed and standings">
          <div className={styles.feedCard}>
            <h3 ref={timelineHeadingRef} tabIndex={-1}>Chronological Timeline</h3>
            {timeline.length === 0 ? (
              <p className={styles.mutedText}>No timeline entries recorded yet.</p>
            ) : (
              <div className={styles.timelineList}>
                {timeline.map(entry => {
                  const athlete = participants.find(p => p.athleteId === entry.athleteId)?.athlete;
                  const name = athlete?.name ?? entry.athleteId;
                  return (
                    <div key={entry.id} className={styles.timelineItem}>
                      <div className={styles.timelineMeta}>
                        <b>{name}</b>
                        <small>{new Date(entry.createdAt).toLocaleTimeString()}</small>
                      </div>
                      <div className={styles.timelineBody}>
                        {entry.entryType === 'attempt' && entry.value !== null && (
                          <span className={styles.successBadge}>Finish: {format100mSeconds(entry.value)}</span>
                        )}
                        {entry.entryType === 'penalty' && entry.incidentType && (
                          <span className={styles.dangerBadge}>Incident: {getIncidentTypeLabel(entry.incidentType)}</span>
                        )}
                        {entry.noteText && <p>Note: {entry.noteText}</p>}
                        <small>Recorded by {entry.recordedBy} · v{entry.version}</small>
                      </div>
                        <div className={styles.timelineActions}>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={(event) => handleOpenEdit(entry, event.currentTarget)}
                          disabled={mutationBusy}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.dangerLinkButton}
                          onClick={(event) => { undoTriggerRef.current = event.currentTarget; setUndoError(null); setUndoTarget(entry); }}
                          disabled={mutationBusy}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                        >
                          Undo
                        </button>
                        </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.feedCard} style={{ marginTop: 'var(--space-4)' }}>
            <div className={styles.feedHeading}>
              <h3>Live Results & Standings</h3>
              <Button variant="ghost" onClick={() => void loadEventData(activeEvent.id)} disabled={eventDataLoading || secondaryLoading || mutationBusy}>
                {eventDataLoading || secondaryLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
            {secondaryLoading && <p className={styles.mutedText} role="status">Refreshing live standings...</p>}
            <EventResultsView
              event={activeEvent}
              results={results}
              participants={participants}
              timeline={timeline}
              athletes={athletes}
              currentUser={currentUser}
              compact
            />
          </div>
        </aside>
      </div>

      {/* Edit Entry Modal */}
      <Modal open={Boolean(editingEntry)} title="Edit Timeline Entry" onClose={() => { if (!editBusy) { setEditingEntry(null); setEditError(null); } }} closeDisabled={editBusy}>
          <form onSubmit={handleSaveEdit} className={styles.editForm}>
            {editError && <p ref={editErrorRef} className={styles.errorAlert} role="alert" tabIndex={-1}>{editError}</p>}
            {editingEntry && (editingEntry.entryType === 'attempt' || editingEntry.entryType === 'split') && <div className={styles.formGroup}>
              <label htmlFor="edit-value">Finish Time / Value (seconds)</label>
              <Input
                id="edit-value"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="99.99"
                step="0.01"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                placeholder="e.g. 10.25"
                disabled={editBusy}
              />
            </div>}
            {editingEntry && editingEntry.entryType !== 'note' && <div className={styles.formGroup}>
              <label htmlFor="edit-incident">Incident Type</label>
              <select
                id="edit-incident"
                value={editIncident ?? ''}
                onChange={e => setEditIncident((e.target.value || null) as IncidentType)}
                className={styles.selectInput}
                disabled={editBusy}
              >
                <option value="">None (Normal Attempt)</option>
                <option value="false_start">False Start</option>
                <option value="lane_infringement">Lane Infringement</option>
                <option value="dq">Disqualified (DQ)</option>
                <option value="dnf">Did Not Finish (DNF)</option>
                <option value="dns">Did Not Start (DNS)</option>
              </select>
            </div>}
            {editingEntry?.entryType === 'note' && <div className={styles.formGroup}>
              <label htmlFor="edit-note">Note / Comment</label>
              <Input
                id="edit-note"
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="Enter note"
                disabled={editBusy}
              />
            </div>}
            <div className={styles.modalActions}>
              <Button type="button" variant="secondary" onClick={() => { setEditingEntry(null); setEditError(null); }} disabled={editBusy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={editBusy}>
                {editBusy ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      <Modal open={Boolean(undoTarget)} title="Undo timeline entry" onClose={() => { if (!undoBusy) { setUndoTarget(null); setUndoError(null); } }} closeDisabled={undoBusy}>
        {undoTarget && <div className={styles.undoConfirmation}>
          <p>Undo this {undoTarget.entryType} entry? It will be removed from the active timeline and results will be recalculated.</p>
          {undoError && <p className={styles.errorAlert} role="alert">{undoError}</p>}
          <div className={styles.modalActions}>
            <Button variant="secondary" onClick={() => { setUndoTarget(null); setUndoError(null); }} disabled={undoBusy}>Keep entry</Button>
            <Button variant="danger" onClick={() => void handleUndoEntry()} disabled={undoBusy}>{undoBusy ? 'Undoing...' : 'Undo entry'}</Button>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
