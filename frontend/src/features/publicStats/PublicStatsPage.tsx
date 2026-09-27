import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { getPublicAthleteComparison, getPublicClubStatistics, listPublicClubs, listPublicSeasons } from '../../api/publicStatistics';
import { SeasonSelector, Select, ClubBadge } from '../../components';
import { seasonLabel, seasonQueryValue, useSeasonQueryState, type SeasonValue } from '../../utils/season';
import type { PublicAthleteComparison, PublicAthleteDisciplineStatistics, PublicAthleteStatistics, PublicClub, PublicClubStatistics, PublicDiscipline } from '../../types';
import styles from './PublicStatsPage.module.css';

const StaticTrack = lazy(() => import('./StaticTrack').then((module) => ({ default: module.StaticTrack })));

type StatsMode = 'club' | 'club-comparison' | 'athlete-comparison';

const modeOptions: Array<{ value: StatsMode; label: string }> = [
  { value: 'club', label: 'Club performance' },
  { value: 'club-comparison', label: 'Compare clubs' },
  { value: 'athlete-comparison', label: 'Compare athletes' },
];

function formatDisciplineMetric(value: number | null, discipline: Pick<PublicAthleteDisciplineStatistics, 'precision' | 'unit'>): string {
  if (value === null) return '-';
  return `${value.toFixed(discipline.precision)} ${discipline.unit === 'seconds' ? 's' : discipline.unit === 'metres' ? 'm' : 'cm'}`;
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

function AthleteStatCard({ athlete, season, disciplineCode }: { athlete: PublicAthleteStatistics; season: SeasonValue; disciplineCode: string }) {
  const disciplines = (athlete.disciplines ?? []).filter((discipline) => discipline.discipline === disciplineCode);
  const initials = athlete.athlete.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <article className={styles.athleteCard} onPointerMove={setTilt} onPointerLeave={resetTilt}>
      <div className={styles.cardSheen} aria-hidden="true" />
      <div className={styles.athleteVisual} aria-hidden="true">
        <span>{initials}</span>
        <img src="/WLogo.png" alt="" />
      </div>
      <div className={styles.athleteContent}>
        <p className={styles.cardEyebrow}>Published disciplines</p>
        <h3>{athlete.athlete.name}</h3>
        <div className={styles.athleteMetrics} aria-label={`${athlete.athlete.name} ${seasonLabel(season).toLowerCase()} discipline metrics`}>
          {disciplines.length > 0 ? disciplines.map((discipline) => <div key={discipline.discipline}><span>{discipline.label}</span><strong>{formatDisciplineMetric(discipline.pb, discipline)}</strong><small>{discipline.validResultCount} result{discipline.validResultCount === 1 ? '' : 's'}</small></div>) : <div><span>No published disciplines</span><strong>-</strong></div>}
        </div>
      </div>
    </article>
  );
}

function PublicAllDisciplineComparisonPanel({ comparison, season, disciplines }: { comparison: PublicAthleteComparison; season: SeasonValue; disciplines: PublicDiscipline[] }) {
  const [selectedCode, setSelectedCode] = useState('');
  const [view, setView] = useState<'table' | 'graph'>('table');
  const selected = disciplines.find((discipline) => discipline.discipline === selectedCode) ?? disciplines[0];

  useEffect(() => { if (selected && selected.discipline !== selectedCode) setSelectedCode(selected.discipline); }, [selected, selectedCode]);

  if (!selected) return <p className={styles.emptyState}>The selected clubs have no available disciplines for {seasonLabel(season).toLowerCase()}.</p>;
  const rows = comparison.athletes.map((athlete) => ({ athlete, discipline: (athlete.disciplines ?? []).find((discipline) => discipline.discipline === selected.discipline) }));
  const points = rows.flatMap(({ athlete, discipline }, athleteIndex) => (discipline?.progression ?? []).map((entry) => ({ ...entry, athlete, athleteIndex })));
  const dates = points.map((point) => new Date(`${point.date}T00:00:00Z`).getTime());
  const results = points.map((point) => point.result);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minResult = Math.min(...results);
  const maxResult = Math.max(...results);
  const colors = ['#8ae9f2', '#ffb86b', '#b2f58a', '#c9a7ff', '#ff9cbd'];
  const x = (date: string) => 52 + ((new Date(`${date}T00:00:00Z`).getTime() - minDate) / Math.max(maxDate - minDate, 1)) * 628;
  const y = (result: number) => {
    const ratio = (result - minResult) / Math.max(maxResult - minResult, 1);
    return selected.direction === 'lower' ? 32 + ratio * 220 : 252 - ratio * 220;
  };
  return <section className={styles.comparisonPanel} aria-label="Athlete comparison results">
    <div className={styles.comparisonToolbar}><h2>{seasonLabel(season)} discipline comparison <span>{selected.label}</span></h2><div><button type="button" onClick={() => setView('table')} aria-pressed={view === 'table'}>Table</button><button type="button" onClick={() => setView('graph')} aria-pressed={view === 'graph'}>Graph</button></div></div>
    <div className={styles.disciplineTabs} role="tablist" aria-label="Comparison discipline">
      {disciplines.map((discipline) => <button key={discipline.discipline} type="button" role="tab" aria-selected={discipline.discipline === selected.discipline} onClick={() => setSelectedCode(discipline.discipline)}>{discipline.label}</button>)}
    </div>
    {view === 'table' ? <div className={styles.tableScroll}><table className={styles.comparisonTable} aria-label={`${selected.label} public athlete comparison`}><thead><tr><th scope="col">Athlete</th><th scope="col">Club</th><th scope="col">PB</th><th scope="col">Latest</th><th scope="col">Average</th><th scope="col">Results</th></tr></thead><tbody>{rows.map(({ athlete, discipline }) => <tr key={athlete.athlete.id}><th scope="row">{athlete.athlete.name}</th><td>{athlete.club.name}</td>{discipline ? <><td>{formatDisciplineMetric(discipline.pb, discipline)}</td><td>{formatDisciplineMetric(discipline.latestEffectiveResult, discipline)}</td><td>{formatDisciplineMetric(discipline.average, discipline)}</td><td>{discipline.validResultCount}</td></> : <td colSpan={4}>No published {selected.label} results</td>}</tr>)}</tbody></table></div> : points.length === 0 ? <p className={styles.emptyState}>No published {selected.label} results are available to graph.</p> : <><svg className={styles.comparisonChart} viewBox="0 0 720 284" role="img" aria-label={`${selected.label} progression graph`}><line x1="52" y1="252" x2="680" y2="252" /><line x1="52" y1="32" x2="52" y2="252" />{rows.map(({ athlete, discipline }, athleteIndex) => { const progression = discipline?.progression ?? []; const color = colors[athleteIndex % colors.length]; return <g key={athlete.athlete.id}>{progression.length > 1 && <polyline points={progression.map((entry) => `${x(entry.date)},${y(entry.result)}`).join(' ')} style={{ stroke: color }} />}{progression.map((entry) => <circle key={`${entry.date}-${entry.result}`} cx={x(entry.date)} cy={y(entry.result)} r="4" style={{ fill: color }}><title>{`${athlete.athlete.name}: ${formatDisciplineMetric(entry.result, selected)} on ${entry.date}`}</title></circle>)}</g>; })}</svg><div className={styles.chartLegend} role="list">{rows.map(({ athlete }, index) => <span key={athlete.athlete.id} role="listitem"><i style={{ backgroundColor: colors[index % colors.length] }} />{athlete.athlete.name}<small>{athlete.club.name}</small></span>)}</div></>}
  </section>;
}

function PublicClubDisciplineComparisonPanel({ clubs, season, disciplines }: { clubs: PublicClubStatistics[]; season: SeasonValue; disciplines: PublicDiscipline[] }) {
  const [selectedCode, setSelectedCode] = useState('');
  const selected = disciplines.find((discipline) => discipline.discipline === selectedCode) ?? disciplines[0];

  useEffect(() => { if (selected && selected.discipline !== selectedCode) setSelectedCode(selected.discipline); }, [selected, selectedCode]);
  if (!selected) return <p className={styles.emptyState}>The selected clubs have no published discipline results for {seasonLabel(season).toLowerCase()}.</p>;
  const rows = clubs.map((club) => {
    const results = club.athletes.flatMap((athlete) => athlete.disciplines ?? []).filter((discipline) => discipline.discipline === selected.discipline);
    const resultCount = results.reduce((total, discipline) => total + discipline.validResultCount, 0);
    const pb = results.length === 0 ? null : selected.direction === 'lower' ? Math.min(...results.map((discipline) => discipline.pb ?? Infinity)) : Math.max(...results.map((discipline) => discipline.pb ?? -Infinity));
    return { club, resultCount, athletes: results.length, pb: Number.isFinite(pb) ? pb : null };
  });
  return <section className={styles.comparisonPanel} aria-label="Club comparison results">
    <div className={styles.comparisonToolbar}><h2>{seasonLabel(season)} club comparison <span>{selected.label}</span></h2></div>
    <div className={styles.disciplineTabs} role="tablist" aria-label="Club comparison discipline">
      {disciplines.map((discipline) => <button key={discipline.discipline} type="button" role="tab" aria-selected={discipline.discipline === selected.discipline} onClick={() => setSelectedCode(discipline.discipline)}>{discipline.label}</button>)}
    </div>
    <div className={styles.tableScroll}><table className={styles.comparisonTable} aria-label={`${selected.label} public club comparison`}><thead><tr><th scope="col">Club</th><th scope="col">Athletes with results</th><th scope="col">Best performance</th><th scope="col">Finalized results</th></tr></thead><tbody>{rows.map((row) => <tr key={row.club.club.id}><th scope="row">{row.club.club.name}</th><td>{row.athletes}</td><td>{formatDisciplineMetric(row.pb, selected)}</td><td>{row.resultCount}</td></tr>)}</tbody></table></div>
  </section>;
}

function ClubStatCard({ statistics, season, discipline }: { statistics: PublicClubStatistics; season: SeasonValue; discipline: PublicDiscipline }) {
  const branding = statistics.club.branding;
  const accentColor = branding?.accentColor ?? undefined;
  const disciplineResults = statistics.athletes.flatMap((athlete) => athlete.disciplines ?? []).filter((entry) => entry.discipline === discipline.discipline);
  const resultCount = disciplineResults.reduce((total, entry) => total + entry.validResultCount, 0);
  const best = disciplineResults.length === 0 ? null : discipline.direction === 'lower'
    ? Math.min(...disciplineResults.map((entry) => entry.pb ?? Infinity))
    : Math.max(...disciplineResults.map((entry) => entry.pb ?? -Infinity));
  const metrics = [
    ['Discipline', discipline.label],
    ['Athletes', String(disciplineResults.length)],
    ['Best', Number.isFinite(best) ? formatDisciplineMetric(best, discipline) : '-'],
    ['Finalized results', String(resultCount)],
  ];

  return (
    <article
      className={styles.clubCard}
      onPointerMove={setTilt}
      onPointerLeave={resetTilt}
      style={accentColor ? { borderColor: accentColor } : undefined}
    >
      <div className={styles.cardSheen} aria-hidden="true" />
      <div className={styles.clubIdentity}>
        <span>ATHLORA / CLUB RESULTS</span>
        <i aria-hidden="true" style={accentColor ? { background: accentColor, boxShadow: `0 0 14px ${accentColor}` } : undefined} />
        <h2>
          <ClubBadge name={statistics.club.name} branding={branding} size="lg" decorative />
          <span>{statistics.club.name}</span>
        </h2>
        {branding?.description && <p className={styles.clubDescription}>{branding.description}</p>}
      </div>
        <div className={styles.clubMetrics} aria-label={`${statistics.club.name} ${seasonLabel(season).toLowerCase()} published results`}>
        {metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </article>
  );
}

function AthleteGallery({ athletes, season, disciplineCode, disciplineLabel }: { athletes: PublicAthleteStatistics[]; season: SeasonValue; disciplineCode: string; disciplineLabel: string }) {
  const [active, setActive] = useState(0);
  const dragStart = useRef<number | null>(null);
  const wheelDelta = useRef(0);
  const lastWheelNavigation = useRef(0);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(athletes.length - 1, 0)));
  }, [athletes.length]);

  if (athletes.length === 0) {
    return <p className={styles.emptyState}>No athletes are selected for {disciplineLabel}.</p>;
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
          return <div key={athlete.athlete.id} className={styles.gallerySlot} aria-hidden={distance > 2} style={{ '--gallery-x': `${offset * 31}%`, '--gallery-y': `${distance * 28}px`, '--gallery-rotation': `${offset * -12}deg`, '--gallery-scale': String(1 - distance * 0.09), '--gallery-z': String(20 - distance) } as CSSProperties}><AthleteStatCard athlete={athlete} season={season} disciplineCode={disciplineCode} /></div>;
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
  const [clubDisciplineCode, setClubDisciplineCode] = useState('');
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
  const clubDisciplines = club1?.availableDisciplines ?? [];
  const selectedClubDiscipline = clubDisciplines.find((discipline) => discipline.discipline === clubDisciplineCode) ?? clubDisciplines[0];
  const comparedClubs = comparisonClubIds.map((id) => details[`${id}:${season}`]).filter((club): club is PublicClubStatistics => Boolean(club));
  const comparisonDisciplines = [...new Map(comparedClubs.flatMap((club) => club.availableDisciplines ?? []).map((discipline) => [discipline.discipline, discipline])).values()].sort((left, right) => left.label.localeCompare(right.label));
  const comparedAthletes = comparedClubs.flatMap((club) => club.athletes).filter((athlete) => comparisonAthleteIds.includes(athlete.athlete.id));
  const selectedAthleteClubIds = comparedClubs.filter((club) => club.athletes.some((athlete) => comparisonAthleteIds.includes(athlete.athlete.id))).map((club) => club.club.id);
  const loadingStatistics = loadingIds.length > 0;
  const clubComparison = mode === 'club-comparison';
  const athleteComparisonMode = mode === 'athlete-comparison';
  const modeChange = (value: StatsMode) => {
    setMode(value);
    setClub1Id('');
    setClubDisciplineCode('');
    setComparisonClubIds([]);
    setComparisonAthleteIds([]);
    setStatisticsError(null);
  };
  const selectClub1 = (value: string) => {
    setClub1Id(value);
    setClubDisciplineCode('');
  };
  useEffect(() => {
    if (selectedClubDiscipline && selectedClubDiscipline.discipline !== clubDisciplineCode) setClubDisciplineCode(selectedClubDiscipline.discipline);
  }, [clubDisciplineCode, selectedClubDiscipline]);
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
      <header className={styles.header}><a className={styles.brand} href="/"><img src="/logo-removebg.png" alt="" /><span>Athlora<small>Performance OS</small></span></a><nav aria-label="Public navigation"><a href="/">Home</a><a className={styles.activeLink} href="/stats" aria-current="page">Stats</a><a href="/schedule">Schedule</a><a className={styles.startLink} href="/">Get started</a></nav></header>
      <main className={styles.content}>
        <section className={styles.hero} aria-labelledby="public-stats-heading">
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Public performance index</p>
            <h1 id="public-stats-heading">The track, <em>in numbers.</em></h1>
            <p>Explore {seasonLabel(season).toLowerCase()} results across every discipline from clubs that choose to publish on Athlora.</p>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.seasonControl}><span>Performance season</span><SeasonSelector value={season} onChange={setSeason} availableYears={availableSeasons} publicView /></div>
            <Suspense fallback={<figure className={styles.trackFigure} aria-label="Performance track loading" />}><StaticTrack caption={`${seasonLabel(season)} published performance across every discipline.`} /></Suspense>
          </div>
        </section>

        <section className={styles.explorer} aria-labelledby="explorer-heading"><div className={styles.explorerHeading}><div><p className={styles.kicker}>Explore</p><h2 id="explorer-heading">Find a performance story</h2></div><p>All published discipline results are shown for {seasonLabel(season).toLowerCase()}. Only clubs that opt in appear here.</p></div>
          <div className={styles.selectors}>
            <div className={styles.selector}><label htmlFor="public-stat-mode">View</label><Select id="public-stat-mode" value={mode} onChange={(event) => modeChange(event.target.value as StatsMode)} options={modeOptions} aria-label="Public statistics view" /></div>
            {mode === 'club' ? <><div className={styles.selector}><label htmlFor="public-club-one">Club</label><Select id="public-club-one" value={club1Id} onChange={(event) => selectClub1(event.target.value)} options={clubOptions(clubs)} searchable searchPlaceholder="Search published clubs" emptyMessage="No published clubs match" disabled={clubsLoading} aria-label="Select first club" /></div>{club1 && <div className={`${styles.selector} ${styles.disciplinePicker}`}><label>Discipline {selectedClubDiscipline && <span className={styles.selectedDiscipline}>Selected: {selectedClubDiscipline.label}</span>}</label><div className={styles.disciplineTabs} role="tablist" aria-label="Select club discipline">{clubDisciplines.map((discipline) => <button key={discipline.discipline} type="button" role="tab" aria-selected={discipline.discipline === selectedClubDiscipline?.discipline} onClick={() => setClubDisciplineCode(discipline.discipline)}>{discipline.label}</button>)}</div></div>}</> : <div className={`${styles.selector} ${styles.comparisonClubPicker}`}><label htmlFor="public-club-add">Build your comparison <span>{comparisonClubIds.length} / 5</span></label><Select id="public-club-add" value="" onChange={(event) => addComparisonClub(event.target.value)} options={[{ value: '', label: comparisonClubIds.length === 5 ? 'Five clubs selected' : 'Add a published club...' }, ...clubs.filter((club) => !comparisonClubIds.includes(club.id)).map((club) => ({ value: club.id, label: club.name }))]} searchable searchPlaceholder="Search published clubs" emptyMessage="No published clubs match" disabled={clubsLoading || comparisonClubIds.length === 5} aria-label="Add club to comparison" /><p>Select two to five clubs. You can remove or replace any selection below.</p></div>}
          </div>
          {mode !== 'club' && comparisonClubIds.length > 0 && <section className={styles.comparisonSelectionSection} aria-label="Selected clubs"><div><p className={styles.kicker}>Comparison roster</p><strong>{comparisonClubIds.length === 1 ? 'Add one more club to compare.' : `${comparisonClubIds.length} clubs ready to compare.`}</strong></div><ul className={styles.comparisonSelection}>{comparisonClubIds.map((id) => { const club = details[`${id}:${season}`]?.club ?? clubs.find((candidate) => candidate.id === id); return <li key={id}><ClubBadge name={club?.name ?? 'Club'} branding={club?.branding} size="sm" decorative /><span>{club?.name ?? 'Loading club...'}</span><button type="button" aria-label={`Remove ${club?.name ?? 'club'}`} onClick={() => { setComparisonClubIds((current) => current.filter((selected) => selected !== id)); setComparisonAthleteIds([]); }}>Remove</button></li>; })}</ul></section>}
            {athleteComparisonMode && <div className={styles.selectors}><div className={styles.selector}><label htmlFor="public-athlete-add">Add athletes from different clubs (up to 5)</label><Select id="public-athlete-add" value="" onChange={(event) => addComparisonAthlete(event.target.value)} options={[{ value: '', label: comparisonClubIds.length ? 'Add an athlete...' : 'Add clubs first...' }, ...comparedClubs.filter((club) => !selectedAthleteClubIds.includes(club.club.id)).flatMap((club) => club.athletes).filter((athlete) => !comparisonAthleteIds.includes(athlete.athlete.id)).map((athlete) => ({ value: athlete.athlete.id, label: athlete.athlete.name }))]} searchable searchPlaceholder="Search selected club athletes" emptyMessage="No eligible athletes match" disabled={comparisonClubIds.length === 0 || comparisonAthleteIds.length === 5} aria-label="Add athlete to comparison" /></div></div>}
          {athleteComparisonMode && comparisonAthleteIds.length > 0 && <section className={`${styles.comparisonSelectionSection} ${styles.athleteComparisonSelectionSection}`} aria-label="Selected athletes"><div><p className={styles.kicker}>Athlete roster</p><strong>{comparisonAthleteIds.length === 1 ? 'Add an athlete from another club to compare.' : `${comparisonAthleteIds.length} athletes ready to compare.`}</strong></div><ul className={styles.comparisonSelection}>{comparedAthletes.map((athlete) => { const club = comparedClubs.find((candidate) => candidate.athletes.some((candidate) => candidate.athlete.id === athlete.athlete.id))?.club; return <li key={athlete.athlete.id}><ClubBadge name={club?.name ?? 'Club'} branding={club?.branding} size="sm" decorative /><span className={styles.selectedAthlete}><strong>{athlete.athlete.name}</strong><small>{club?.name ?? 'Loading club...'}</small></span><button type="button" aria-label={`Remove ${athlete.athlete.name}`} onClick={() => setComparisonAthleteIds((current) => current.filter((selected) => selected !== athlete.athlete.id))}>Remove</button></li>; })}</ul></section>}
          {clubsError && <p className={styles.error} role="alert">{clubsError}</p>}
         {statisticsError && <p className={styles.error} role="alert">{statisticsError}</p>}
          {athleteComparisonError && <p className={styles.error} role="alert">{athleteComparisonError}</p>}
        </section>

        <div aria-live="polite" className="sr-only">{loadingStatistics ? 'Loading public statistics...' : ''}</div>
        {(loadingStatistics || athleteComparisonLoading) && <p className={styles.loading} role="status">Reading the results...</p>}
        {!clubsLoading && !clubsError && clubs.length === 0 && <p className={styles.emptyState}>No clubs have published results yet. Check back after the next time trial.</p>}
        {!loadingStatistics && !statisticsError && mode === 'club' && !club1 && clubs.length > 0 && <p className={styles.emptyState}>Select a club to open its public performance gallery.</p>}
        {!loadingStatistics && !statisticsError && mode === 'club' && club1 && !selectedClubDiscipline && <p className={styles.emptyState}>This club has no published discipline results for {seasonLabel(season).toLowerCase()}.</p>}
        {!loadingStatistics && !statisticsError && mode === 'club' && club1 && selectedClubDiscipline && <><section className={styles.singleClub}><ClubStatCard statistics={club1} season={season} discipline={selectedClubDiscipline} /></section><AthleteGallery athletes={club1.athletes.filter((athlete) => (athlete.disciplines ?? []).some((discipline) => discipline.discipline === selectedClubDiscipline.discipline))} season={season} disciplineCode={selectedClubDiscipline.discipline} disciplineLabel={selectedClubDiscipline.label} /></>}
        {!loadingStatistics && !statisticsError && clubComparison && comparedClubs.length < 2 && <p className={styles.emptyState}>Select at least two clubs to compare their {seasonLabel(season).toLowerCase()} performance.</p>}
        {!loadingStatistics && !statisticsError && clubComparison && comparedClubs.length >= 2 && <PublicClubDisciplineComparisonPanel clubs={comparedClubs} season={season} disciplines={comparisonDisciplines} />}
        {!loadingStatistics && !athleteComparisonLoading && !statisticsError && !athleteComparisonError && athleteComparisonMode && comparedAthletes.length < 2 && <p className={styles.emptyState}>Select at least two athletes from different published clubs to compare their progression.</p>}
        {!loadingStatistics && !athleteComparisonLoading && !statisticsError && !athleteComparisonError && athleteComparisonMode && athleteComparison && <PublicAllDisciplineComparisonPanel comparison={athleteComparison} season={season} disciplines={comparisonDisciplines} />}
      </main>
      <footer className={styles.footer}><span>ATHLORA / PUBLIC PERFORMANCE INDEX</span><p>Published by participating clubs.</p></footer>
    </div>
  );
}
