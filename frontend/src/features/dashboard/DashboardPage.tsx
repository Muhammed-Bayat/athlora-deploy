import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { getDashboardSummary } from '../../api/dashboard';
import type {
  AthleteResultHistoryEntry,
  DashboardActiveEvent,
  DashboardSummary,
  DashboardTimelineEntry,
} from '../../types';
import { format100mSeconds, formatDateOnly, formatOutcome } from '../../utils/formatting';
import { getIncidentTypeLabel } from '../results/resultPresentation';
import styles from './DashboardPage.module.css';

export interface DashboardPageProps {
  onOpenRoster: () => void;
  onOpenAthlete: (athleteId: string) => void;
  onOpenEvents: () => void;
  onOpenEvent: (eventId: string) => void;
  onResumeLogging: (eventId: string) => void;
  onSummaryLoaded?: (summary: DashboardSummary) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return 'Could not reach Athlora. Check your connection and try again.';
    if (error.status === 401) return 'Your session could not be authorized. Please sign in again.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

function eventTypeLabel(type: 'competition' | 'training'): string {
  return type === 'competition' ? 'Competition' : 'Training';
}

function eventTime(time: string | null): string {
  return time ? time.slice(0, 5) : 'Time not set';
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function TimelineEntryRow({ item }: { item: DashboardTimelineEntry }) {
  const { entry, athlete } = item;
  const value = entry.value !== null && entry.unit === 'seconds'
    ? format100mSeconds(entry.value)
    : null;

  return (
    <li className={styles.timelineRow}>
      <span className={styles.apiAvatar} aria-hidden="true">{initials(athlete.name)}</span>
      <span className={styles.rowBody}>
        <span className={styles.rowHeading}>
          <strong>{athlete.name}</strong>
          {athlete.archivedAt && <span className={styles.archivedBadge}>Archived</span>}
        </span>
        <span className={styles.entryDetails}>
          <span className={styles.typeBadge}>{entry.entryType}</span>
          {value && <strong>{value}</strong>}
          {entry.incidentType && <span className={styles.incidentBadge}>{getIncidentTypeLabel(entry.incidentType)}</span>}
          {entry.isFoul && <span className={styles.incidentBadge}>Foul</span>}
        </span>
        {entry.noteText && <span className={styles.note}>{entry.noteText}</span>}
      </span>
    </li>
  );
}

function ResultRow({ item, onOpenAthlete }: {
  item: AthleteResultHistoryEntry;
  onOpenAthlete: (athleteId: string) => void;
}) {
  const resultLabel = item.effectiveResult !== null
    ? format100mSeconds(item.effectiveResult)
    : formatOutcome(item.effectiveOutcome);

  return (
    <li>
      <button type="button" className={styles.resultRow} onClick={() => onOpenAthlete(item.athlete.id)}>
        <span className={styles.apiAvatar} aria-hidden="true">{initials(item.athlete.name)}</span>
        <span className={styles.rowBody}>
          <span className={styles.rowHeading}>
            <strong>{item.athlete.name}</strong>
            {item.athlete.archivedAt && <span className={styles.archivedBadge}>Archived</span>}
          </span>
          <small>{item.event.title} · {formatDateOnly(item.event.date)}</small>
        </span>
        <span className={styles.resultValue}>
          <strong>{resultLabel}</strong>
          {item.result.isPb && <span className={styles.pbBadge}>PB</span>}
        </span>
      </button>
    </li>
  );
}

function LiveDashboard({ activeEvent, onResumeLogging }: {
  activeEvent: DashboardActiveEvent;
  onResumeLogging: (eventId: string) => void;
}) {
  const { event, progress, latestEntries } = activeEvent;
  const remaining = Math.max(progress.participantCount - progress.athletesWithEntriesCount, 0);

  return (
    <>
      <section className={styles.liveHero} aria-labelledby="live-event-title">
        <div className={styles.liveCopy}>
          <p className={styles.liveKicker}><span aria-hidden="true" /> Live event</p>
          <h2 id="live-event-title">{event.title}</h2>
          <div className={styles.eventMeta}>
            <span>{eventTypeLabel(event.type)}</span>
            <time dateTime={event.date}>{formatDateOnly(event.date)}</time>
            <span>{eventTime(event.time)}</span>
            <span>{event.locationName ?? 'Location not set'}</span>
          </div>
          <button type="button" className={styles.primaryAction} onClick={() => onResumeLogging(event.id)}>
            Resume live logging
          </button>
        </div>
        <div className={styles.completion}>
          <strong>{progress.completionPercent}%</strong>
          <span>complete</span>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Event completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.completionPercent}
          >
            <span style={{ width: `${progress.completionPercent}%` }} />
          </div>
        </div>
      </section>

      <section className={styles.metricGrid} aria-label="Live event progress">
        <article><strong>{progress.participantCount}</strong><span>Participants</span></article>
        <article><strong>{progress.athletesWithEntriesCount}</strong><span>Logged</span></article>
        <article><strong>{remaining}</strong><span>Remaining</span></article>
        <article><strong>{progress.resolvedResultsCount}</strong><span>Resolved</span></article>
        <article><strong>{progress.entryCount}</strong><span>Entries</span></article>
      </section>

      <section className={styles.apiPanel} aria-labelledby="latest-entries-title">
        <header className={styles.panelHeader}>
          <div><p>Track-side feed</p><h2 id="latest-entries-title">Latest entries</h2></div>
        </header>
        {progress.participantCount === 0 ? (
          <p className={styles.emptyCopy}>No participants are assigned to this event.</p>
        ) : latestEntries.length === 0 ? (
          <p className={styles.emptyCopy}>No entries have been logged yet.</p>
        ) : (
          <ul className={styles.rowList}>{latestEntries.map((item) => <TimelineEntryRow item={item} key={item.entry.id} />)}</ul>
        )}
      </section>
    </>
  );
}

function SummaryDashboard({ summary, onOpenRoster, onOpenAthlete, onOpenEvents, onOpenEvent }: {
  summary: DashboardSummary;
  onOpenRoster: () => void;
  onOpenAthlete: (athleteId: string) => void;
  onOpenEvents: () => void;
  onOpenEvent: (eventId: string) => void;
}) {
  return (
    <>
      <section className={styles.summaryHero} aria-labelledby="dashboard-summary-title">
        <div>
          <p className={styles.eyebrow}>Squad overview · <time dateTime={summary.asOfDate}>{formatDateOnly(summary.asOfDate)}</time></p>
          <h2 id="dashboard-summary-title">Performance in motion.</h2>
          <p>A factual snapshot of your active roster, event calendar, and recorded results.</p>
        </div>
        <dl className={styles.heroFacts}>
          <div><dt>Active roster</dt><dd>{summary.activeAthletesCount}</dd></div>
          <div><dt>Total athletes</dt><dd>{summary.athletesCount}</dd></div>
          <div><dt>Archived</dt><dd>{summary.archivedAthletesCount}</dd></div>
          <div><dt>Upcoming</dt><dd>{summary.upcomingEventCount}</dd></div>
          <div><dt>Season PBs</dt><dd>{summary.seasonPbs}</dd></div>
        </dl>
      </section>

      {(summary.athletesCount === 0 || summary.upcomingEventCount === 0) && (
        <section className={styles.onboarding} aria-label="Dashboard setup">
          {summary.athletesCount === 0 && <div><h2>No athletes yet</h2><p>Add athletes to build your roster and track their performances.</p><button type="button" onClick={onOpenRoster}>Open roster</button></div>}
          {summary.upcomingEventCount === 0 && <div><h2>No upcoming events</h2><p>Plan a competition or training session for your squad.</p><button type="button" onClick={onOpenEvents}>Open events</button></div>}
        </section>
      )}

      <div className={styles.twoColumn}>
        <section className={styles.apiPanel} aria-labelledby="roster-snapshot-title">
          <header className={styles.panelHeader}><div><p>Roster intelligence</p><h2 id="roster-snapshot-title">Roster snapshot</h2></div><button type="button" onClick={onOpenRoster}>View all</button></header>
          {summary.rosterSnapshot.length === 0 ? <p className={styles.emptyCopy}>No active athletes to show.</p> : (
            <ul className={styles.rowList}>{summary.rosterSnapshot.map((athlete) => (
              <li key={athlete.athleteId}><button type="button" className={styles.apiRosterRow} onClick={() => onOpenAthlete(athlete.athleteId)}><span className={styles.apiAvatar} aria-hidden="true">{initials(athlete.name)}</span><span className={styles.rowBody}><strong>{athlete.name}</strong><small>{athlete.discipline} · {athlete.squad ?? 'No squad assigned'}</small></span><span className={styles.resultValue}><strong>{athlete.pb === null ? 'No PB' : format100mSeconds(athlete.pb)}</strong><small>Personal best</small></span></button></li>
            ))}</ul>
          )}
        </section>

        <section className={styles.apiPanel} aria-labelledby="upcoming-events-title">
          <header className={styles.panelHeader}><div><p>Calendar</p><h2 id="upcoming-events-title">Upcoming events</h2></div><button type="button" onClick={onOpenEvents}>View all</button></header>
          {summary.upcomingEvents.length === 0 ? <p className={styles.emptyCopy}>No upcoming events to show.</p> : (
            <ul className={styles.rowList}>{summary.upcomingEvents.map((event) => (
              <li key={event.eventId}><button type="button" className={styles.eventButton} onClick={() => onOpenEvent(event.eventId)}><time dateTime={event.date}><strong>{formatDateOnly(event.date)}</strong><span>{eventTime(event.time)}</span></time><span className={styles.rowBody}><strong>{event.title}</strong><small>{eventTypeLabel(event.type)} · {event.locationName ?? 'Location not set'}</small></span><span className={styles.eventCount}>{event.athleteCount} athlete{event.athleteCount === 1 ? '' : 's'}</span></button></li>
            ))}</ul>
          )}
        </section>
      </div>

      <div className={styles.twoColumn}>
        <section className={styles.apiPanel} aria-labelledby="recent-results-title">
          <header className={styles.panelHeader}><div><p>Results</p><h2 id="recent-results-title">Recent results</h2></div></header>
          {summary.recentResults.length === 0 ? <p className={styles.emptyCopy}>No results recorded yet.</p> : <ul className={styles.rowList}>{summary.recentResults.map((item, index) => <ResultRow item={item} onOpenAthlete={onOpenAthlete} key={`${item.event.id}-${item.athlete.id}-${index}`} />)}</ul>}
        </section>
        <section className={styles.apiPanel} aria-labelledby="recent-pbs-title">
          <header className={styles.panelHeader}><div><p>Performance</p><h2 id="recent-pbs-title">Recent PBs</h2></div></header>
          {summary.recentPbs.length === 0 ? <p className={styles.emptyCopy}>No personal bests recorded yet.</p> : <ul className={styles.rowList}>{summary.recentPbs.map((item, index) => <ResultRow item={item} onOpenAthlete={onOpenAthlete} key={`${item.event.id}-${item.athlete.id}-${index}`} />)}</ul>}
        </section>
      </div>
    </>
  );
}

export function DashboardPage(props: DashboardPageProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const onSummaryLoadedRef = useRef(props.onSummaryLoaded);
  onSummaryLoadedRef.current = props.onSummaryLoaded;

  useEffect(() => {
    let current = true;
    setSummary(null);
    setLoadError(null);

    void getDashboardSummary().then((nextSummary) => {
      if (!current) return;
      setSummary(nextSummary);
      onSummaryLoadedRef.current?.(nextSummary);
    }).catch((error: unknown) => {
      if (current) setLoadError(errorMessage(error));
    });

    return () => { current = false; };
  }, [reloadKey]);

  if (!summary && !loadError) {
    return <section className={styles.dashboard} aria-busy="true"><div className={styles.loading} role="status" aria-live="polite"><span /><span /><span /><p>Loading dashboard...</p></div></section>;
  }

  if (loadError) {
    return <section className={styles.dashboard}><div className={styles.loadError} role="alert"><h2>Dashboard unavailable</h2><p>{loadError}</p><button type="button" className={styles.primaryAction} onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div></section>;
  }

  const isLive = summary!.state === 'live' && summary!.activeEvent !== null;
  return (
    <section className={styles.dashboard} aria-label="Dashboard overview">
      {isLive
        ? <LiveDashboard activeEvent={summary!.activeEvent!} onResumeLogging={props.onResumeLogging} />
        : <SummaryDashboard summary={summary!} onOpenRoster={props.onOpenRoster} onOpenAthlete={props.onOpenAthlete} onOpenEvents={props.onOpenEvents} onOpenEvent={props.onOpenEvent} />}
    </section>
  );
}
