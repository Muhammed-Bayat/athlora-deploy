import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { getPublicAthleteComparison, getPublicClubStatistics, listPublicClubs, listPublicSeasons } from '../../api/publicStatistics';
import { SeasonSelector, Select } from '../../components';
import { seasonLabel, seasonQueryValue, useSeasonQueryState, type SeasonValue } from '../../utils/season';
import type { PublicAthleteComparison, PublicAthleteStatistics, PublicClub, PublicClubStatistics } from '../../types';
import { format100mSeconds } from '../../utils/formatting';
import styles from './PublicStatsPage.module.css';

const StaticTrack = lazy(() => import('./StaticTrack').then((module) => ({ default: module.StaticTrack })));

type StatsMode = 'club' | 'club-comparison' | 'athlete-comparison';

const modeOptions: Array<{ value: StatsMode; label: string }> = [
  { value: 'club', label: 'Club performance' },
  { value: 'club-comparison', label: 'Compare clubs' },
  { value: 'athlete-comparison', label: 'Compare athletes' },
];

function formatMetric(value: number | null) {
  return value === null ? '-' : format100mSeconds(value);
}

function setTilt(event: PointerEvent<HTMLElement>) {
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(bounds.width, 1)));
  const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(bounds.height, 1)));
  card.style.setProperty('--tilt-x', `${(y - 0.5) * -7}deg`);
  card.style.setProperty('--tilt-y', `${(x - 0.5) * 9}deg`);
  card.style.setProperty('--glow-x', `${x * 100}%`);
  card.style.setProperty('--glow-y', `${y * 100}%`);
}

function resetTilt(event: PointerEvent<HTMLElement>) {
  event.currentTarget.style.setProperty('--tilt-x', '0deg');
  event.currentTarget.style.setProperty('--tilt-y', '0deg');
  event.currentTarget.style.setProperty('--glow-x', '50%');
  event.currentTarget.style.setProperty('--glow-y', '50%');
}

function AthleteStatCard({ athlete, season }: { athlete: PublicAthleteStatistics; season: SeasonValue }) {
  const metrics = [
    ['PB', formatMetric(athlete.pb)],
    ['Latest', formatMetric(athlete.latestEffectiveResult)],
    ['Average', formatMetric(athlete.average)],
    ['Consistency', formatMetric(athlete.consistency)],
    ['Improvement', formatMetric(athlete.improvement)],
    ['Results', String(athlete.validResultCount)],
  ];
  const initials = athlete.athlete.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <article className={styles.athleteCard} onPointerMove={setTilt} onPointerLeave={resetTilt}>
      <div className={styles.cardSheen} aria-hidden="true" />
      <div className={styles.athleteVisual} aria-hidden="true">
        <span>{initials}</span>
        <img src="/WLogo.png" alt="" />
      </div>
      <div className={styles.athleteContent}>
        <p className={styles.cardEyebrow}>100m athlete</p>
        <h3>{athlete.athlete.name}</h3>
        <div className={styles.athleteMetrics} aria-label={`${athlete.athlete.name} ${seasonLabel(season).toLowerCase()} 100m metrics`}>
          {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </div>
    </article>
  );
}

const comparisonColors = ['#8ae9f2', '#f0b45e', '#bb8af5', '#78d69a', '#ff8fa3'];

function PublicAthleteComparisonPanel({ comparison, season }: { comparison: PublicAthleteComparison; season: SeasonValue }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const points = comparison.athletes.flatMap((athlete) => athlete.progression.map((entry) => ({ ...entry, athleteId: athlete.athlete.id })));
  const dates = points.map((point) => new Date(`${point.date}T00:00:00Z`).getTime());
  const results = points.map((point) => point.result);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minResult = Math.min(...results);
  const maxResult = Math.max(...results);
  const resultPadding = Math.max((maxResult - minResult) * 0.12, 0.08);
  const x = (date: string) => 58 + ((new Date(`${date}T00:00:00Z`).getTime() - minDate) / Math.max(maxDate - minDate, 1)) * 618;
  const y = (result: number) => 30 + ((result - (minResult - resultPadding)) / Math.max(maxResult - minResult + resultPadding * 2, 1)) * 236;
  const rows: Array<{ label: string; value: (athlete: PublicAthleteComparison['athletes'][number]) => string }> = [
    { label: 'Club', value: (athlete) => athlete.club.name },
    { label: 'PB', value: (athlete) => formatMetric(athlete.pb) },
    { label: 'Latest effective result', value: (athlete) => formatMetric(athlete.latestEffectiveResult) },
    { label: 'Valid result count', value: (athlete) => String(athlete.validResultCount) },
    { label: 'Average', value: (athlete) => formatMetric(athlete.average) },
    { label: 'Consistency (SD)', value: (athlete) => formatMetric(athlete.consistency) },
    { label: 'Improvement', value: (athlete) => formatMetric(athlete.improvement) },
  ];

  return <section className={styles.comparisonPanel} aria-label="Athlete comparison results">
    <div className={styles.comparisonToolbar}><h2>{seasonLabel(season)} 100m comparison</h2><div><button type="button" onClick={() => setView('chart')} aria-pressed={view === 'chart'}>Chart</button><button type="button" onClick={() => setView('table')} aria-pressed={view === 'table'}>Table</button></div></div>
    {view === 'chart' && (points.length === 0 ? <p className={styles.emptyState}>None of the selected athletes has a valid 100m result to chart.</p> : <><svg className={styles.comparisonChart} viewBox="0 0 720 320" role="img" aria-label={`100m progression chart comparing ${comparison.athletes.map((athlete) => athlete.athlete.name).join(', ')}`}><line x1="58" y1="30" x2="58" y2="266" /><line x1="58" y1="266" x2="676" y2="266" />{comparison.athletes.map((athlete, index) => <g key={athlete.athlete.id}>{athlete.progression.length > 1 && <polyline points={athlete.progression.map((entry) => `${x(entry.date)},${y(entry.result)}`).join(' ')} style={{ stroke: comparisonColors[index] }} />}{athlete.progression.map((entry) => <circle key={`${entry.date}-${entry.result}`} cx={x(entry.date)} cy={y(entry.result)} r="4" style={{ fill: comparisonColors[index] }}><title>{`${athlete.athlete.name}: ${format100mSeconds(entry.result)} on ${entry.date}`}</title></circle>)}</g>)}</svg><div className={styles.chartLegend}>{comparison.athletes.map((athlete, index) => <span key={athlete.athlete.id}><i style={{ background: comparisonColors[index] }} />{athlete.athlete.name} <small>{athlete.club.name}</small></span>)}</div></>)}
    {view === 'table' && <div className={styles.tableScroll}><table className={styles.comparisonTable} aria-label="Public athlete comparison metrics"><thead><tr><th scope="col">Metric</th>{comparison.athletes.map((athlete) => <th key={athlete.athlete.id} scope="col">{athlete.athlete.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{comparison.athletes.map((athlete) => <td key={athlete.athlete.id}>{row.value(athlete)}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}

function ClubStatCard({ statistics, season }: { statistics: PublicClubStatistics; season: SeasonValue }) {
  const metrics = [
    ['Roster', String(statistics.roster.total)],
    ['With results', String(statistics.distinctAthletesWithValidResults)],
    ['Fastest', formatMetric(statistics.fastestValidTime)],
    ['Latest', formatMetric(statistics.latestValidTime)],
    ['Average', formatMetric(statistics.averageValidTime)],
    ['Consistency', formatMetric(statistics.populationStandardDeviation)],
  ];

  return (
    <article className={styles.clubCard} onPointerMove={setTilt} onPointerLeave={resetTilt}>
      <div className={styles.cardSheen} aria-hidden="true" />
      <div className={styles.clubIdentity}><span>ATHLORA / CLUB</span><i aria-hidden="true" /><h2>{statistics.club.name}</h2></div>
      <div className={styles.clubMetrics} aria-label={`${statistics.club.name} ${seasonLabel(season).toLowerCase()} 100m metrics`}>
        {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </article>
  );
}

function AthleteGallery({ athletes, season }: { athletes: PublicAthleteStatistics[]; season: SeasonValue }) {
  const [active, setActive] = useState(0);
  const dragStart = useRef<number | null>(null);
  const wheelDelta = useRef(0);
  const lastWheelNavigation = useRef(0);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(athletes.length - 1, 0)));
  }, [athletes.length]);

  if (athletes.length === 0) {
    return <p className={styles.emptyState}>This club has no current athletes to show publicly.</p>;
  }

  const move = (amount: number) => setActive((current) => (current + amount + athletes.length) % athletes.length);
  const offsetFor = (index: number) => {
    let offset = index - active;
    if (offset > athletes.length / 2) offset -= athletes.length;
    if (offset < -athletes.length / 2) offset += athletes.length;
    return offset;
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    if (event.key === 'End') { event.preventDefault(); setActive(athletes.length - 1); }
  };
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    if (Date.now() - lastWheelNavigation.current < 550) return;
    wheelDelta.current += event.deltaX;
    if (Math.abs(wheelDelta.current) < 36) return;
    move(wheelDelta.current > 0 ? 1 : -1);
    wheelDelta.current = 0;
    lastWheelNavigation.current = Date.now();
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return;
    const distance = event.clientX - dragStart.current;
    dragStart.current = null;
    if (Math.abs(distance) > 28) move(distance > 0 ? -1 : 1);
  };

  return (
    <section className={styles.gallerySection} aria-labelledby="athlete-gallery-heading">
      <div className={styles.sectionHeading}><div><p className={styles.kicker}>The roster</p><h2 id="athlete-gallery-heading">Athletes on the curve</h2></div><p>Drag sideways, swipe, or use arrow keys to move through every public athlete profile.</p></div>
      <div className={styles.galleryControls}><button type="button" onClick={() => move(-1)} aria-label="Previous athlete">Previous</button><span aria-live="polite">{active + 1} / {athletes.length}</span><button type="button" onClick={() => move(1)} aria-label="Next athlete">Next</button></div>
      <div className={styles.galleryViewport} role="region" aria-label="Circular athlete profile gallery" tabIndex={0} onKeyDown={handleKeyDown} onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={() => { dragStart.current = null; }}>
        {athletes.map((athlete, index) => {
          const offset = offsetFor(index);
          const distance = Math.abs(offset);
          return <div key={athlete.athlete.id} className={styles.gallerySlot} aria-hidden={distance > 2} style={{ '--gallery-x': `${offset * 31}%`, '--gallery-y': `${distance * 28}px`, '--gallery-rotation': `${offset * -12}deg`, '--gallery-scale': String(1 - distance * 0.09), '--gallery-z': String(20 - distance) } as CSSProperties}><AthleteStatCard athlete={athlete} season={season} /></div>;
        })}
      </div>
    </section>
  );
}

function clubOptions(clubs: PublicClub[], selectedOtherClubId = '') {
  return [
    { value: '', label: 'Select a published club...' },
    ...clubs.filter((club) => club.id !== selectedOtherClubId).map((club) => ({ value: club.id, label: club.name })),
  ];
}

export function PublicStatsPage() {
  const [season, setSeason] = useSeasonQueryState();
  const [mode, setMode] = useState<StatsMode>('club');
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubsError, setClubsError] = useState<string | null>(null);
  const [club1Id, setClub1Id] = useState('');
  const [comparisonClubIds, setComparisonClubIds] = useState<string[]>([]);
  const [comparisonAthleteIds, setComparisonAthleteIds] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, PublicClubStatistics>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [statisticsError, setStatisticsError] = useState<string | null>(null);
  const [athleteComparison, setAthleteComparison] = useState<PublicAthleteComparison | null>(null);
  const [athleteComparisonLoading, setAthleteComparisonLoading] = useState(false);
  const [athleteComparisonError, setAthleteComparisonError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void listPublicClubs()
      .then((response) => { if (current) setClubs(response.data); })
      .catch((error: unknown) => { if (current) setClubsError(error instanceof Error ? error.message : 'Could not load public clubs'); })
      .finally(() => { if (current) setClubsLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    void listPublicSeasons().then((years) => { if (current) setAvailableSeasons(years); }).catch(() => { if (current) setAvailableSeasons([]); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    const selectedIds = Array.from(new Set(
      (mode === 'club' ? [club1Id] : comparisonClubIds).filter(Boolean),
    ));
    const needed = selectedIds.filter((id) => !details[`${id}:${season}`]);
    if (needed.length === 0) {
      setLoadingIds([]);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setLoadingIds(needed);
    setStatisticsError(null);
    void Promise.all(needed.map((id) => seasonQueryValue(season)
      ? getPublicClubStatistics(id, controller.signal, season)
      : getPublicClubStatistics(id, controller.signal)))
      .then((responses) => {
        if (!current) return;
        setDetails((previous) => ({ ...previous, ...Object.fromEntries(responses.map((response) => [`${response.club.id}:${season}`, response])) }));
        setLoadingIds([]);
      })
      .catch((error: unknown) => {
        if (current && !controller.signal.aborted) {
          setStatisticsError(error instanceof Error ? error.message : 'Could not load public statistics');
          setLoadingIds([]);
        }
      })
    return () => { current = false; controller.abort(); };
  }, [club1Id, comparisonClubIds, details, mode, season]);

  useEffect(() => {
    if (mode !== 'athlete-comparison' || comparisonAthleteIds.length < 2) {
      setAthleteComparison(null);
      setAthleteComparisonLoading(false);
      setAthleteComparisonError(null);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setAthleteComparisonLoading(true);
    setAthleteComparisonError(null);
    void getPublicAthleteComparison(comparisonAthleteIds, controller.signal, seasonQueryValue(season) || undefined)
      .then((comparison) => { if (current) setAthleteComparison(comparison); })
      .catch((error: unknown) => { if (current && !controller.signal.aborted) setAthleteComparisonError(error instanceof Error ? error.message : 'Could not compare public athletes'); })
      .finally(() => { if (current && !controller.signal.aborted) setAthleteComparisonLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [comparisonAthleteIds.join(','), mode, season]);

  const club1 = details[`${club1Id}:${season}`];
  const comparedClubs = comparisonClubIds.map((id) => details[`${id}:${season}`]).filter((club): club is PublicClubStatistics => Boolean(club));
  const comparedAthletes = comparedClubs.flatMap((club) => club.athletes).filter((athlete) => comparisonAthleteIds.includes(athlete.athlete.id));
  const selectedAthleteClubIds = comparedClubs.filter((club) => club.athletes.some((athlete) => comparisonAthleteIds.includes(athlete.athlete.id))).map((club) => club.club.id);
  const loadingStatistics = loadingIds.length > 0;
  const clubComparison = mode === 'club-comparison';
  const athleteComparisonMode = mode === 'athlete-comparison';
  const modeChange = (value: StatsMode) => {
    setMode(value);
    setClub1Id('');
    setComparisonClubIds([]);
    setComparisonAthleteIds([]);
    setStatisticsError(null);
  };
  const selectClub1 = (value: string) => {
    setClub1Id(value);
  };
  const addComparisonClub = (clubId: string) => {
    if (clubId) setComparisonClubIds((current) => current.includes(clubId) || current.length === 5 ? current : [...current, clubId]);
    setComparisonAthleteIds([]);
  };
  const addComparisonAthlete = (athleteId: string) => {
    const club = comparedClubs.find((candidate) => candidate.athletes.some((athlete) => athlete.athlete.id === athleteId));
    if (athleteId && club && !selectedAthleteClubIds.includes(club.club.id)) setComparisonAthleteIds((current) => current.includes(athleteId) || current.length === 5 ? current : [...current, athleteId]);
  };

  return (
    <div className={styles.page}>
      <div className={styles.aurora} aria-hidden="true"><i /><i /><i /></div>
      <header className={styles.header}><a className={styles.brand} href="/"><img src="/logo-removebg.png" alt="" /><span>Athlora<small>Performance OS</small></span></a><nav aria-label="Public navigation"><a href="/">Home</a><a className={styles.activeLink} href="/stats" aria-current="page">Stats</a><a className={styles.startLink} href="/">Get started</a></nav></header>
      <main className={styles.content}>
        <section className={styles.hero} aria-labelledby="public-stats-heading">
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Public performance index</p>
            <h1 id="public-stats-heading">The track, <em>in numbers.</em></h1>
            <p>Explore {seasonLabel(season).toLowerCase()} 100m performance from clubs that choose to publish their results on Athlora.</p>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.seasonControl}><span>Performance season</span><SeasonSelector value={season} onChange={setSeason} availableYears={availableSeasons} publicView /></div>
            <Suspense fallback={<figure className={styles.trackFigure} aria-label="Performance track loading" />}><StaticTrack caption={`${seasonLabel(season)} 100m performance, arranged around the track.`} /></Suspense>
          </div>
        </section>

        <section className={styles.explorer} aria-labelledby="explorer-heading"><div className={styles.explorerHeading}><div><p className={styles.kicker}>Explore</p><h2 id="explorer-heading">Find a performance story</h2></div><p>All statistics are {seasonLabel(season).toLowerCase()} 100m results. Only clubs that publish their results appear here.</p></div>
          <div className={styles.selectors}>
            <div className={styles.selector}><label htmlFor="public-stat-mode">View</label><Select id="public-stat-mode" value={mode} onChange={(event) => modeChange(event.target.value as StatsMode)} options={modeOptions} aria-label="Public statistics view" /></div>
            {mode === 'club' ? <div className={styles.selector}><label htmlFor="public-club-one">Club</label><Select id="public-club-one" value={club1Id} onChange={(event) => selectClub1(event.target.value)} options={clubOptions(clubs)} searchable searchPlaceholder="Search published clubs" emptyMessage="No published clubs match" disabled={clubsLoading} aria-label="Select first club" /></div> : <div className={styles.selector}><label htmlFor="public-club-add">Add clubs (up to 5)</label><Select id="public-club-add" value="" onChange={(event) => addComparisonClub(event.target.value)} options={[{ value: '', label: 'Add a published club...' }, ...clubs.filter((club) => !comparisonClubIds.includes(club.id)).map((club) => ({ value: club.id, label: club.name }))]} searchable searchPlaceholder="Search published clubs" emptyMessage="No published clubs match" disabled={clubsLoading || comparisonClubIds.length === 5} aria-label="Add club to comparison" /></div>}
          </div>
          {mode !== 'club' && comparisonClubIds.length > 0 && <ul className={styles.comparisonSelection} aria-label="Selected clubs">{comparisonClubIds.map((id) => <li key={id}>{details[`${id}:${season}`]?.club.name ?? clubs.find((club) => club.id === id)?.name}<button type="button" aria-label={`Remove ${details[`${id}:${season}`]?.club.name ?? 'club'}`} onClick={() => { setComparisonClubIds((current) => current.filter((selected) => selected !== id)); setComparisonAthleteIds([]); }}>×</button></li>)}</ul>}
            {athleteComparisonMode && <div className={styles.selectors}><div className={styles.selector}><label htmlFor="public-athlete-add">Add athletes from different clubs (up to 5)</label><Select id="public-athlete-add" value="" onChange={(event) => addComparisonAthlete(event.target.value)} options={[{ value: '', label: comparisonClubIds.length ? 'Add an athlete...' : 'Add clubs first...' }, ...comparedClubs.filter((club) => !selectedAthleteClubIds.includes(club.club.id)).flatMap((club) => club.athletes).filter((athlete) => !comparisonAthleteIds.includes(athlete.athlete.id)).map((athlete) => ({ value: athlete.athlete.id, label: athlete.athlete.name }))]} searchable searchPlaceholder="Search selected club athletes" emptyMessage="No eligible athletes match" disabled={comparisonClubIds.length === 0 || comparisonAthleteIds.length === 5} aria-label="Add athlete to comparison" /></div></div>}
          {athleteComparisonMode && comparisonAthleteIds.length > 0 && <ul className={styles.comparisonSelection} aria-label="Selected athletes">{comparedAthletes.map((athlete) => <li key={athlete.athlete.id}>{athlete.athlete.name}<button type="button" aria-label={`Remove ${athlete.athlete.name}`} onClick={() => setComparisonAthleteIds((current) => current.filter((selected) => selected !== athlete.athlete.id))}>×</button></li>)}</ul>}
          {clubsError && <p className={styles.error} role="alert">{clubsError}</p>}
         {statisticsError && <p className={styles.error} role="alert">{statisticsError}</p>}
          {athleteComparisonError && <p className={styles.error} role="alert">{athleteComparisonError}</p>}
        </section>

        <div aria-live="polite" className="sr-only">{loadingStatistics ? 'Loading public statistics...' : ''}</div>
        {(loadingStatistics || athleteComparisonLoading) && <p className={styles.loading} role="status">Reading the results...</p>}
        {!clubsLoading && !clubsError && clubs.length === 0 && <p className={styles.emptyState}>No clubs have published results yet. Check back after the next time trial.</p>}
        {!loadingStatistics && !statisticsError && mode === 'club' && !club1 && clubs.length > 0 && <p className={styles.emptyState}>Select a club to open its public performance gallery.</p>}
        {!loadingStatistics && !statisticsError && mode === 'club' && club1 && <><section className={styles.singleClub}><ClubStatCard statistics={club1} season={season} /></section><AthleteGallery athletes={club1.athletes} season={season} /></>}
        {!loadingStatistics && !statisticsError && clubComparison && comparedClubs.length < 2 && <p className={styles.emptyState}>Select at least two clubs to compare their {seasonLabel(season).toLowerCase()} performance.</p>}
        {!loadingStatistics && !statisticsError && clubComparison && comparedClubs.length >= 2 && <section className={styles.comparisonCards} aria-label="Club comparison">{comparedClubs.map((club) => <ClubStatCard key={club.club.id} statistics={club} season={season} />)}</section>}
        {!loadingStatistics && !athleteComparisonLoading && !statisticsError && !athleteComparisonError && athleteComparisonMode && comparedAthletes.length < 2 && <p className={styles.emptyState}>Select at least two athletes from different published clubs to compare their progression.</p>}
        {!loadingStatistics && !athleteComparisonLoading && !statisticsError && !athleteComparisonError && athleteComparisonMode && athleteComparison && <PublicAthleteComparisonPanel comparison={athleteComparison} season={season} />}
      </main>
      <footer className={styles.footer}><span>ATHLORA / PUBLIC PERFORMANCE INDEX</span><p>Published by participating clubs.</p></footer>
    </div>
  );
}
