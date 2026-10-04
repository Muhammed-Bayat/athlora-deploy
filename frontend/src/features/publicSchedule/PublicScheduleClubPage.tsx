import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicClubSchedule } from '../../api/publicSchedule';
import { ApiError } from '../../api/client';
import { ClubBadge, EmptyState } from '../../components';
import type { PublicClubSchedule, PublicScheduleEvent } from '../../types';
import { formatDateOnly } from '../../utils/formatting';
import { PublicScheduleLayout } from './PublicScheduleLayout';
import styles from './PublicSchedulePage.module.css';

function formatTimeOnly(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function MeetCard({ event }: { event: PublicScheduleEvent }) {
  const datetime = event.time ? `${event.date}T${event.time}` : `${event.date}T00:00:00`;
  const disciplines = event.disciplines.length > 0
    ? event.disciplines
    : (event.discipline ? [{ code: event.discipline, label: event.discipline }] : []);

  return (
    <li>
      <article className={styles.meetCard} aria-label={event.title}>
        <h3 className={styles.meetTitle}>{event.title}</h3>
        <span className={styles.meetType}>{event.type === 'training' ? 'Training' : 'Competition'}</span>
        <p className={styles.meetWhen}>
          <time dateTime={datetime}>
            {formatDateOnly(event.date)}{event.time ? `, ${formatTimeOnly(event.time)}` : ''}
          </time>
        </p>
        {event.locationName && <p className={styles.meetVenue}>Venue: {event.locationName}</p>}
        {disciplines.length > 0 && (
          <ul className={styles.disciplineList} aria-label={`Disciplines at ${event.title}`}>
            {disciplines.map((discipline) => (
              <li key={discipline.code} className={styles.disciplineChip}>{discipline.label}</li>
            ))}
          </ul>
        )}
      </article>
    </li>
  );
}

export function PublicScheduleClubPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [schedule, setSchedule] = useState<PublicClubSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clubId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let current = true;
    const controller = new AbortController();
    setLoading(true);
    setNotFound(false);
    setError(null);
    setSchedule(null);
    void getPublicClubSchedule(clubId, controller.signal)
      .then((response) => { if (current) setSchedule(response); })
      .catch((cause: unknown) => {
        if (!current || controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setNotFound(true);
        } else {
          setError(cause instanceof Error ? cause.message : 'Could not load this schedule');
        }
      })
      .finally(() => { if (current && !controller.signal.aborted) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [clubId]);

  if (notFound) {
    return (
      <PublicScheduleLayout activeNav="schedule">
        <section className={styles.hero} aria-labelledby="schedule-unavailable-heading" role="alert">
          <p className={styles.kicker}>Schedule unavailable</p>
          <h1 id="schedule-unavailable-heading">This schedule isn&apos;t published.</h1>
          <p>The club may not share its schedule publicly, or the link is incorrect. Nothing is disclosed about unpublished clubs.</p>
          <div className={styles.stateLinks}>
            <a href="/schedule">Browse published schedules</a>
            <a href="/">Back to home</a>
          </div>
        </section>
      </PublicScheduleLayout>
    );
  }

  return (
    <PublicScheduleLayout activeNav="schedule">
      <div aria-live="polite" className={styles.srOnly}>{loading ? 'Loading club schedule...' : ''}</div>
      {loading && <p className={`${styles.state} ${styles.loading}`} role="status">Loading club schedule...</p>}
      {error && !loading && <p className={`${styles.state} ${styles.error}`} role="alert">{error}</p>}
      {schedule && (
        <>
          <section className={styles.identity} aria-labelledby="club-schedule-heading">
            <a className={styles.backLink} href="/schedule">← All published schedules</a>
            <p className={styles.kicker}>Upcoming meets</p>
            <h1 id="club-schedule-heading" className={styles.identityHeading}>
              <ClubBadge name={schedule.club.name} branding={schedule.club.branding} size="lg" decorative />
              <span>{schedule.club.name}</span>
            </h1>
            <span className={styles.identityAccent} aria-hidden="true" />
            {schedule.club.branding?.description && <p className={styles.identityDescription}>{schedule.club.branding.description}</p>}
          </section>

          <section aria-labelledby="upcoming-meets-heading">
            <div className={styles.sectionHeading}>
              <h2 id="upcoming-meets-heading">Schedule</h2>
            </div>
            {schedule.events.length === 0 ? (
              <EmptyState
                title="No upcoming meets"
                description={`${schedule.club.name} has no future meets on the calendar right now. Check back soon.`}
              />
            ) : (
              <ul className={styles.meetList}>
                {schedule.events.map((event) => <MeetCard key={event.id} event={event} />)}
              </ul>
            )}
          </section>
        </>
      )}
    </PublicScheduleLayout>
  );
}
