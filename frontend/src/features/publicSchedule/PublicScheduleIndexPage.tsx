import { useEffect, useState, type FormEvent } from 'react';
import { listPublicScheduleClubs } from '../../api/publicSchedule';
import { ClubBadge } from '../../components';
import type { PublicClub } from '../../types';
import { PublicScheduleLayout } from './PublicScheduleLayout';
import styles from './PublicSchedulePage.module.css';

export function PublicScheduleIndexPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    void listPublicScheduleClubs(query, controller.signal)
      .then((response) => { if (current) setClubs(response.data); })
      .catch((cause: unknown) => {
        if (!current || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Could not load published schedules');
      })
      .finally(() => { if (current && !controller.signal.aborted) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [query]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(search.trim());
  };

  return (
    <PublicScheduleLayout activeNav="schedule">
      <section className={styles.hero} aria-labelledby="public-schedule-heading">
        <p className={styles.kicker}>Public schedule</p>
        <h1 id="public-schedule-heading">Upcoming meets, <em>out in the open.</em></h1>
        <p>Browse the future fixtures of clubs that choose to publish their schedule on Athlora. No sign-in required.</p>
        <form className={styles.searchForm} role="search" onSubmit={handleSubmit}>
          <div className={styles.searchField}>
            <label htmlFor="schedule-club-search">Search published clubs</label>
            <input
              id="schedule-club-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Club name"
              autoComplete="off"
            />
          </div>
          <button type="submit">Search</button>
        </form>
      </section>

      <section aria-labelledby="schedule-club-list-heading">
        <div className={styles.sectionHeading}><h2 id="schedule-club-list-heading">Clubs with published schedules</h2></div>
        <div aria-live="polite" className={styles.srOnly}>{loading ? 'Loading published schedules...' : ''}</div>
        {loading && <p className={`${styles.state} ${styles.loading}`} role="status">Loading published schedules...</p>}
        {error && <p className={`${styles.state} ${styles.error}`} role="alert">{error}</p>}
        {!loading && !error && clubs.length === 0 && (
          <p className={styles.state} role="status">
            No clubs have published their schedule yet. Check back before the next meet.
          </p>
        )}
        {!loading && !error && clubs.length > 0 && (
          <ul className={styles.clubGrid}>
            {clubs.map((club) => (
              <li key={club.id}>
                <a className={styles.clubCard} href={`/schedule/${encodeURIComponent(club.id)}`}>
                  <h3 className={styles.clubCardHeading}>
                    <ClubBadge name={club.name} branding={club.branding} size="md" decorative />
                    <span>{club.name}</span>
                  </h3>
                  {club.branding?.description && <p className={styles.clubCardDescription}>{club.branding.description}</p>}
                  <span className={styles.clubCardCta}>View schedule</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PublicScheduleLayout>
  );
}
