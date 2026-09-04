import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { EventDetailPage } from './EventDetailPage';
import { createEvent, listEvents, updateEvent } from '../../api/events';
import { searchVenues } from '../../api/venues';
import { listAthletes } from '../../api/athletes';
import {
  addEventParticipant,
  acknowledgeParticipantStatusReview,
  listEventParticipants,
  removeEventParticipant,
  updateEventParticipant,
} from '../../api/participants';
import { ApiError } from '../../api/client';
import { Button, Card, EmptyState, Input, Modal, Select, Toast } from '../../components';
import {
  DISCIPLINE_100M,
  type Athlete,
  type AthleticsEvent,
  type EventParticipantSummary,
  type EventMutationPayload,
  type EventStatus,
  type EventType,
  type RsvpStatus,
  type VenueSearchResult,
} from '../../types';
import styles from './EventsPage.module.css';
import { useWorkspace } from '../auth/WorkspaceContext';

type DateTab = 'upcoming' | 'past' | 'all';
type EventView = 'list' | 'calendar';
type Editor = 'new' | AthleticsEvent | null;

interface EventDraft {
  title: string;
  type: EventType;
  date: string;
  time: string;
  locationName: string;
  latitude: string;
  longitude: string;
}

type FieldErrors = Partial<Record<keyof EventDraft, string>>;

export interface EventsPageProps {
  onUpcomingCountChange?: (count: number) => void;
  onOpenEvent?: (eventId: string) => void;
  today?: string;
  defaultView?: EventView;
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function draftFor(event?: AthleticsEvent): EventDraft {
  return {
    title: event?.title ?? '',
    type: event?.type ?? 'competition',
    date: event?.date ?? '',
    time: event?.time ?? '',
    locationName: event?.locationName ?? '',
    latitude: event?.latitude === null || event?.latitude === undefined ? '' : String(event.latitude),
    longitude: event?.longitude === null || event?.longitude === undefined ? '' : String(event.longitude),
  };
}

function parseCoordinate(
  value: string,
  field: 'latitude' | 'longitude',
  errors: FieldErrors,
): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  const [minimum, maximum] = field === 'latitude' ? [-90, 90] : [-180, 180];
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    errors[field] = `${field === 'latitude' ? 'Latitude' : 'Longitude'} must be between ${minimum} and ${maximum}.`;
    return null;
  }
  return number;
}

function toPayload(
  draft: EventDraft,
  status: EventStatus,
): { payload: EventMutationPayload; errors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!draft.title.trim()) errors.title = 'Event title is required.';
  if (!draft.date) errors.date = 'Event date is required.';
  const latitude = parseCoordinate(draft.latitude, 'latitude', errors);
  const longitude = parseCoordinate(draft.longitude, 'longitude', errors);
  return {
    payload: {
      type: draft.type,
      discipline: DISCIPLINE_100M,
      title: draft.title.trim(),
      date: draft.date,
      time: draft.time || null,
      locationName: draft.locationName.trim() || null,
      latitude,
      longitude,
      status,
    },
    errors,
  };
}

export function replacement(event: AthleticsEvent, status: EventStatus): EventMutationPayload {
  return {
    type: event.type,
    discipline: DISCIPLINE_100M,
    title: event.title,
    date: event.date,
    time: event.time,
    locationName: event.locationName,
    latitude: event.latitude,
    longitude: event.longitude,
    status,
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return 'Could not reach Athlora. Check your connection and try again.';
    if (error.status === 401) return 'Your session could not be authorized. Please sign in again.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

function validationErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {};
  const issues = error.details.issues;
  if (!Array.isArray(issues)) return {};
  const fields: FieldErrors = {};
  for (const issue of issues) {
    if (typeof issue !== 'object' || issue === null) continue;
    const path = 'path' in issue ? issue.path : undefined;
    const message = 'message' in issue ? issue.message : undefined;
    if (
      typeof path === 'string' &&
      typeof message === 'string' &&
      ['title', 'type', 'date', 'time', 'locationName', 'latitude', 'longitude'].includes(path)
    ) {
      fields[path as keyof EventDraft] ??= message;
    }
  }
  return fields;
}

export function formattedStatus(status: EventStatus): string {
  return status.replace('_', ' ').replace(/^./, (character) => character.toUpperCase());
}

export function formattedType(type: EventType): string {
  return type === 'competition' ? 'Competition' : 'Training';
}

function formattedRsvp(status: RsvpStatus): string {
  return status === 'yes' ? 'attending' : status === 'no' ? 'not attending' : status === 'maybe' ? 'maybe attending' : 'pending';
}

function formattedAthleteStatus(status: Athlete['status']): string {
  return status[0].toUpperCase() + status.slice(1);
}

export function formattedDate(date: string, long = false): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
  });
}

function sortedEvents(events: AthleticsEvent[], descending = false): AthleticsEvent[] {
  const direction = descending ? -1 : 1;
  return [...events].sort((left, right) => {
    const date = left.date.localeCompare(right.date);
    if (date !== 0) return date * direction;
    const leftTime = left.time ?? '99:99:99';
    const rightTime = right.time ?? '99:99:99';
    const time = leftTime.localeCompare(rightTime);
    if (time !== 0) return time * direction;
    const created = left.createdAt.localeCompare(right.createdAt);
    return created !== 0 ? created * direction : left.id.localeCompare(right.id) * direction;
  });
}

function sortedParticipants(participants: EventParticipantSummary[]): EventParticipantSummary[] {
  return [...participants].sort((left, right) =>
    left.athlete.name.localeCompare(right.athlete.name, undefined, { sensitivity: 'base' }) ||
    left.athleteId.localeCompare(right.athleteId),
  );
}

interface EventFormProps {
  event?: AthleticsEvent;
  onSave: (payload: EventMutationPayload) => Promise<void>;
  onCancel: () => void;
  onSubmittingChange: (submitting: boolean) => void;
}

export function EventForm({ event, onSave, onCancel, onSubmittingChange }: EventFormProps) {
  const [draft, setDraft] = useState(() => draftFor(event));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [venueQuery, setVenueQuery] = useState('');
  const [venueResults, setVenueResults] = useState<VenueSearchResult[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [selectedVenueKey, setSelectedVenueKey] = useState<string | null>(null);
  const venueRequestRef = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const setField = <K extends keyof EventDraft>(field: K, value: EventDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    const parsed = toPayload(draft, event?.status ?? 'scheduled');
    if (Object.keys(parsed.errors).length > 0) {
      setErrors(parsed.errors);
      if (parsed.errors.title) titleRef.current?.focus();
      else if (parsed.errors.date) dateRef.current?.focus();
      return;
    }

    setSubmitting(true);
    onSubmittingChange(true);
    setSubmitError(null);
    try {
      await onSave(parsed.payload);
    } catch (error) {
      const fields = validationErrors(error);
      setErrors(fields);
      setSubmitError(errorMessage(error));
      if (fields.title) titleRef.current?.focus();
      else if (fields.date) dateRef.current?.focus();
    } finally {
      setSubmitting(false);
      onSubmittingChange(false);
    }
  };

  const lookupVenue = async (query: string) => {
    const request = ++venueRequestRef.current;
    setVenueSearching(true);
    setVenueError(null);
    try {
      const response = await searchVenues(query);
      if (request === venueRequestRef.current) setVenueResults(response.data);
    } catch (error) {
      if (request === venueRequestRef.current) setVenueError(errorMessage(error));
    } finally {
      if (request === venueRequestRef.current) setVenueSearching(false);
    }
  };

  useEffect(() => {
    const query = venueQuery.trim();
    if (query.length < 2) {
      setVenueResults([]);
      setVenueError(null);
      setVenueSearching(false);
      return undefined;
    }
    const timer = window.setTimeout(() => { void lookupVenue(query); }, 250);
    return () => window.clearTimeout(timer);
  }, [venueQuery]);

  const selectVenue = (venue: VenueSearchResult) => {
    setDraft((current) => ({ ...current, locationName: venue.displayName, latitude: String(venue.latitude), longitude: String(venue.longitude) }));
    setSelectedVenueKey(`${venue.latitude}-${venue.longitude}-${venue.displayName}`);
    setVenueError(null);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {submitError && <p className={styles.formError} role="alert">{submitError}</p>}
      <p className={styles.fixedDiscipline}><span>Discipline</span><strong>100m</strong></p>

      <label htmlFor="event-title">Event title</label>
      <Input
        ref={titleRef}
        id="event-title"
        value={draft.title}
        onChange={(input) => setField('title', input.target.value)}
        invalid={Boolean(errors.title)}
        aria-invalid={Boolean(errors.title)}
        aria-describedby={errors.title ? 'event-title-error' : undefined}
        required
        aria-required="true"
        disabled={submitting}
      />
      {errors.title && <span id="event-title-error" className={styles.fieldError}>{errors.title}</span>}

       <div className={styles.formRow}>
        <div>
          <label htmlFor="event-type">Event type</label>
          <Select
            id="event-type"
            variant="field"
            value={draft.type}
            onChange={(input) => setField('type', input.target.value as EventType)}
            options={[
              { value: 'competition', label: 'Competition' },
              { value: 'training', label: 'Training' },
            ]}
            disabled={submitting}
          />
        </div>
        <div>
          <label htmlFor="event-date">Date</label>
          <Input
            ref={dateRef}
            id="event-date"
            type="date"
            value={draft.date}
            onChange={(input) => setField('date', input.target.value)}
            invalid={Boolean(errors.date)}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? 'event-date-error' : undefined}
            required
            aria-required="true"
            disabled={submitting}
          />
          {errors.date && <span id="event-date-error" className={styles.fieldError}>{errors.date}</span>}
        </div>
       </div>

       <fieldset className={styles.venueLookup} disabled={submitting}>
         <legend>Find a venue <span>Optional</span></legend>
          <p>Start typing to search. Selecting a venue saves its map location for forecasts and directions.</p>
          <label htmlFor="venue-search" className={styles.srOnly}>Venue or address</label>
          <div><Input id="venue-search" value={venueQuery} onChange={(input) => { setVenueQuery(input.target.value); setSelectedVenueKey(null); }} placeholder="Venue or address" /><span className={styles.venueSearchState} role="status">{venueSearching ? 'Searching...' : 'Type at least 2 letters'}</span></div>
          {venueError && <p className={styles.formError} role="alert">{venueError}</p>}
          {venueResults.length > 0 && <ul className={styles.venueResults} aria-label="Venue search results">{venueResults.map((venue) => { const key = `${venue.latitude}-${venue.longitude}-${venue.displayName}`; return <li key={key}><button type="button" aria-pressed={selectedVenueKey === key} className={selectedVenueKey === key ? styles.venueSelected : undefined} onClick={() => selectVenue(venue)}><strong>{venue.displayName}</strong><small>{selectedVenueKey === key ? 'Selected venue' : 'Select venue'}</small></button></li>; })}</ul>}
          {!venueSearching && !venueError && venueQuery.length >= 2 && venueResults.length === 0 && <p className={styles.venueHint}>No matching venues found.</p>}
         <p className={styles.attribution}>Search data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, via Nominatim.</p>
       </fieldset>

       <div className={styles.formRow}>
        <div>
          <label htmlFor="event-time">Time <span>Optional</span></label>
          <Input id="event-time" type="time" step="1" value={draft.time} onChange={(input) => setField('time', input.target.value)} invalid={Boolean(errors.time)} aria-invalid={Boolean(errors.time)} aria-describedby={errors.time ? 'event-time-error' : undefined} disabled={submitting} />
          {errors.time && <span id="event-time-error" className={styles.fieldError}>{errors.time}</span>}
        </div>
        <div>
          <label htmlFor="event-location">Location <span>Optional</span></label>
          <Input id="event-location" value={draft.locationName} onChange={(input) => setField('locationName', input.target.value)} invalid={Boolean(errors.locationName)} aria-invalid={Boolean(errors.locationName)} aria-describedby={errors.locationName ? 'event-location-error' : undefined} disabled={submitting} />
          {errors.locationName && <span id="event-location-error" className={styles.fieldError}>{errors.locationName}</span>}
        </div>
      </div>

      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : event ? 'Save changes' : 'Add event'}</Button>
      </div>
    </form>
  );
}

export function ParticipantManager({
  eventId,
  onBusyChange,
  onChanged,
}: {
  eventId: string;
  onBusyChange: (busy: boolean) => void;
  onChanged: () => void;
}) {
  const { activeWorkspace } = useWorkspace();
  const isCoach = activeWorkspace.role === 'coach';
  const [participants, setParticipants] = useState<EventParticipantSummary[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [participantReloadKey, setParticipantReloadKey] = useState(0);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athletesLoading, setAthletesLoading] = useState(true);
  const [athletesError, setAthletesError] = useState<string | null>(null);
  const [athleteReloadKey, setAthleteReloadKey] = useState(0);
  const [candidateId, setCandidateId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EventParticipantSummary | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const keepAthleteRef = useRef<HTMLButtonElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const operationTriggerRef = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const wasBusyRef = useRef(false);

  useEffect(() => {
    onBusyChange(Boolean(busy));
  }, [busy, onBusyChange]);

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  useEffect(() => {
    if (busy) {
      wasBusyRef.current = true;
      return;
    }
    if (!wasBusyRef.current) return;
    wasBusyRef.current = false;
    window.requestAnimationFrame(() => {
      const trigger = operationTriggerRef.current;
      if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus();
      else sectionRef.current?.focus();
    });
  }, [busy]);

  useEffect(() => {
    if (removeTarget) keepAthleteRef.current?.focus();
  }, [removeTarget]);

  useEffect(() => {
    let current = true;
    setParticipantsLoading(true);
    setParticipantsError(null);
    void listEventParticipants(eventId)
      .then(({ data }) => {
        if (current) setParticipants(sortedParticipants(data));
      })
      .catch((error: unknown) => {
        if (current) setParticipantsError(errorMessage(error));
      })
      .finally(() => {
        if (current) setParticipantsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [eventId, participantReloadKey]);

  useEffect(() => {
    let current = true;
    setAthletesLoading(true);
    setAthletesError(null);
    void listAthletes({ status: 'active' })
      .then(({ data }) => {
        if (current) setAthletes(data.filter((athlete) => athlete.status === 'active'));
      })
      .catch((error: unknown) => {
        if (current) setAthletesError(errorMessage(error));
      })
      .finally(() => {
        if (current) setAthletesLoading(false);
      });
    return () => {
      current = false;
    };
  }, [athleteReloadKey, eventId]);

  const candidates = athletes.filter((athlete) =>
    !participants.some((participant) => participant.athleteId === athlete.id),
  );
  const [rsvpFilter, setRsvpFilter] = useState<RsvpStatus | 'all'>('all');
  const rsvpCounts = participants.reduce<Record<RsvpStatus, number>>((counts, participant) => ({ ...counts, [participant.rsvpStatus]: counts[participant.rsvpStatus] + 1 }), { pending: 0, yes: 0, no: 0, maybe: 0 });

  const assign = async () => {
    if (!candidateId) return;
    setBusy('assign');
    setMutationError(null);
    setFeedback(null);
    try {
      const participant = await addEventParticipant(eventId, candidateId);
      setParticipants((current) => sortedParticipants([...current, participant]));
      setCandidateId('');
      setFeedback(`${participant.athlete.name} assigned with a pending RSVP.`);
      onChanged();
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const updateRsvp = async (participant: EventParticipantSummary, rsvpStatus: RsvpStatus) => {
    setBusy(`rsvp-${participant.athleteId}`);
    setMutationError(null);
    setFeedback(null);
    try {
      const updated = await updateEventParticipant(eventId, participant.athleteId, rsvpStatus);
      setParticipants((current) => sortedParticipants(current.map((item) =>
        item.athleteId === updated.athleteId ? updated : item,
      )));
      setFeedback(`${updated.athlete.name}'s RSVP updated to ${formattedRsvp(updated.rsvpStatus)}.`);
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const acknowledgeStatusReview = async (participant: EventParticipantSummary) => {
    setBusy(`review-${participant.athleteId}`);
    setMutationError(null);
    setFeedback(null);
    try {
      await acknowledgeParticipantStatusReview(eventId, participant.athleteId);
      setParticipants((current) => current.map((item) =>
        item.athleteId === participant.athleteId ? { ...item, statusReviewRequired: false } : item,
      ));
      setFeedback(`Status review acknowledged for ${participant.athlete.name}.`);
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setBusy(`remove-${removeTarget.athleteId}`);
    setMutationError(null);
    setFeedback(null);
    try {
      await removeEventParticipant(eventId, removeTarget.athleteId);
      setParticipants((current) => current.filter((item) => item.athleteId !== removeTarget.athleteId));
      setFeedback(`${removeTarget.athlete.name} removed from this event. Existing timeline entries and results were preserved.`);
      setRemoveTarget(null);
      onChanged();
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const cancelRemoval = () => {
    setRemoveTarget(null);
    window.requestAnimationFrame(() => removeTriggerRef.current?.focus());
  };

  return (
    <section ref={sectionRef} className={styles.participants} aria-labelledby="event-participants-heading" aria-busy={participantsLoading || athletesLoading || Boolean(busy)} tabIndex={-1}>
      <header>
        <div><p>Event roster</p><h3 id="event-participants-heading">Assigned athletes <span>{participantsLoading ? '...' : participantsError ? 'Unavailable' : participants.length}</span></h3></div>
        {!participantsLoading && !participantsError && <label className={styles.rosterFilter}>Roster filter<Select variant="field" value={rsvpFilter} onChange={(event) => setRsvpFilter(event.target.value as RsvpStatus | 'all')} options={[{ value: 'all', label: 'All athletes' }, { value: 'yes', label: 'Attending' }, { value: 'maybe', label: 'Maybe attending' }, { value: 'pending', label: 'Pending' }, { value: 'no', label: 'Not attending' }]} /></label>}
      </header>

      {participantsLoading && <p className={styles.inlineStatus} role="status">Loading assigned athletes...</p>}
      {!participantsLoading && participantsError && <div className={styles.inlineError} role="alert"><p>{participantsError}</p><Button variant="secondary" onClick={() => setParticipantReloadKey((key) => key + 1)}>Retry assignments</Button></div>}
      {!participantsLoading && !participantsError && participants.length === 0 && <p className={styles.inlineEmpty}>No athletes are assigned to this event yet.</p>}
      {!participantsLoading && !participantsError && participants.length > 0 && (
        <ul className={styles.participantList}>
          {participants.filter((participant) => rsvpFilter === 'all' || participant.rsvpStatus === rsvpFilter).map((participant) => {
            const participantBusy = busy?.endsWith(participant.athleteId) ?? false;
            return <li key={participant.athleteId}>
              <span className={styles.participantIdentity}><b>{participant.athlete.name}</b><small>{participant.athlete.squadNames?.join(', ') || 'No squad assigned'}<i data-status={participant.athlete.status}>{formattedAthleteStatus(participant.athlete.status)}</i>{participant.statusReviewRequired && <i className={styles.reviewBadge}>Status review required</i>}</small></span>
                {isCoach && <><label className={styles.srOnly} htmlFor={`participant-rsvp-${participant.athleteId}`}>RSVP for {participant.athlete.name}</label>
               <Select id={`participant-rsvp-${participant.athleteId}`} variant="field" value={participant.rsvpStatus} onChange={(input) => { operationTriggerRef.current = input.currentTarget; void updateRsvp(participant, input.target.value as RsvpStatus); }} options={[
                { value: 'pending', label: 'Pending' },
                { value: 'yes', label: 'Attending' },
                { value: 'no', label: 'Not attending' },
                { value: 'maybe', label: 'Maybe' },
                ]} disabled={Boolean(busy)} />
                {participant.statusReviewRequired && <Button variant="secondary" onClick={(event) => { operationTriggerRef.current = event.currentTarget; void acknowledgeStatusReview(participant); }} disabled={Boolean(busy)}>{busy === `review-${participant.athleteId}` ? 'Acknowledging...' : 'Acknowledge review'}</Button>}
                <Button variant="ghost" aria-label={`Remove ${participant.athlete.name} from event`} onClick={(event) => { removeTriggerRef.current = event.currentTarget; setMutationError(null); setRemoveTarget(participant); }} disabled={Boolean(busy)}>{participantBusy ? 'Saving...' : 'Remove'}</Button></>}
            </li>;
          })}
        </ul>
      )}

      {!participantsLoading && !participantsError && <div className={styles.rsvpSummary}><strong>RSVP</strong><span>Pending {rsvpCounts.pending} · Yes {rsvpCounts.yes} · No {rsvpCounts.no} · Maybe {rsvpCounts.maybe}</span></div>}

      {removeTarget && <div className={styles.removeConfirmation} role="region" aria-labelledby="participant-removal-copy"><p id="participant-removal-copy">Remove <strong>{removeTarget.athlete.name}</strong> from this event? Existing timeline entries and results will be preserved.</p><div><Button ref={keepAthleteRef} variant="secondary" aria-describedby="participant-removal-copy" onClick={cancelRemoval} disabled={Boolean(busy)}>Keep athlete</Button><Button variant="danger" aria-describedby="participant-removal-copy" onClick={(event) => { operationTriggerRef.current = event.currentTarget; void remove(); }} disabled={Boolean(busy)}>{busy ? 'Removing...' : 'Remove athlete'}</Button></div></div>}

       {isCoach && <div className={styles.assignment}>
        <label htmlFor="event-athlete-candidate">Assign an active athlete</label>
        {athletesLoading && <p className={styles.inlineStatus} role="status">Loading active roster...</p>}
        {!athletesLoading && athletesError && <div className={styles.inlineError} role="alert"><p>{athletesError}</p><Button variant="secondary" onClick={() => setAthleteReloadKey((key) => key + 1)}>Retry roster</Button></div>}
        {!athletesLoading && !athletesError && <div><Select id="event-athlete-candidate" variant="field" value={candidateId} onChange={(input) => setCandidateId(input.target.value)} options={[
          { value: '', label: candidates.length ? 'Choose an athlete' : 'No active athletes available' },
           ...candidates.map((athlete) => ({ value: athlete.id, label: `${athlete.name}${athlete.squads?.length ? ` · ${athlete.squads.map((squad) => squad.name).join(', ')}` : ''}` })),
        ]} disabled={participantsLoading || Boolean(busy) || Boolean(participantsError) || candidates.length === 0} /><Button onClick={(event) => { operationTriggerRef.current = event.currentTarget; void assign(); }} disabled={participantsLoading || Boolean(busy) || !candidateId || Boolean(participantsError)}>{busy === 'assign' ? 'Assigning...' : 'Assign athlete'}</Button></div>}
       </div>}

      {mutationError && <p className={styles.formError} role="alert">{mutationError}</p>}
      {feedback && <p className={styles.participantFeedback} role="status">{feedback}</p>}
    </section>
  );
}

export function EventsPage({ onUpcomingCountChange, onOpenEvent, today = localToday(), defaultView }: EventsPageProps = {}) {
  const { activeWorkspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [events, setEvents] = useState<AthleticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dateTab, setDateTab] = useState<DateTab>(() => searchParams.get('date') === 'past' || searchParams.get('date') === 'all' ? searchParams.get('date') as DateTab : 'upcoming');
  const [typeFilter, setTypeFilter] = useState<EventType | ''>(() => searchParams.get('type') === 'competition' || searchParams.get('type') === 'training' ? searchParams.get('type') as EventType : '');
  const [statusFilter, setStatusFilter] = useState<EventStatus | ''>(() => ['scheduled', 'in_progress', 'completed', 'cancelled'].includes(searchParams.get('status') ?? '') ? searchParams.get('status') as EventStatus : '');
  const [view, setView] = useState<EventView>(() => {
    if (defaultView) return defaultView;
    return window.innerWidth <= 768 ? 'list' : 'list';
  });
  const todayDate = new Date(`${today}T00:00:00`);
  const [month, setMonth] = useState(() => new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(today);
  const [editor, setEditor] = useState<Editor>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(null);
    void listEvents()
      .then(({ data }) => {
        if (current) setEvents(sortedEvents(data));
      })
      .catch((error: unknown) => {
        if (current) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [activeWorkspace.id, reloadKey]);

  useEffect(() => {
    setSelectedId(null);
    setEditor(null);
    setNotice(null);
  }, [activeWorkspace.id]);

  useEffect(() => {
    if (!loading && !loadError) {
      onUpcomingCountChange?.(
        events.filter((event) => event.status === 'scheduled' && event.date >= today).length,
      );
    }
  }, [events, loadError, loading, onUpcomingCountChange, today]);

  const storeEvent = (event: AthleticsEvent) => {
    setEvents((current) => sortedEvents([...current.filter((item) => item.id !== event.id), event]));
  };

  const filtered = sortedEvents(
    events.filter((event) => {
      const dateMatches = dateTab === 'all' || (dateTab === 'upcoming' ? event.date >= today : event.date < today);
      return dateMatches && (!typeFilter || event.type === typeFilter) && (!statusFilter || event.status === statusFilter);
    }),
    dateTab === 'past',
  );
  const calendarEvents = filtered.filter((event) => event.date === selectedDay);
  const hasFilters = dateTab !== 'upcoming' || Boolean(typeFilter) || Boolean(statusFilter);
  const pending = editorBusy;

  const saveEditor = async (payload: EventMutationPayload) => {
    const event = editor === 'new' ? await createEvent(payload) : await updateEvent(editor!.id, payload);
    storeEvent(event);
    setEditor(null);
    setNotice(editor === 'new' ? `${event.title} added to the calendar.` : `${event.title} updated.`);
  };

  const clearFilters = () => {
    setDateTab('upcoming');
    setTypeFilter('');
    setStatusFilter('');
    setSearchParams({});
  };

  const updateFilters = (next: { date?: DateTab; type?: EventType | ''; status?: EventStatus | '' }) => {
    const params = new URLSearchParams(searchParams);
    const values = { date: dateTab, type: typeFilter, status: statusFilter, ...next };
    if (values.date === 'upcoming') params.delete('date'); else params.set('date', values.date);
    if (values.type) params.set('type', values.type); else params.delete('type');
    if (values.status) params.set('status', values.status); else params.delete('status');
    setSearchParams(params);
  };

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const leading = first.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const previousDays = new Date(month.getFullYear(), month.getMonth(), 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const rawDay = index - leading + 1;
    if (rawDay < 1) return { day: previousDays + rawDay, current: false, iso: '' };
    if (rawDay > days) return { day: rawDay - days, current: false, iso: '' };
    const iso = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(rawDay).padStart(2, '0')}`;
    return { day: rawDay, current: true, iso };
  });

  return (
    <section aria-labelledby="events-heading" aria-busy={loading}>
      <header className={styles.viewHeader}>
        <div>
          <p className={styles.eyebrow}>100m season calendar</p>
          <h1 id="events-heading">Events</h1>
          <p>{loading ? 'Loading events...' : `${filtered.length} event${filtered.length === 1 ? '' : 's'} shown`}</p>
        </div>
        <div className={styles.controls}>
          <div className={styles.segmented} role="group" aria-label="Filter events by date">
            {(['upcoming', 'past', 'all'] as const).map((tab) => (
              <button type="button" key={tab} aria-pressed={dateTab === tab} onClick={() => { setDateTab(tab); updateFilters({ date: tab }); }}>
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <label className={styles.srOnly} htmlFor="event-type-filter">Filter by event type</label>
          <Select id="event-type-filter" value={typeFilter} onChange={(input) => { const value = input.target.value as EventType | ''; setTypeFilter(value); updateFilters({ type: value }); }} options={[
            { value: '', label: 'All types' },
            { value: 'competition', label: 'Competition' },
            { value: 'training', label: 'Training' },
          ]} />
          <label className={styles.srOnly} htmlFor="event-status-filter">Filter by event status</label>
          <Select id="event-status-filter" icon="status" dotColors={{ scheduled: '#0092BC', in_progress: '#8AE9F2', completed: '#005E83', cancelled: '#E2664F' }} value={statusFilter} onChange={(input) => { const value = input.target.value as EventStatus | ''; setStatusFilter(value); updateFilters({ status: value }); }} options={[
            { value: '', label: 'All statuses' },
            { value: 'scheduled', label: 'Scheduled' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]} />
          <div className={styles.viewToggle} role="group" aria-label="Event view">
            <button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}>☷</button>
            <button type="button" aria-label="Calendar view" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>□</button>
          </div>
            <Button ref={addButtonRef} onClick={() => setEditor('new')} disabled={loading || Boolean(loadError) || pending}>Add event</Button>
        </div>
      </header>

       {notice && <Toast variant="success" onDismiss={() => setNotice(null)}>{notice}</Toast>}

      {loading && <div className={styles.loading} role="status" aria-live="polite"><span /><span /><span /><p>Loading events...</p></div>}
      {!loading && loadError && <div className={styles.loadError} role="alert"><h2>Events unavailable</h2><p>{loadError}</p><Button onClick={() => setReloadKey((value) => value + 1)}>Try again</Button></div>}
       {!loading && !loadError && events.length === 0 && <div className={styles.emptyPanel}><EmptyState title="No events yet" description="Add your first 100m competition or training session." /><Button onClick={() => setEditor('new')}>Add your first event</Button></div>}

      {!loading && !loadError && events.length > 0 && view === 'calendar' && (
        <div className={styles.calendar}>
          <header>
            <h2>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <div><button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div>
          </header>
          <div className={styles.calendarGrid}>
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => <span className={styles.dayName} key={day}><span aria-hidden="true">{day[0]}</span><span className={styles.srOnly}>{day}</span></span>)}
            {cells.map((cell, index) => {
              const dayEvents = cell.iso ? filtered.filter((event) => event.date === cell.iso) : [];
              const label = cell.current ? `${formattedDate(cell.iso, true)}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : `Outside current month, day ${cell.day}`;
              return <button type="button" disabled={!cell.current} className={cell.iso === today ? styles.today : undefined} aria-label={label} aria-pressed={cell.iso === selectedDay} onClick={() => setSelectedDay(cell.iso)} key={`${cell.day}-${index}`}><span>{cell.day}</span><i aria-hidden="true">{dayEvents.slice(0, 3).map((event) => <i data-type={event.type} key={event.id} />)}</i></button>;
            })}
          </div>
        </div>
      )}

      {!loading && !loadError && events.length > 0 && view === 'calendar' && <h2 className={styles.dayHeading}>Events on {formattedDate(selectedDay, true)}</h2>}

      {!loading && !loadError && events.length > 0 && ((view === 'list' && filtered.length === 0) || (view === 'calendar' && calendarEvents.length === 0)) && (
        <div className={styles.emptyPanel}>
          <EmptyState title={view === 'calendar' ? 'Nothing scheduled on this day' : 'No events match your filters'} description="Choose another date or adjust the event filters." />
          {hasFilters && <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
        </div>
      )}

      {!loading && !loadError && (view === 'list' ? filtered : calendarEvents).length > 0 && (
        <div className={styles.list} aria-label="Event calendar list">
          {view === 'list' ? (
            // Group events by date for mobile agenda / list view
            Object.entries(
              filtered.reduce<Record<string, AthleticsEvent[]>>((groups, event) => {
                const d = event.date;
                groups[d] ??= [];
                groups[d].push(event);
                return groups;
              }, {})
            ).sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate)).map(([dateKey, dateEvents]) => (
              <div key={dateKey} className={styles.agendaGroup}>
                <h3 className={styles.agendaDateHeading}>{formattedDate(dateKey, true)}</h3>
                <div className={styles.agendaGroupEvents}>
                  {dateEvents.map((event) => {
                    const date = new Date(`${event.date}T00:00:00`);
                    return (
                      <Card className={styles.eventCard} key={event.id}>
                        <button type="button" className={styles.eventOpen} onClick={() => {
                          const detailPath = `/console/events/${event.id}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
                          if (onOpenEvent) onOpenEvent(event.id); else if (location.pathname.startsWith('/console')) navigate(detailPath); else setSelectedId(event.id);
                        }}>
                          <time className={styles.dateBlock} dateTime={event.date}><b>{date.getDate()}</b><small>{date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</small></time>
                          <span className={styles.eventBody}>
                            <strong>{event.title}</strong>
                            <span>
                              <i data-type={event.type}>{formattedType(event.type)}</i>
                              <i data-status={event.status}>{formattedStatus(event.status)}</i>
                            </span>
                            <small>{event.time ?? 'Time not set'} · {event.locationName ?? 'Location not set'}</small>
                          </span>
                          <span aria-hidden="true">›</span>
                        </button>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            calendarEvents.map((event) => {
              const date = new Date(`${event.date}T00:00:00`);
              return (
                <Card className={styles.eventCard} key={event.id}>
                    <button type="button" className={styles.eventOpen} onClick={() => {
                      const detailPath = `/console/events/${event.id}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
                      if (onOpenEvent) onOpenEvent(event.id); else if (location.pathname.startsWith('/console')) navigate(detailPath); else setSelectedId(event.id);
                    }}>
                    <time className={styles.dateBlock} dateTime={event.date}><b>{date.getDate()}</b><small>{date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</small></time>
                    <span className={styles.eventBody}><strong>{event.title}</strong><span><i data-type={event.type}>{formattedType(event.type)}</i><i data-status={event.status}>{formattedStatus(event.status)}</i></span><small>{event.time ?? 'Time not set'} · {event.locationName ?? 'Location not set'}</small></span>
                    <span aria-hidden="true">›</span>
                  </button>
                </Card>
              );
            })
          )}
        </div>
      )}

      <Modal open={editor !== null} title={editor === 'new' ? 'Add event' : 'Edit event'} onClose={() => { if (!editorBusy) setEditor(null); }} closeDisabled={editorBusy}>
        {editor && <EventForm key={editor === 'new' ? 'new' : editor.id} event={editor === 'new' ? undefined : editor} onSave={saveEditor} onCancel={() => setEditor(null)} onSubmittingChange={setEditorBusy} />}
      </Modal>
      <Modal open={selectedId !== null} title={events.find((event) => event.id === selectedId)?.title ?? 'Event detail'} onClose={() => setSelectedId(null)} closeDisabled={detailBusy}>
        {selectedId && <EventDetailPage eventId={selectedId} initialEvent={events.find((event) => event.id === selectedId)} onEventUpdated={storeEvent} onBusyChange={setDetailBusy} onBack={() => setSelectedId(null)} />}
      </Modal>
    </section>
  );
}
