import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicClubStandings, listPublicSeasons, type PublicClubStanding } from '../../api/publicStatistics';
import { Select } from '../../components';
import { PublicNavigation } from '../../components/PublicNavigation';
import styles from './PublicStatsPage.module.css';

export function PublicStandingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const [seasons, setSeasons] = useState<number[]>([]);
  const [standings, setStandings] = useState<PublicClubStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const season = searchParams.get('season') || '';

  useEffect(() => { void listPublicSeasons().then(setSeasons).catch(() => {}); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void getPublicClubStandings(season || 'all', controller.signal).then(setStandings).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load standings');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [season]);

  const updateSeason = (value: string) => startTransition(() => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('season', value); else next.delete('season');
    setSearchParams(next);
  });

  return <div className={styles.page}>
    <header className={styles.header}><a className={styles.brand} href="/"><img src="/logo-removebg.png" alt="" /><span>Athlora<small>Performance OS</small></span></a><PublicNavigation current="standings" /></header>
    <main className={styles.main}>
      <div className={styles.explorerHeading}><div><p className={styles.kicker}>Shared fixture league</p><h1>Club standings</h1></div><p>Completed shared fixtures award five points for first, three for second, and one for third.</p></div>
      <div className={styles.filtersBar} aria-label="Standings filters"><label>Season<Select aria-label="Season" value={season} onChange={(event) => updateSeason(event.target.value)} options={[{ value: '', label: 'All seasons' }, ...seasons.map((year) => ({ value: String(year), label: String(year) }))]} /></label></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && <p className={styles.loading} role="status">Loading standings...</p>}
      {!loading && !error && !standings.length && <p className={styles.empty} role="status">No public shared-fixture standings are available for this season.</p>}
      {!loading && !error && standings.length > 0 && <div className={`${styles.resultsTable} ${styles.tableScroll}`}><table className={styles.comparisonTable} aria-label="Club league standings"><thead><tr><th scope="col">Rank</th><th scope="col">Club</th><th scope="col">Points</th><th scope="col">Fixtures</th><th scope="col">Wins</th><th scope="col">Second</th><th scope="col">Third</th></tr></thead><tbody>{standings.map((standing) => <tr key={standing.clubId}><td>{standing.rank}</td><td>{standing.clubName}</td><td>{standing.totalPoints}</td><td>{standing.fixtures}</td><td>{standing.wins}</td><td>{standing.seconds}</td><td>{standing.thirds}</td></tr>)}</tbody></table></div>}
    </main>
  </div>;
}
