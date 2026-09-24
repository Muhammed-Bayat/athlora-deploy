import { useEffect, useState } from 'react';
import { getPublicClubSessionResults, type PublicClubSessionResults } from '../../api/publicStatistics';
import styles from './PublicStatsPage.module.css';

function formatValue(value: number | null, precision: number, unit: string): string {
  if (value === null) return '—';
  const suffix = unit === 'seconds' ? 's' : unit;
  return `${value.toFixed(precision)} ${suffix}`;
}

export function PublicSessionResults({ clubId }: { clubId: string }) {
  const [meetings, setMeetings] = useState<PublicClubSessionResults[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clubId) {
      setMeetings([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getPublicClubSessionResults(clubId, controller.signal)
      .then((data) => setMeetings(data))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load session results');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [clubId]);

  if (!clubId) return null;
  if (loading) return <p className={styles.loading} role="status">Loading session results...</p>;
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (meetings.length === 0) return null;

  return (
    <section className={styles.explorer} aria-label="Published session results">
      <div className={styles.explorerHeading}>
        <div>
          <p className={styles.kicker}>Session results</p>
          <h2>Team places and races</h2>
        </div>
        <p>Public places for sessions the club has published. Team times never count as individual personal bests.</p>
      </div>
      {meetings.map((meeting) => (
        <article key={meeting.eventId} aria-label={`${meeting.eventTitle} results`}>
          <h3>{meeting.eventTitle}</h3>
          <p>{meeting.eventDate}</p>
          {meeting.sessions.map((session) => (
            <div key={session.id}>
              <h4>{session.disciplineLabel} — {session.label}</h4>
              <div className={styles.tableScroll}>
                <table className={styles.comparisonTable} aria-label={`${session.label} standings`}>
                  <thead>
                    <tr>
                      <th scope="col">Place</th>
                      <th scope="col">Team</th>
                      <th scope="col">Members</th>
                      <th scope="col">Result</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.results.map((row) => (
                      <tr key={row.entrantId}>
                        <td>{row.placing ?? '—'}</td>
                        <td>{row.name}</td>
                        <td>{row.members.length ? row.members.map((member) => member.name).join(' → ') : '—'}</td>
                        <td>{formatValue(row.value, session.precision, session.unit)}</td>
                        <td>{row.outcome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
