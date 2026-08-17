import { useEffect, useRef, useState, type FormEvent } from 'react';
import { listAthletes } from '../../api/athletes';
import { listEvents, updateEvent } from '../../api/events';
import { listEventParticipants } from '../../api/participants';
import { listTimelineEntries, createTimelineEntry, updateTimelineEntry, deleteTimelineEntry } from '../../api/timeline';
import { listResults } from '../../api/results';
import { ApiError } from '../../api/client';
import { Button, Card, EmptyState, Input, Modal, Toast } from '../../components';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { EventResultsView } from '../results/EventResultsView';
import { format100mSeconds, getIncidentTypeLabel, has100mHundredthPrecision } from '../results/resultPresentation';
import type {
  AthleticsEvent,
  Athlete,
  EventParticipantSummary,
  TimelineEntry,
  Result,
  IncidentType,
} from '../../types';
import styles from './LiveLoggingPage.module.css';

export function LiveLoggingPage() {
  const currentUser = useCurrentUser();
  const [events, setEvents] = useState<AthleticsEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<AthleticsEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipantSummary[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventDataLoading, setEventDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Per-athlete finish input drafts and submittals
  const [finishInputs, setFinishInputs] = useState<Record<string, string>>({});
  const [submittingAthleteId, setSubmittingAthleteId] = useState<string | null>(null);
  const [submittingIncidentKey, setSubmittingIncidentKey] = useState<string | null>(null);

  // Edit entry state
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editIncident, setEditIncident] = useState<IncidentType>(null);
  const [editNote, setEditNote] = useState('');
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const eventDataRequestRef = useRef(0);

  const loadEvents = async () => {
    setEventsLoading(true);
    setError(null);
    try {
      const res = await listEvents();
      setEvents(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setEventsLoading(false);
    }
  };

  const loadEventData = async (eventId: string) => {
    const requestId = ++eventDataRequestRef.current;
    setEventDataLoading(true);
    setError(null);
    try {
      const [eventRes, participantsRes, timelineRes, resultsRes, athletesRes] = await Promise.all([
        listEvents().then(res => res.data.find(e => e.id === eventId) ?? null),
        listEventParticipants(eventId),
        listTimelineEntries(eventId),
        listResults(eventId),
        listAthletes({ includeArchived: true }),
      ]);
      if (requestId !== eventDataRequestRef.current) return;
      if (eventRes) setActiveEvent(eventRes);
      setParticipants(participantsRes.data);
      setTimeline(timelineRes.data);
      setResults(resultsRes.data);
      setAthletes(athletesRes.data);
    } catch (err) {
      if (requestId === eventDataRequestRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load event data');
      }
    } finally {
      if (requestId === eventDataRequestRef.current) setEventDataLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      void loadEventData(selectedEventId);
    } else {
      eventDataRequestRef.current += 1;
      setEventDataLoading(false);
      setError(null);
      setActiveEvent(null);
      setParticipants([]);
      setAthletes([]);
      setTimeline([]);
      setResults([]);
    }
  }, [selectedEventId]);

  const handleStartEvent = async (event: AthleticsEvent) => {
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
      setActiveEvent(updated);
      setSelectedEventId(updated.id);
      setToast(`Started event: ${updated.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start event');
    }
  };

  const handleCompleteEvent = async () => {
    if (!activeEvent) return;
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
      setActiveEvent(updated);
      setToast(`Completed event: ${updated.title}`);
      setSelectedEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete event');
    }
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
      setToast('Finish time recorded successfully.');
      setFinishInputs(prev => ({ ...prev, [athleteId]: '' }));
      await loadEventData(selectedEventId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictNotice('Version conflict detected. Reloading latest timeline...');
        await loadEventData(selectedEventId);
      } else {
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
      setToast(`Recorded incident: ${getIncidentTypeLabel(incidentType)}`);
      await loadEventData(selectedEventId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictNotice('Version conflict detected. Reloading latest timeline...');
        await loadEventData(selectedEventId);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to record incident');
      }
    } finally {
      setSubmittingIncidentKey(null);
    }
  };

  const handleOpenEdit = (entry: TimelineEntry) => {
    setEditingEntry(entry);
    setEditValue(entry.value !== null && entry.value !== undefined ? String(entry.value) : '');
    setEditIncident(entry.incidentType);
    setEditNote(entry.noteText ?? '');
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !editingEntry) return;

    const valNum = editValue.trim() ? Number(editValue) : null;
    if (editValue.trim() && (!Number.isFinite(valNum) || valNum! <= 0 || !has100mHundredthPrecision(editValue))) {
      setError('Enter a positive value using no more than two decimal places.');
      return;
    }

    setError(null);
    setConflictNotice(null);

    try {
      await updateTimelineEntry(selectedEventId, editingEntry.id, {
        expectedVersion: editingEntry.version,
        entryType: editingEntry.entryType,
        value: valNum,
        incidentType: editIncident,
        noteText: editNote.trim() || null,
      });
      setEditingEntry(null);
      setToast('Timeline entry updated successfully.');
      await loadEventData(selectedEventId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictNotice('Stale version conflict (409). The entry was modified elsewhere. Latest entries reloaded.');
        await loadEventData(selectedEventId);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to update entry');
      }
    }
  };

  const handleUndoEntry = async (entry: TimelineEntry) => {
    if (!selectedEventId) return;
    if (!window.confirm('Are you sure you want to undo/delete this entry?')) return;

    setError(null);
    setConflictNotice(null);

    try {
      await deleteTimelineEntry(selectedEventId, entry.id, {
        expectedVersion: entry.version,
      });
      setToast('Entry undone/deleted.');
      await loadEventData(selectedEventId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictNotice('Version conflict (409). Entry was changed elsewhere. Latest entries reloaded.');
        await loadEventData(selectedEventId);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to delete entry');
      }
    }
  };

  if (!selectedEventId || !activeEvent) {
    const activeOrScheduled = events.filter(e => e.status === 'scheduled' || e.status === 'in_progress');
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Live Race Logger</h1>
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
                      onClick={() => {
                        if (selectedEventId === ev.id) void loadEventData(ev.id);
                        else setSelectedEventId(ev.id);
                      }}
                      style={{ minHeight: '44px', minWidth: '44px' }}
                    >
                      Open Live Logger ›
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => void handleStartEvent(ev)}
                      style={{ minHeight: '44px', minWidth: '44px' }}
                    >
                      Start Event
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
          <h2>{activeEvent.title}</h2>
          <p>{activeEvent.locationName ?? 'Track'} · 100m · {participants.length} assigned athletes</p>
        </div>
        <div className={styles.headerButtons}>
          <Button
            variant="secondary"
            onClick={() => setSelectedEventId(null)}
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            Switch Event
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleCompleteEvent()}
            style={{ minHeight: '44px', minWidth: '44px' }}
          >
            Complete Event
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorAlert} role="alert">{error}</div>}
      {conflictNotice && <div className={styles.conflictAlert} role="alert">{conflictNotice}</div>}
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
                      <small>{p.athlete.squad ?? 'Sprint'} · RSVP: {p.rsvpStatus}</small>
                    </div>

                    <div className={styles.controlsGroup}>
                      <div className={styles.finishInputGroup}>
                        <Input
                          aria-label={`Finish time for ${p.athlete.name}`}
                          placeholder="10.25s"
                          value={val}
                          onChange={e => setFinishInputs(prev => ({ ...prev, [athleteId]: e.target.value }))}
                          disabled={isSubmitting}
                        />
                        <Button
                          variant="primary"
                          disabled={isSubmitting || !val.trim()}
                          onClick={() => void handleRecordFinish(athleteId)}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                        >
                          {isSubmitting ? 'Logging...' : 'Record'}
                        </Button>
                      </div>

                      <div className={styles.incidentButtonGroup}>
                        <Button
                          variant="secondary"
                          disabled={submittingIncidentKey === `${athleteId}-false_start`}
                          onClick={() => void handleRecordIncident(athleteId, 'false_start')}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                          title="False Start"
                        >
                          False Start
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={submittingIncidentKey === `${athleteId}-lane_infringement`}
                          onClick={() => void handleRecordIncident(athleteId, 'lane_infringement')}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                          title="Lane Infringement"
                        >
                          Lane Inf.
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={submittingIncidentKey === `${athleteId}-dq`}
                          onClick={() => void handleRecordIncident(athleteId, 'dq')}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                          title="Disqualified"
                        >
                          DQ
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={submittingIncidentKey === `${athleteId}-dnf`}
                          onClick={() => void handleRecordIncident(athleteId, 'dnf')}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                          title="Did Not Finish"
                        >
                          DNF
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={submittingIncidentKey === `${athleteId}-dns`}
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
            <h3>Chronological Timeline</h3>
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
                          onClick={() => handleOpenEdit(entry)}
                          style={{ minHeight: '44px', minWidth: '44px' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.dangerLinkButton}
                          onClick={() => void handleUndoEntry(entry)}
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
              <Button variant="ghost" onClick={() => void loadEventData(activeEvent.id)} disabled={eventDataLoading}>
                {eventDataLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
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
      <Modal open={Boolean(editingEntry)} title="Edit Timeline Entry" onClose={() => setEditingEntry(null)}>
          <form onSubmit={handleSaveEdit} className={styles.editForm}>
            <div className={styles.formGroup}>
              <label htmlFor="edit-value">Finish Time / Value (seconds)</label>
              <Input
                id="edit-value"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                placeholder="e.g. 10.25"
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="edit-incident">Incident Type</label>
              <select
                id="edit-incident"
                value={editIncident ?? ''}
                onChange={e => setEditIncident((e.target.value || null) as IncidentType)}
                className={styles.selectInput}
              >
                <option value="">None (Normal Attempt)</option>
                <option value="false_start">False Start</option>
                <option value="lane_infringement">Lane Infringement</option>
                <option value="dq">Disqualified (DQ)</option>
                <option value="dnf">Did Not Finish (DNF)</option>
                <option value="dns">Did Not Start (DNS)</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="edit-note">Note / Comment</label>
              <Input
                id="edit-note"
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
            <div className={styles.modalActions}>
              <Button type="button" variant="secondary" onClick={() => setEditingEntry(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
    </div>
  );
}
