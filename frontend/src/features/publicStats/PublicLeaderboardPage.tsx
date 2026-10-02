import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicLeaderboard, listPublicClubs, listPublicSeasons, listPublicStatisticsReportDisciplines, type LeaderboardEntry, type PublicStatisticsReportDiscipline } from '../../api/publicStatistics';
import { PublicNavigation } from '../../components/PublicNavigation';
import { Input, Select } from '../../components';
import type { PublicClub } from '../../types';
import { formatResultUnit } from '../../utils/formatting';
import styles from './PublicStatsPage.module.css';

const exactAge = /^(?:[5-9]|[1-9]\d|100)$/;

export function PublicLeaderboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [disciplines, setDisciplines] = useState<PublicStatisticsReportDiscipline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const discipline = searchParams.get('discipline') || '';
  const season = searchParams.get('season') || '';
  const club = searchParams.get('club') || '';
  const gender = searchParams.get('gender') || '';
  const age = searchParams.get('age') || '';
  const [ageDraft, setAgeDraft] = useState(age);
  const ageError = ageDraft !== '' && !exactAge.test(ageDraft);

  useEffect(() => {
    setAgeDraft(age);
  }, [age]);

  useEffect(() => {
    void Promise.all([
      listPublicClubs(),
      listPublicSeasons(),
      listPublicStatisticsReportDisciplines(),
    ]).then(([c, s, d]) => {
      setClubs(c.data);
      setSeasons(s);
      setDisciplines(d);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getPublicLeaderboard({ discipline, season: season || 'all', club, gender, age }, controller.signal)
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

  const updateAge = (value: string) => {
    setAgeDraft(value);
    if (value === '' || exactAge.test(value)) updateFilter('age', value);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          <img src="/logo-removebg.png" alt="" />
          <span>Athlora<small>Performance OS</small></span>
        </a>
        <PublicNavigation current="leaderboard" />
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
            <Select aria-label="Discipline" value={discipline} onChange={(e) => updateFilter('discipline', e.target.value)} options={[{ value: '', label: 'All disciplines' }, ...disciplines.map((d) => ({ value: d.code, label: d.label }))]} searchable searchPlaceholder="Search disciplines" emptyMessage="No configured disciplines match" />
          </label>
          <label>
            Season
            <Select aria-label="Season" value={season} onChange={(e) => updateFilter('season', e.target.value)} options={[{ value: '', label: 'All seasons' }, ...seasons.map((yr) => ({ value: String(yr), label: String(yr) }))]} />
          </label>
          <label>
            Club
            <Select aria-label="Club" value={club} onChange={(e) => updateFilter('club', e.target.value)} options={[{ value: '', label: 'All published clubs' }, ...clubs.map((c) => ({ value: c.id, label: c.name }))]} searchable searchPlaceholder="Search published clubs" emptyMessage="No published clubs match" />
          </label>
          <label>
            Gender
            <Select aria-label="Gender" value={gender} onChange={(e) => updateFilter('gender', e.target.value)} options={[{ value: '', label: 'All genders' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
          </label>
          <label>
            Age
            <Input aria-invalid={ageError} type="number" min="5" max="100" step="1" inputMode="numeric" placeholder="Exact age" value={ageDraft} onChange={(e) => updateAge(e.target.value)} />
          </label>
        </div>

        {ageError && <p className={styles.error} role="alert">Age must be a whole number from 5 to 100.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {loading && <p className={styles.loading} role="status">Loading leaderboard...</p>}

        {!loading && !error && entries.length === 0 && (
          <p className={styles.empty} role="status">No matching athlete performances found for the selected filters.</p>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className={`${styles.resultsTable} ${styles.tableScroll}`}>
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
                    <td>{entry.performance.toFixed(entry.precision)} {formatResultUnit(entry.unit)}</td>
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
