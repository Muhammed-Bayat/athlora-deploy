import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicLeaderboard, listPublicClubs, listPublicSeasons, type LeaderboardEntry } from '../../api/publicStatistics';
import { listDisciplines } from '../../api/meets';
import type { DisciplineDefinition, PublicClub } from '../../types';
import styles from './PublicStatsPage.module.css';

export function PublicLeaderboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const discipline = searchParams.get('discipline') || '';
  const season = searchParams.get('season') || '';
  const club = searchParams.get('club') || '';
  const gender = searchParams.get('gender') || '';
  const age = searchParams.get('age') || '';

  useEffect(() => {
    void Promise.all([
      listPublicClubs(),
      listPublicSeasons(),
      listDisciplines(),
    ]).then(([c, s, d]) => {
      setClubs(c.data);
      setSeasons(s);
      setDisciplines(d.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getPublicLeaderboard({ discipline, season, club, gender, age }, controller.signal)
      .then((data) => setEntries(data))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load leaderboard');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [discipline, season, club, gender, age]);

  const updateFilter = (key: string, value: string) => {
    startTransition(() => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set(key, value);
      else next.delete(key);
      setSearchParams(next);
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo-removebg.png" alt="" />
          <span>Athlora<small>Performance OS</small></span>
        </a>
        <nav aria-label="Public navigation">
          <a href="/">Home</a>
          <a href="/stats">Stats</a>
          <a href="/stats/leaderboard" className={styles.activeLink} aria-current="page">Leaderboard</a>
          <a href="/schedule">Schedule</a>
          <a className={styles.startLink} href="/">Get started</a>
        </nav>
      </header>
      <main className={styles.main}>
        <div className={styles.explorerHeading}>
          <div>
            <p className={styles.kicker}>Official performance rankings</p>
            <h2>Public athlete leaderboards</h2>
          </div>
          <p>Filtered performance leaderboards across public clubs. Only finalized individual performances are included.</p>
        </div>

        <div className={styles.filtersBar} aria-label="Leaderboard filters">
          <label>
            Discipline
            <select value={discipline} onChange={(e) => updateFilter('discipline', e.target.value)}>
              <option value="">All disciplines</option>
              {disciplines.map((d) => <option key={d.id} value={d.code}>{d.presentation.label}</option>)}
            </select>
          </label>
          <label>
            Season
            <select value={season} onChange={(e) => updateFilter('season', e.target.value)}>
              <option value="">All seasons</option>
              {seasons.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </label>
          <label>
            Club
            <select value={club} onChange={(e) => updateFilter('club', e.target.value)}>
              <option value="">All published clubs</option>
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Gender
            <select value={gender} onChange={(e) => updateFilter('gender', e.target.value)}>
              <option value="">All genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label>
            Age category
            <input type="number" min="5" max="100" placeholder="Exact age" value={age} onChange={(e) => updateFilter('age', e.target.value)} />
          </label>
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {loading && <p className={styles.loading} role="status">Loading leaderboard...</p>}

        {!loading && !error && entries.length === 0 && (
          <p className={styles.empty} role="status">No matching athlete performances found for the selected filters.</p>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className={styles.tableScroll}>
            <table className={styles.comparisonTable} aria-label="Athlete performance leaderboard">
              <thead>
                <tr>
                  <th scope="col">Place</th>
                  <th scope="col">Athlete</th>
                  <th scope="col">Club</th>
                  <th scope="col">Discipline</th>
                  <th scope="col">Performance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.athleteId}:${entry.discipline}`}>
                    <td>{entry.place}</td>
                    <td>{entry.athleteName}</td>
                    <td>{entry.clubName}</td>
                    <td>{entry.label}</td>
                    <td>{entry.performance.toFixed(entry.precision)} {entry.unit === 'seconds' ? 's' : entry.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
