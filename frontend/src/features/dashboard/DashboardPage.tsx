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

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning, Coach';
  if (hour < 18) return 'Good afternoon, Coach';
  return 'Good evening, Coach';
}

function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function isWithinDays(date: string, reference: string, maxDays: number): boolean {
  const diff = (new Date(`${date}T00:00:00`).getTime() - new Date(`${reference}T00:00:00`).getTime()) / 86400000;
  return diff >= 0 && diff <= maxDays;
}

function trendBuckets(summary: DashboardSummary): { labels: string[]; values: number[] } {
  const labels = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'Now'];
  const target = weekStartOf(summary.asOfDate);
  const start = new Date(`${target}T00:00:00`);
  start.setDate(start.getDate() - 42);
  const weekStarts = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index * 7);
    return d.toISOString().slice(0, 10);
  });
  const values = weekStarts.map(() => 0);
  summary.recentPbs.forEach((item) => {
    const index = weekStarts.indexOf(weekStartOf(item.event.date));
    if (index !== -1) values[index] += 1;
  });
  return { labels, values };
}

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof window.requestAnimationFrame !== 'function') {
      el.textContent = String(value);
      return;
    }
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min((Date.now() - start) / 750, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(eased * value));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return <span className={styles.statNum} ref={ref}>{value}</span>;
}

function SummaryHeroCopy({ summary }: { summary: DashboardSummary }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const readiness = summary.athletesCount > 0
    ? Math.round((summary.activeAthletesCount / summary.athletesCount) * 100)
    : 0;

  return (
    <div className={styles.summaryHeroCopy}>
      <p className={styles.summaryKicker}><span aria-hidden="true" />{greetingForHour(now.getHours())}</p>
      <h2 id="dashboard-summary-title">Performance.<br /><span>In<br />motion.</span></h2>
      <p className={styles.summaryLead}>
        <strong>{summary.activeAthletesCount} of {summary.athletesCount} athlete{summary.athletesCount === 1 ? '' : 's'}</strong> {summary.activeAthletesCount === 1 ? 'is' : 'are'} active,
        with <strong>{summary.upcomingEventCount} upcoming event{summary.upcomingEventCount === 1 ? '' : 's'}</strong> and
        <strong> {summary.seasonPbs} season PB{summary.seasonPbs === 1 ? '' : 's'}</strong> on the board.
      </p>
      <div className={styles.summaryMeta}>
        <div><small>Local time</small><strong><time dateTime={now.toISOString()}>{now.toLocaleTimeString('en-GB')}</time></strong></div>
        <div><small>Active roster</small><strong>{summary.activeAthletesCount}</strong></div>
        <div><small>Squad readiness</small><strong>{readiness}%</strong></div>
      </div>
    </div>
  );
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

function StatRow({ summary }: { summary: DashboardSummary }) {
  const next14 = summary.upcomingEvents.filter((event) => isWithinDays(event.date, summary.asOfDate, 14)).length;
  const stats = [
    {
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5c0-3.2 2.4-5.5 5.5-5.5s5.5 2.3 5.5 5.5" /><circle cx="17.5" cy="9" r="2.4" /><path d="M15.4 14.2c2.2.3 4 2.3 4.1 5.1" /></svg>,
      label: 'Athletes',
      value: summary.athletesCount,
      delta: `${summary.activeAthletesCount} active`,
      context: `${summary.activeAthletesCount} active of ${summary.athletesCount} total`,
      progress: summary.athletesCount > 0 ? Math.round((summary.activeAthletesCount / summary.athletesCount) * 100) : 0,
      featured: true,
    },
    {
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>,
      label: 'Next 14 days',
      value: next14,
      delta: `${summary.upcomingEventCount} total`,
      context: summary.upcomingEvents[0] ? `Next: ${summary.upcomingEvents[0].title}` : 'Calendar clear',
      progress: Math.min(100, next14 * 18),
      featured: false,
    },
    {
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>,
      label: 'Season PBs',
      value: summary.seasonPbs,
      delta: `${summary.recentPbs.length} recent`,
      context: 'Performance momentum',
      progress: Math.min(100, summary.seasonPbs * 25),
      featured: false,
    },
    {
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>,
      label: 'Events planned',
      value: summary.upcomingEventCount,
      delta: 'on calendar',
      context: 'Competitions and training',
      progress: Math.min(100, summary.upcomingEventCount * 18),
      featured: false,
    },
  ];

  return (
    <section className={styles.statRow} aria-label="Season statistics">
      {stats.map((stat) => (
        <article className={stat.featured ? `${styles.statCard} ${styles.featured}` : styles.statCard} key={stat.label}>
          <div className={styles.statTop}>
            <span className={styles.statIcon} aria-hidden="true">{stat.icon}</span>
            <span className={styles.statDelta}>{stat.delta}</span>
          </div>
          <CountUp value={stat.value} />
          <div className={styles.statLabel}>{stat.label}</div>
          <div className={styles.statExtra}>
            <div className={styles.statTrack}><span style={{ width: `${stat.progress}%` }} /></div>
            <div className={styles.statContext}>{stat.context}</div>
          </div>
        </article>
      ))}
    </section>
  );
}

function TrendPanel({ summary }: { summary: DashboardSummary }) {
  const { labels, values } = trendBuckets(summary);
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  const momentum = values[6] - values[5];
  const momentumLabel = total === 0 ? '—' : `${momentum >= 0 ? '+' : ''}${momentum}`;
  const momentumCopy = total === 0
    ? 'PB movement versus last week. No personal bests were recorded in the last 7 weeks — the next competition block will reset the trend.'
    : momentum > 0
      ? 'PB movement versus last week. The squad is carrying positive performance momentum into the next competition block.'
      : momentum < 0
        ? 'PB movement versus last week. A softer week — useful context for managing load and recovery.'
        : 'PB movement versus last week. Steady output keeps the squad on plan.';

  return (
    <section className={`${styles.panel} ${styles.trendPanel}`} aria-labelledby="pb-trend-title">
      <header className={styles.panelHead}>
        <div><p className={styles.panelEyebrow}>Performance signal</p><h3 id="pb-trend-title">Squad PB Trend</h3></div>
        <span className={styles.trendRange}>Last 7 weeks</span>
      </header>
      <div className={styles.trendLayout}>
        <div className={styles.bars}>
          {labels.map((label, index) => (
            <div className={styles.barCol} key={label}>
              <div className={styles.bar} style={{ height: `${(values[index] / max) * 100}%` }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
        <aside className={styles.trendInsight}>
          <small>Current momentum</small>
          <strong>{momentumLabel}</strong>
          <p>{momentumCopy}</p>
        </aside>
      </div>
    </section>
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
        <SummaryHeroCopy summary={summary} />
        <div className={styles.summaryOrbit} aria-hidden="true">
          <div className={styles.orbitTrack}>
            <svg viewBox="0 0 290 180" fill="none">
              <ellipse cx="145" cy="90" rx="118" ry="55" />
              <ellipse cx="145" cy="90" rx="90" ry="40" />
              <ellipse cx="145" cy="90" rx="60" ry="26" />
            </svg>
            <i /><i /><i />
          </div>
          <p><strong>{summary.activeAthletesCount}</strong> athlete{summary.activeAthletesCount === 1 ? '' : 's'} active in your roster</p>
        </div>
      </section>

      <StatRow summary={summary} />

      {(summary.athletesCount === 0 || summary.upcomingEventCount === 0) && (
        <section className={styles.onboarding} aria-label="Dashboard setup">
          {summary.athletesCount === 0 && <div><h2>No athletes yet</h2><p>Add athletes to build your roster and track their performances.</p><button type="button" onClick={onOpenRoster}>Open roster</button></div>}
          {summary.upcomingEventCount === 0 && <div><h2>No upcoming events</h2><p>Plan a competition or training session for your squad.</p><button type="button" onClick={onOpenEvents}>Open events</button></div>}
        </section>
      )}

      <div className={styles.dashGrid}>
        <section className={styles.panel} aria-labelledby="roster-snapshot-title">
          <header className={styles.panelHead}><div><p className={styles.panelEyebrow}>Roster intelligence</p><h3 id="roster-snapshot-title">Roster snapshot</h3></div><button type="button" className={styles.panelLink} onClick={onOpenRoster}>View all<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></button></header>
          {summary.rosterSnapshot.length === 0 ? <p className={styles.emptyCopy}>No active athletes to show.</p> : (
            <ul className={styles.rowList}>{summary.rosterSnapshot.map((athlete) => (
              <li key={athlete.athleteId}><button type="button" className={styles.apiRosterRow} onClick={() => onOpenAthlete(athlete.athleteId)}><span className={styles.apiAvatar} aria-hidden="true">{initials(athlete.name)}</span><span className={styles.rowBody}><strong>{athlete.name}</strong><small>{athlete.discipline} · {athlete.squad ?? 'No squad assigned'}</small></span><span className={styles.resultValue}><strong>{athlete.pb === null ? 'No PB' : format100mSeconds(athlete.pb)}</strong><small>Personal best</small></span></button></li>
            ))}</ul>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="upcoming-events-title">
          <header className={styles.panelHead}><div><p className={styles.panelEyebrow}>Calendar</p><h3 id="upcoming-events-title">Upcoming events</h3></div><button type="button" className={styles.panelLink} onClick={onOpenEvents}>View all<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></button></header>
          {summary.upcomingEvents.length === 0 ? <p className={styles.emptyCopy}>No upcoming events to show.</p> : (
            <ul className={styles.rowList}>{summary.upcomingEvents.map((event) => (
              <li key={event.eventId}><button type="button" className={styles.eventButton} onClick={() => onOpenEvent(event.eventId)}><time dateTime={event.date} className={styles.eventDateBadge}><strong>{formatDateOnly(event.date)}</strong><span>{eventTime(event.time)}</span></time><span className={styles.rowBody}><strong>{event.title}</strong><small>{eventTypeLabel(event.type)} · {event.locationName ?? 'Location not set'}</small></span><span className={styles.eventCount}>{event.athleteCount} athlete{event.athleteCount === 1 ? '' : 's'}</span></button></li>
            ))}</ul>
          )}
        </section>
      </div>

      <TrendPanel summary={summary} />

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