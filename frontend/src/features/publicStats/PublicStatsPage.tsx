import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { getPublicClubStatistics, listPublicClubs } from '../../api/publicStatistics';
import { Select } from '../../components';
import type { PublicAthleteStatistics, PublicClub, PublicClubStatistics } from '../../types';
import { format100mSeconds } from '../../utils/formatting';
import styles from './PublicStatsPage.module.css';

const StaticTrack = lazy(() => import('./StaticTrack').then((module) => ({ default: module.StaticTrack })));

type StatsMode = 'club' | 'club-comparison' | 'athlete-comparison';

const modeOptions: Array<{ value: StatsMode; label: string }> = [
  { value: 'club', label: 'Club performance' },
  { value: 'club-comparison', label: 'Club vs club' },
  { value: 'athlete-comparison', label: 'Athlete vs athlete' },
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

function AthleteSilhouette() {
  return (
    <svg viewBox="0 0 200 220" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="14" aria-hidden="true">
      <circle cx="136" cy="32" r="15" fill="currentColor" stroke="none" />
      <path d="M121 56 100 96l25 25" />
      <path d="m106 79-37 23-23-13" />
      <path d="m111 79 37 18 22-19" />
      <path d="m122 117-36 48-32 18" />
      <path d="m123 117 31 42 30 1" />
    </svg>
  );
}

function AthleteStatCard({ athlete }: { athlete: PublicAthleteStatistics }) {
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
        <AthleteSilhouette />
      </div>
      <div className={styles.athleteContent}>
        <p className={styles.cardEyebrow}>100m athlete</p>
        <h3>{athlete.athlete.name}</h3>
        <div className={styles.athleteMetrics} aria-label={`${athlete.athlete.name} all-time 100m metrics`}>
          {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </div>
    </article>
  );
}

function ClubStatCard({ statistics }: { statistics: PublicClubStatistics }) {
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
      <div className={styles.clubMetrics} aria-label={`${statistics.club.name} all-time 100m metrics`}>
        {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </article>
  );
}

function AthleteGallery({ athletes }: { athletes: PublicAthleteStatistics[] }) {
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
          return <div key={athlete.athlete.id} className={styles.gallerySlot} aria-hidden={distance > 2} style={{ '--gallery-x': `${offset * 31}%`, '--gallery-y': `${distance * 28}px`, '--gallery-rotation': `${offset * -12}deg`, '--gallery-scale': String(1 - distance * 0.09), '--gallery-z': String(20 - distance) } as CSSProperties}><AthleteStatCard athlete={athlete} /></div>;
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
  const [mode, setMode] = useState<StatsMode>('club');
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubsError, setClubsError] = useState<string | null>(null);
  const [club1Id, setClub1Id] = useState('');
  const [club2Id, setClub2Id] = useState('');
  const [athlete1Id, setAthlete1Id] = useState('');
  const [athlete2Id, setAthlete2Id] = useState('');
  const [details, setDetails] = useState<Record<string, PublicClubStatistics>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [statisticsError, setStatisticsError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void listPublicClubs()
      .then((response) => { if (current) setClubs(response.data); })
      .catch((error: unknown) => { if (current) setClubsError(error instanceof Error ? error.message : 'Could not load public clubs'); })
      .finally(() => { if (current) setClubsLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    const selectedIds = Array.from(new Set(
      (mode === 'club' ? [club1Id] : [club1Id, club2Id]).filter(Boolean),
    ));
    const needed = selectedIds.filter((id) => !details[id]);
    if (needed.length === 0) {
      setLoadingIds([]);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setLoadingIds(needed);
    setStatisticsError(null);
    void Promise.all(needed.map((id) => getPublicClubStatistics(id, controller.signal)))
      .then((responses) => {
        if (!current) return;
        setDetails((previous) => ({ ...previous, ...Object.fromEntries(responses.map((response) => [response.club.id, response])) }));
        setLoadingIds([]);
      })
      .catch((error: unknown) => {
        if (current && !controller.signal.aborted) {
          setStatisticsError(error instanceof Error ? error.message : 'Could not load public statistics');
          setLoadingIds([]);
        }
      })
    return () => { current = false; controller.abort(); };
  }, [club1Id, club2Id, details, mode]);

  const club1 = details[club1Id];
  const club2 = details[club2Id];
  const athlete1 = club1?.athletes.find((athlete) => athlete.athlete.id === athlete1Id);
  const athlete2 = club2?.athletes.find((athlete) => athlete.athlete.id === athlete2Id);
  const loadingStatistics = loadingIds.length > 0;
  const clubComparison = mode === 'club-comparison';
  const athleteComparison = mode === 'athlete-comparison';
  const modeChange = (value: StatsMode) => {
    setMode(value);
    setClub1Id('');
    setClub2Id('');
    setAthlete1Id('');
    setAthlete2Id('');
    setStatisticsError(null);
  };
  const selectClub1 = (value: string) => {
    setClub1Id(value);
    setAthlete1Id('');
  };
  const selectClub2 = (value: string) => {
    setClub2Id(value);
    setAthlete2Id('');
  };

  return (
    <div className={styles.page}>
      <div className={styles.aurora} aria-hidden="true"><i /><i /><i /></div>
      <header className={styles.header}><a className={styles.brand} href="/"><img src="/logo-removebg.png" alt="" /><span>Athlora<small>Performance OS</small></span></a><nav aria-label="Public navigation"><a href="/">Home</a><a className={styles.activeLink} href="/stats" aria-current="page">Stats</a><a className={styles.startLink} href="/">Get started</a></nav></header>
      <main className={styles.content}>
        <section className={styles.hero} aria-labelledby="public-stats-heading"><div><p className={styles.kicker}>Public performance index</p><h1 id="public-stats-heading">The track, <em>in numbers.</em></h1><p>Explore all-time 100m performance from clubs that choose to publish their results on Athlora.</p></div><Suspense fallback={<figure className={styles.trackFigure} aria-label="Performance track loading" />}><StaticTrack /></Suspense></section>

        <section className={styles.explorer} aria-labelledby="explorer-heading"><div className={styles.explorerHeading}><div><p className={styles.kicker}>Explore</p><h2 id="explorer-heading">Find a performance story</h2></div><p>All statistics are all-time 100m results. Only clubs that publish their results appear here.</p></div>
          <div className={styles.selectors}>
            <div className={styles.selector}><label htmlFor="public-stat-mode">View</label><Select id="public-stat-mode" value={mode} onChange={(event) => modeChange(event.target.value as StatsMode)} options={modeOptions} aria-label="Public statistics view" /></div>
            <div className={styles.selector}><label htmlFor="public-club-one">{clubComparison || athleteComparison ? 'First club' : 'Club'}</label><Select id="public-club-one" value={club1Id} onChange={(event) => selectClub1(event.target.value)} options={clubOptions(clubs, clubComparison ? club2Id : '')} searchable searchPlaceholder="Search published clubs" emptyMessage="No published clubs match" disabled={clubsLoading} aria-label="Select first club" /></div>
            {(clubComparison || athleteComparison) && <div className={styles.selector}><label htmlFor="public-club-two">Second club</label><Select id="public-club-two" value={club2Id} onChange={(event) => selectClub2(event.target.value)} options={clubOptions(clubs, clubComparison ? club1Id : '')} searchable searchPlaceholder="Search published clubs" emptyMessage="No published clubs match" disabled={clubsLoading} aria-label="Select second club" /></div>}
          </div>
          {athleteComparison && <div className={styles.selectors}><div className={styles.selector}><label htmlFor="public-athlete-one">First athlete</label><Select id="public-athlete-one" value={athlete1Id} onChange={(event) => setAthlete1Id(event.target.value)} options={[{ value: '', label: club1 ? 'Select an athlete...' : 'Select a club first...' }, ...(club1?.athletes ?? []).map((athlete) => ({ value: athlete.athlete.id, label: athlete.athlete.name }))]} searchable searchPlaceholder="Search club athletes" emptyMessage="No athletes match" disabled={!club1} aria-label="Select first athlete" /></div><div className={styles.selector}><label htmlFor="public-athlete-two">Second athlete</label><Select id="public-athlete-two" value={athlete2Id} onChange={(event) => setAthlete2Id(event.target.value)} options={[{ value: '', label: club2 ? 'Select an athlete...' : 'Select a club first...' }, ...(club2?.athletes ?? []).filter((athlete) => athlete.athlete.id !== athlete1Id).map((athlete) => ({ value: athlete.athlete.id, label: athlete.athlete.name }))]} searchable searchPlaceholder="Search club athletes" emptyMessage="No athletes match" disabled={!club2} aria-label="Select second athlete" /></div></div>}
          {clubsError && <p className={styles.error} role="alert">{clubsError}</p>}
          {statisticsError && <p className={styles.error} role="alert">{statisticsError}</p>}
        </section>

        <div aria-live="polite" className="sr-only">{loadingStatistics ? 'Loading public statistics...' : ''}</div>
        {loadingStatistics && <p className={styles.loading} role="status">Reading the results...</p>}
        {!clubsLoading && !clubsError && clubs.length === 0 && <p className={styles.emptyState}>No clubs have published results yet. Check back after the next time trial.</p>}
        {!loadingStatistics && !statisticsError && mode === 'club' && !club1 && clubs.length > 0 && <p className={styles.emptyState}>Select a club to open its public performance gallery.</p>}
        {!loadingStatistics && !statisticsError && mode === 'club' && club1 && <><section className={styles.singleClub}><ClubStatCard statistics={club1} /></section><AthleteGallery athletes={club1.athletes} /></>}
        {!loadingStatistics && !statisticsError && clubComparison && (!club1 || !club2) && <p className={styles.emptyState}>Select two different clubs to compare their all-time performance.</p>}
        {!loadingStatistics && !statisticsError && clubComparison && club1 && club2 && <section className={styles.comparisonCards} aria-label="Club comparison"><ClubStatCard statistics={club1} /><ClubStatCard statistics={club2} /></section>}
        {!loadingStatistics && !statisticsError && athleteComparison && (!athlete1 || !athlete2) && <p className={styles.emptyState}>Select one athlete from each club to place their results side by side.</p>}
        {!loadingStatistics && !statisticsError && athleteComparison && athlete1 && athlete2 && <section className={styles.comparisonCards} aria-label="Athlete comparison"><AthleteStatCard athlete={athlete1} /><AthleteStatCard athlete={athlete2} /></section>}
      </main>
      <footer className={styles.footer}><span>ATHLORA / PUBLIC PERFORMANCE INDEX</span><p>Published by participating clubs.</p></footer>
    </div>
  );
}
