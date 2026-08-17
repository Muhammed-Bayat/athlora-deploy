import { useEffect, useState } from 'react';
import { listAthletes } from '../../api/athletes';
import { ApiError } from '../../api/client';
import { listEventParticipants } from '../../api/participants';
import { listResults } from '../../api/results';
import { listTimelineEntries } from '../../api/timeline';
import { Button } from '../../components';
import type {
  Athlete,
  AthleticsEvent,
  EventParticipantSummary,
  Result,
  TimelineEntry,
} from '../../types';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { EventResultsView, type ResultCorrectionTarget } from './EventResultsView';
import styles from './EventResults.module.css';

interface EventResultsSectionProps {
  event: AthleticsEvent;
  reloadKey: number;
  onCorrect: (target: ResultCorrectionTarget, trigger: HTMLButtonElement) => void;
}

function resultErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return 'Could not reach Athlora. Check your connection and try again.';
    if (error.status === 401) return 'Your session could not be authorized. Please sign in again.';
    return error.message;
  }
  return 'Event results could not be loaded. Please try again.';
}

export function EventResultsSection({ event, reloadKey, onCorrect }: EventResultsSectionProps) {
  const currentUser = useCurrentUser();
  const [results, setResults] = useState<Result[]>([]);
  const [participants, setParticipants] = useState<EventParticipantSummary[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localReloadKey, setLocalReloadKey] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);

    void Promise.all([
      listResults(event.id),
      listEventParticipants(event.id),
      listTimelineEntries(event.id),
      listAthletes({ includeArchived: true }),
    ]).then(([resultResponse, participantResponse, timelineResponse, athleteResponse]) => {
      if (!current) return;
      setResults(resultResponse.data);
      setParticipants(participantResponse.data);
      setTimeline(timelineResponse.data);
      setAthletes(athleteResponse.data);
    }).catch((loadError: unknown) => {
      if (current) setError(resultErrorMessage(loadError));
    }).finally(() => {
      if (current) setLoading(false);
    });

    return () => {
      current = false;
    };
  }, [event.id, localReloadKey, reloadKey]);

  const outcomeCount = new Set([
    ...participants.map((participant) => participant.athleteId),
    ...results.map((result) => result.athleteId),
  ]).size;

  return (
    <section className={styles.resultsSection} aria-labelledby="event-results-heading" aria-busy={loading}>
      <header className={styles.resultsHeader}>
        <div>
          <p>Authoritative 100m outcomes</p>
          <h3 id="event-results-heading">Event results{!loading && !error ? ` · ${outcomeCount}` : ''}</h3>
        </div>
        <div>
          <Button variant="ghost" onClick={() => setLocalReloadKey((key) => key + 1)} disabled={loading}>
            {loading ? 'Refreshing results...' : error ? 'Retry results' : 'Refresh results'}
          </Button>
        </div>
      </header>

      {loading && <p className={styles.inlineStatus} role="status">Loading event outcomes...</p>}
      {!loading && error && (
        <div className={styles.inlineError} role="alert">
          <span>{error}</span>
        </div>
      )}
      {!loading && !error && (
        <EventResultsView
          event={event}
          results={results}
          participants={participants}
          timeline={timeline}
          athletes={athletes}
          currentUser={currentUser}
          compact
          onCorrect={onCorrect}
        />
      )}
    </section>
  );
}
