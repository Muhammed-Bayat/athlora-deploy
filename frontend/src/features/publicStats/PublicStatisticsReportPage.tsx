import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicStatisticsReport, listPublicClubs, listPublicSeasons, type PublicStatisticsReport } from '../../api/publicStatistics';
import type { PublicClub } from '../../types';
import { downloadFile, reportCsv, reportPdf } from './reportExport';
import styles from './PublicStatsPage.module.css';

const filterKeys = ['discipline', 'season', 'club', 'gender', 'age'] as const;
type FilterKey = typeof filterKeys[number];

export function PublicStatisticsReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const [report, setReport] = useState<PublicStatisticsReport>({ data: [], meta: { count: 0, generatedAt: '' } });
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const filters = Object.fromEntries(filterKeys.map((key) => [key, searchParams.get(key) || ''])) as Record<FilterKey, string>;

  useEffect(() => { void Promise.all([listPublicClubs(), listPublicSeasons()]).then(([clubResponse, years]) => { setClubs(clubResponse.data); setSeasons(years); }).catch(() => {}); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void getPublicStatisticsReport({ discipline: filters.discipline, season: filters.season, club: filters.club, gender: filters.gender, age: filters.age }, controller.signal).then(setReport).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load report');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters.discipline, filters.season, filters.club, filters.gender, filters.age]);

  const updateFilter = (key: FilterKey, value: string) => startTransition(() => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next);
  });
  const exportCsv = () => { setExporting('csv'); downloadFile(reportCsv(report.data), 'athlora-public-statistics-report.csv', 'text/csv;charset=utf-8'); setExporting(null); };
  const exportPdf = async () => { setExporting('pdf'); try { downloadFile(await reportPdf(report.data, filters), 'athlora-public-statistics-report.pdf', 'application/pdf'); } finally { setExporting(null); } };
  const athleteMetrics = Array.from(report.data.reduce((metrics, entry) => {
    const key = `${entry.athleteId}:${entry.discipline}`;
    const current = metrics.get(key);
    const isBetter = !current || (entry.direction === 'lower' ? entry.performance < current.pb : entry.performance > current.pb);
    metrics.set(key, { athleteName: entry.athleteName, clubName: entry.clubName, label: entry.label, unit: entry.unit, precision: entry.precision, pb: isBetter ? entry.performance : current.pb, count: (current?.count ?? 0) + 1 });
    return metrics;
  }, new Map<string, { athleteName: string; clubName: string; label: string; unit: string; precision: number; pb: number; count: number }>()).values());

  return <div className={styles.page}>
    <header className={styles.header}><a className={styles.brand} href="/"><img src="/logo-removebg.png" alt="" /><span>Athlora<small>Performance OS</small></span></a><nav aria-label="Public navigation"><a href="/">Home</a><a href="/stats">Stats</a><a href="/stats/leaderboard">Leaderboard</a><a href="/stats/report" className={styles.activeLink} aria-current="page">Reports</a><a href="/schedule">Schedule</a></nav></header>
    <main className={styles.main}>
      <div className={styles.explorerHeading}><div><p className={styles.kicker}>Live published results</p><h1>Detailed statistics report</h1></div><p>Share this URL to show the same current, finalized public performances. Downloads always match these filters.</p></div>
      <div className={styles.filtersBar} aria-label="Report filters">
        <label>Discipline<input value={filters.discipline} placeholder="e.g. 100m" onChange={(event) => updateFilter('discipline', event.target.value)} /></label>
        <label>Season<select value={filters.season} onChange={(event) => updateFilter('season', event.target.value)}><option value="">All seasons</option>{seasons.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <label>Club<select value={filters.club} onChange={(event) => updateFilter('club', event.target.value)}><option value="">All published clubs</option>{clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
        <label>Gender<select value={filters.gender} onChange={(event) => updateFilter('gender', event.target.value)}><option value="">All genders</option><option value="male">Male</option><option value="female">Female</option></select></label>
        <label>Age category<input type="number" min="5" max="100" value={filters.age} onChange={(event) => updateFilter('age', event.target.value)} /></label>
      </div>
      <div className={styles.comparisonToolbar}><p aria-live="polite">{loading ? 'Loading report...' : `${report.meta.count} published performance${report.meta.count === 1 ? '' : 's'}`}</p><div><button type="button" onClick={exportCsv} disabled={loading || !report.data.length || exporting !== null}>Download CSV</button><button type="button" onClick={() => void exportPdf()} disabled={loading || !report.data.length || exporting !== null}>Download PDF</button></div></div>
      {exporting && <p role="status">Preparing {exporting.toUpperCase()} download...</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!loading && !error && !report.data.length && <p className={styles.empty} role="status">No matching published performances found.</p>}
      {!loading && !error && report.data.length > 0 && <><div className={styles.tableScroll}><table className={styles.comparisonTable} aria-label="Athlete report metrics"><thead><tr><th scope="col">Athlete</th><th scope="col">Club</th><th scope="col">Discipline</th><th scope="col">Personal best</th><th scope="col">Finalized results</th></tr></thead><tbody>{athleteMetrics.map((metric) => <tr key={`${metric.athleteName}:${metric.label}`}><td>{metric.athleteName}</td><td>{metric.clubName}</td><td>{metric.label}</td><td>{metric.pb.toFixed(metric.precision)} {metric.unit === 'seconds' ? 's' : metric.unit}</td><td>{metric.count}</td></tr>)}</tbody></table></div><div className={styles.tableScroll}><table className={styles.comparisonTable} aria-label="Detailed public statistics report"><caption>Performance history and live leaderboard context</caption><thead><tr><th scope="col">Place</th><th scope="col">Athlete</th><th scope="col">Club</th><th scope="col">Discipline</th><th scope="col">Performance</th><th scope="col">Event</th><th scope="col">Date</th></tr></thead><tbody>{report.data.map((entry) => <tr key={`${entry.athleteId}:${entry.discipline}:${entry.eventDate}:${entry.performance}`}><td>{entry.place}</td><td>{entry.athleteName}</td><td>{entry.clubName}</td><td>{entry.label}</td><td>{entry.performance.toFixed(entry.precision)} {entry.unit === 'seconds' ? 's' : entry.unit}</td><td>{entry.eventTitle}</td><td><time dateTime={entry.eventDate}>{entry.eventDate}</time></td></tr>)}</tbody></table></div></>}
    </main>
  </div>;
}
