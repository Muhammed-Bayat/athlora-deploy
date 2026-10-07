import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMultiAthleteComparison, getTwoAthleteComparison } from '../../api/comparison';
import {
  getClubComparison,
  getClubMultiComparison,
  getClubPublication,
  getClubStatistics,
  listClubComparisonAthletes,
  listClubs,
  updateClubPublication,
} from '../../api/clubs';
import { listAthletes } from '../../api/athletes';
import { Button, Card, ClubBadge, SeasonSelector, Select } from '../../components';
import { normalizeSeason, seasonLabel, seasonQueryValue, type SeasonValue } from '../../utils/season';
import type {
  Athlete,
  Club,
  ClubAthleteLookup,
  ClubMultiComparisonDetail,
  ClubPublication,
  ClubStatistics,
  ComparisonAthleteAggregate,
  MultiComparisonDetail,
  ClubDisciplineStatistics,
  PublicAthleteDisciplineStatistics,
  PublicDiscipline,
} from '../../types';
import { chartSeriesById } from '../../utils/chartSeries';
import styles from './ComparisonPage.module.css';
import { useWorkspace } from '../auth/WorkspaceContext';

type ViewMode = 'chart' | 'table';
type ComparisonMode = 'athlete-club' | 'athlete-cross-club' | 'club-statistics' | 'club-comparison';
const MAX_COMPARISON_ITEMS = 5;

const comparisonModes: Array<{ value: ComparisonMode; label: string }> = [
  { value: 'athlete-club', label: 'Athlete vs athlete in my club' },
  { value: 'athlete-cross-club', label: 'Athlete vs athlete across clubs' },
  { value: 'club-statistics', label: 'Club statistics' },
  { value: 'club-comparison', label: 'Club vs club' },
];

function isComparisonMode(value: string | null): value is ComparisonMode {
  return comparisonModes.some((mode) => mode.value === value);
}

function formatMetric(value: number | null, discipline: Pick<PublicDiscipline, 'precision' | 'unit'> = { precision: 2, unit: 'seconds' }): string {
  if (value === null) return '-';
  return `${value.toFixed(discipline.precision)} ${discipline.unit === 'seconds' ? 's' : discipline.unit === 'metres' ? 'm' : 'cm'}`;
}

function axisTitle(unit: Pick<PublicDiscipline, 'unit'>['unit']): string {
  return unit === 'seconds' ? 'Time (s)' : unit === 'metres' ? 'Result (m)' : 'Result (cm)';
}

function MetricCard({ label, value, discipline }: { label: string; value: number | null; discipline?: PublicDiscipline }) {
  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      {value !== null ? (
        <p className={styles.metricValue}>{formatMetric(value, discipline)}</p>
      ) : (
        <p className={`${styles.metricValue} ${styles.metricEmpty}`}>-</p>
      )}
    </div>
  );
}

function TextMetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      <p className={styles.metricValue}>{value}</p>
    </div>
  );
}

function athleteDiscipline(athlete: ComparisonAthleteAggregate, discipline: PublicDiscipline): PublicAthleteDisciplineStatistics | undefined {
  return athlete.disciplines?.find((entry) => entry.discipline === discipline.discipline);
}

function DisciplineTabs({ disciplines, selected, onSelect, label }: { disciplines: PublicDiscipline[]; selected: PublicDiscipline | undefined; onSelect: (code: string) => void; label: string }) {
  return <div className={styles.disciplinePicker}><div className={styles.disciplineActions}><div className={styles.disciplineLabel}>Discipline {selected && <strong>Selected: {selected.label}</strong>}</div></div><div className={styles.disciplineTabs} role="tablist" aria-label={label}>{disciplines.map((discipline) => <button key={discipline.discipline} type="button" role="tab" aria-selected={discipline.discipline === selected?.discipline} onClick={() => onSelect(discipline.discipline)}>{discipline.label}</button>)}</div></div>;
}

function ComparisonTable({ comparison, discipline }: { comparison: MultiComparisonDetail; discipline: PublicDiscipline }) {
  return <div className={styles.tableScroll}><table className={styles.comparisonTable} aria-label={`${discipline.label} athlete comparison`}><thead><tr><th scope="col">Athlete</th><th scope="col">PB</th><th scope="col">Latest</th><th scope="col">Average</th><th scope="col">Results</th></tr></thead><tbody>{comparison.athletes.map((athlete) => { const metrics = athleteDiscipline(athlete, discipline); return <tr key={athlete.athlete.id}><th scope="row">{athlete.athlete.name}</th>{metrics ? <><td>{formatMetric(metrics.pb, discipline)}</td><td>{formatMetric(metrics.latestEffectiveResult, discipline)}</td><td>{formatMetric(metrics.average, discipline)}</td><td>{metrics.validResultCount}</td></> : <td colSpan={4}>No {discipline.label} results</td>}</tr>; })}</tbody></table></div>;
}

function ComparisonChart({ comparison, discipline, season }: { comparison: MultiComparisonDetail; discipline: PublicDiscipline; season: SeasonValue }) {
  const rows = comparison.athletes.map((athlete) => ({ athlete, metrics: athleteDiscipline(athlete, discipline) }));
  const points = rows.flatMap(({ athlete, metrics }) => (metrics?.progression ?? []).map((entry) => ({ ...entry, athlete })));
  if (!points.length) return <p className={styles.empty}>No {discipline.label} results are available to graph.</p>;
  const dates = points.map((entry) => new Date(`${entry.date}T00:00:00Z`).getTime());
  const values = points.map((entry) => entry.result);
  const minDate = Math.min(...dates); const maxDate = Math.max(...dates); const minValue = Math.min(...values); const maxValue = Math.max(...values);
  const valuePadding = Math.max((maxValue - minValue) * 0.12, discipline.unit === 'seconds' ? 0.08 : 0.2);
  const valueRange = Math.max(maxValue - minValue + valuePadding * 2, 0.01);
  const paddedMin = minValue - valuePadding;
  const series = chartSeriesById(comparison.athletes.map((athlete) => athlete.athlete.id));
  const left = 64; const right = 680; const top = 32; const bottom = 252; const middleY = (top + bottom) / 2;
  const x = (date: string) => left + ((new Date(`${date}T00:00:00Z`).getTime() - minDate) / Math.max(maxDate - minDate, 1)) * (right - left);
  const y = (value: number) => { const ratio = (value - paddedMin) / valueRange; return discipline.direction === 'lower' ? top + ratio * (bottom - top) : bottom - ratio * (bottom - top); };
  const ticks = Array.from({ length: 5 }, (_, index) => paddedMin + (index / 4) * valueRange);
  return (
    <div className={styles.chartWrap}>
      <h2 className={styles.chartHeading}>{`${seasonLabel(season)} ${discipline.label} progression`}</h2>
      <svg className={styles.svg} viewBox="0 0 720 284" role="img" aria-label={`${discipline.label} progression chart`}>
        {ticks.map((tick, index) => <g key={`y-tick-${index}`}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className={styles.grid} /><text x={left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className={styles.axisLabel}>{tick.toFixed(discipline.precision)}</text></g>)}
        <line x1={left} y1={bottom} x2={right} y2={bottom} />
        <line x1={left} y1={top} x2={left} y2={bottom} />
        {rows.map(({ athlete, metrics }) => { const color = series.get(athlete.athlete.id)!; const progression = metrics?.progression ?? []; return <g key={athlete.athlete.id}>{progression.length > 1 && <polyline data-series-color={color.color} points={progression.map((entry) => `${x(entry.date)},${y(entry.result)}`).join(' ')} className={styles.seriesLine} style={{ stroke: color.color, strokeDasharray: color.dashArray }} />}{progression.map((entry) => <circle key={`${entry.date}-${entry.result}`} cx={x(entry.date)} cy={y(entry.result)} r="4" className={styles.seriesPoint} style={{ fill: color.color }}><title>{`${athlete.athlete.name}: ${formatMetric(entry.result, discipline)} on ${entry.date}`}</title></circle>)}</g>; })}
        <text x={(left + right) / 2} y="278" textAnchor="middle" className={styles.axisTitle}>Date</text>
        <text x="14" y={middleY} textAnchor="middle" transform={`rotate(-90 14 ${middleY})`} className={styles.axisTitle}>{axisTitle(discipline.unit)}</text>
      </svg>
      <div className={styles.legend} role="list" aria-label="Chart legend">{rows.map(({ athlete }) => { const color = series.get(athlete.athlete.id)!; return <span key={athlete.athlete.id} className={styles.legendItem} role="listitem"><i style={{ backgroundColor: color.color }} />{athlete.athlete.name}</span>; })}</div>
    </div>
  );
}

function clubDiscipline(statistics: ClubStatistics, discipline: PublicDiscipline): ClubDisciplineStatistics | undefined {
  return statistics.disciplines?.find((entry) => entry.discipline === discipline.discipline);
}

function ClubStatisticsTable({ statistics, season, discipline }: { statistics: ClubStatistics; season: SeasonValue; discipline: PublicDiscipline }) {
  const selected = clubDiscipline(statistics, discipline);
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Total roster', value: String(selected?.rosterAthleteCount ?? statistics.roster.total) },
    { label: 'Active athletes', value: String(selected?.activeAthleteCount ?? statistics.roster.active) },
    { label: 'Inactive athletes', value: String(selected?.inactiveAthleteCount ?? statistics.roster.inactive) },
    { label: 'Archived athletes', value: String(selected?.archivedAthleteCount ?? statistics.roster.archived) },
    { label: 'Athletes with results', value: String(selected?.distinctAthletesWithValidResults ?? (discipline.discipline === '100m' ? statistics.distinctAthletesWithValidResults : 0)) },
    { label: 'Finalized results', value: String(selected?.validResultCount ?? (discipline.discipline === '100m' ? statistics.valid100mResultCount : 0)) },
    { label: 'Best performance', value: formatMetric(selected?.fastestValidResult ?? (discipline.discipline === '100m' ? statistics.fastestValidTime : null), discipline) },
    { label: 'Latest performance', value: formatMetric(selected?.latestValidResult ?? (discipline.discipline === '100m' ? statistics.latestValidTime : null), discipline) },
    { label: 'Average performance', value: formatMetric(selected?.averageValidResult ?? (discipline.discipline === '100m' ? statistics.averageValidTime : null), discipline) },
    { label: 'Consistency (SD)', value: formatMetric(selected?.populationStandardDeviation ?? (discipline.discipline === '100m' ? statistics.populationStandardDeviation : null), discipline) },
  ];

  return (
    <div className={styles.tableScroll}><table className={styles.comparisonTable} aria-label={`${statistics.club.name} ${seasonLabel(season).toLowerCase()} ${discipline.label} statistics`}>
      <thead>
        <tr><th scope="col">Metric</th><th scope="col"><span className={styles.clubColumn}><ClubBadge name={statistics.club.name} branding={statistics.club.branding} size="sm" decorative />{statistics.club.name}</span></th></tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td></tr>
        ))}
      </tbody>
    </table></div>
  );
}

function ClubComparisonTable({ comparison, season, discipline }: { comparison: ClubMultiComparisonDetail; season: SeasonValue; discipline: PublicDiscipline }) {
  const rows: Array<{ label: string; value: (club: ClubStatistics) => string }> = [
    { label: 'Total roster', value: (club) => String(clubDiscipline(club, discipline)?.rosterAthleteCount ?? club.roster.total) }, { label: 'Active athletes', value: (club) => String(clubDiscipline(club, discipline)?.activeAthleteCount ?? club.roster.active) }, { label: 'Inactive athletes', value: (club) => String(clubDiscipline(club, discipline)?.inactiveAthleteCount ?? club.roster.inactive) }, { label: 'Archived athletes', value: (club) => String(clubDiscipline(club, discipline)?.archivedAthleteCount ?? club.roster.archived) },
    { label: 'Athletes with results', value: (club) => String(clubDiscipline(club, discipline)?.distinctAthletesWithValidResults ?? (discipline.discipline === '100m' ? club.distinctAthletesWithValidResults : 0)) }, { label: 'Finalized results', value: (club) => String(clubDiscipline(club, discipline)?.validResultCount ?? (discipline.discipline === '100m' ? club.valid100mResultCount : 0)) },
    { label: 'Best performance', value: (club) => formatMetric(clubDiscipline(club, discipline)?.fastestValidResult ?? (discipline.discipline === '100m' ? club.fastestValidTime : null), discipline) }, { label: 'Latest performance', value: (club) => formatMetric(clubDiscipline(club, discipline)?.latestValidResult ?? (discipline.discipline === '100m' ? club.latestValidTime : null), discipline) },
    { label: 'Average performance', value: (club) => formatMetric(clubDiscipline(club, discipline)?.averageValidResult ?? (discipline.discipline === '100m' ? club.averageValidTime : null), discipline) }, { label: 'Consistency (SD)', value: (club) => formatMetric(clubDiscipline(club, discipline)?.populationStandardDeviation ?? (discipline.discipline === '100m' ? club.populationStandardDeviation : null), discipline) },
  ];

  return (
    <div className={styles.tableScroll}><table className={styles.comparisonTable} aria-label={`${seasonLabel(season)} ${discipline.label} club comparison metrics`}>
      <thead>
        <tr><th scope="col">Metric</th>{comparison.clubs.map((club) => <th key={club.club.id} scope="col"><span className={styles.clubColumn}><ClubBadge name={club.club.name} branding={club.club.branding} size="sm" decorative />{club.club.name}</span></th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}><th scope="row">{row.label}</th>{comparison.clubs.map((club) => <td key={club.club.id}>{row.value(club)}</td>)}</tr>
        ))}
      </tbody>
    </table></div>
  );
}

function CrossClubAthleteAdder({ clubs, selectedAthleteIds, onAthleteChange }: { clubs: Club[]; selectedAthleteIds: string[]; onAthleteChange: (athlete: ClubAthleteLookup & { clubId: string; clubName: string }) => void }) {
  const [athletes, setAthletes] = useState<Array<ClubAthleteLookup & { clubId: string; clubName: string }>>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.all(clubs.map((club) => listClubComparisonAthletes(club.id, '', controller.signal)
      .then((result) => result.data.map((athlete) => ({ ...athlete, clubId: club.id, clubName: club.name })))))
      .then((result) => { if (!controller.signal.aborted) setAthletes(result.flat()); })
      .catch(() => { if (!controller.signal.aborted) setAthletes([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [clubs.map((club) => club.id).join(',')]);
  const athleteLabel = 'Search athletes from selected clubs';
  return <div className={styles.selector}>
    <label htmlFor="cross-athlete-add-select">Add athletes from selected clubs (up to 5)</label>
    <Select id="cross-athlete-add-select" value="" onChange={(event) => { const athlete = athletes.find((candidate) => candidate.id === event.target.value); if (athlete) onAthleteChange(athlete); }} disabled={loading} searchable searchPlaceholder={athleteLabel} emptyMessage={loading ? 'Loading athletes...' : 'No athletes available from selected clubs'} aria-label={athleteLabel} placeholder="Add an athlete..." options={athletes.filter((athlete) => !selectedAthleteIds.includes(athlete.id)).map((athlete) => ({ value: athlete.id, label: `${athlete.name} - ${athlete.clubName}` }))} />
  </div>;
}

export function ComparisonPage() {
  const { activeWorkspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const mode: ComparisonMode = isComparisonMode(modeParam) ? modeParam : 'athlete-club';
  const season = normalizeSeason(searchParams.get('year'));
  const athlete1Id = searchParams.get('athlete1Id') ?? '';
  const athlete2Id = searchParams.get('athlete2Id') ?? '';
  const club1Id = searchParams.get('club1Id') ?? '';
  const club2Id = searchParams.get('club2Id') ?? '';
  const athleteIds = Array.from({ length: MAX_COMPARISON_ITEMS }, (_, index) => searchParams.get(`athlete${index + 1}Id`) ?? '').filter(Boolean);
  const clubIds = Array.from({ length: MAX_COMPARISON_ITEMS }, (_, index) => searchParams.get(`club${index + 1}Id`) ?? '').filter(Boolean);
  void athlete1Id;
  void athlete2Id;
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athletesLoading, setAthletesLoading] = useState(true);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubsError, setClubsError] = useState<string | null>(null);
  const [clubRefreshKey, setClubRefreshKey] = useState(0);
  const [crossAthletes, setCrossAthletes] = useState<Record<string, { name: string; clubId: string; clubName: string }>>({});
  const [comparison, setComparison] = useState<MultiComparisonDetail | null>(null);
  const [clubStatistics, setClubStatistics] = useState<ClubStatistics | null>(null);
  const [clubComparison, setClubComparison] = useState<ClubMultiComparisonDetail | null>(null);
  const [athleteComparisonLoading, setAthleteComparisonLoading] = useState(false);
  const [clubStatisticsLoading, setClubStatisticsLoading] = useState(false);
  const [clubComparisonLoading, setClubComparisonLoading] = useState(false);
  const [athleteError, setAthleteError] = useState<string | null>(null);
  const [clubStatisticsError, setClubStatisticsError] = useState<string | null>(null);
  const [clubComparisonError, setClubComparisonError] = useState<string | null>(null);
  const [publication, setPublication] = useState<ClubPublication | null>(null);
  const [publicationLoading, setPublicationLoading] = useState(true);
  const [publicationUpdating, setPublicationUpdating] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [disciplineCode, setDisciplineCode] = useState('');

  useEffect(() => {
    let current = true;
    setAthletesLoading(true);
    void (seasonQueryValue(season) ? listAthletes({ year: season }) : listAthletes())
      .then((result) => {
        if (current) setAthletes(result.data);
      })
      .catch(() => { if (current) setAthletes([]); })
      .finally(() => { if (current) setAthletesLoading(false); });
    return () => { current = false; };
  }, [season]);

  useEffect(() => {
    let current = true;
    setPublicationLoading(true);
    setPublicationError(null);
    void getClubPublication()
      .then((result) => {
        if (current) setPublication(result);
      })
      .catch((error: unknown) => {
        if (current) setPublicationError(error instanceof Error ? error.message : 'Could not load publication status');
      })
      .finally(() => {
        if (current) setPublicationLoading(false);
      });
    return () => { current = false; };
  }, [activeWorkspace.id]);

  const toggleResultsPublication = useCallback(() => {
    if (!publication || activeWorkspace.role !== 'coach') return;
    setPublicationUpdating(true);
    setPublicationError(null);
    void updateClubPublication(!publication.publicResultsEnabled, publication.publicScheduleEnabled)
      .then(setPublication)
      .catch((error: unknown) => {
        setPublicationError(error instanceof Error ? error.message : 'Could not update publication status');
      })
      .finally(() => setPublicationUpdating(false));
  }, [activeWorkspace.role, publication]);

  useEffect(() => {
    let current = true;
    setClubsLoading(true);
    setClubsError(null);
    void listClubs()
      .then((result) => { if (current) setClubs(result.data); })
      .catch((error: unknown) => { if (current) { setClubs([]); setClubsError(error instanceof Error ? error.message : 'Could not load clubs'); } })
      .finally(() => { if (current) setClubsLoading(false); });
    return () => { current = false; };
  }, [activeWorkspace.id, clubRefreshKey]);

  const toggleSchedulePublication = useCallback(() => {
    if (!publication || activeWorkspace.role !== 'coach') return;
    setPublicationUpdating(true);
    setPublicationError(null);
    void updateClubPublication(publication.publicResultsEnabled, !publication.publicScheduleEnabled)
      .then(setPublication)
      .catch((error: unknown) => {
        setPublicationError(error instanceof Error ? error.message : 'Could not update publication status');
      })
      .finally(() => setPublicationUpdating(false));
  }, [activeWorkspace.role, publication]);

  const selectedCrossAthleteClubIds = athleteIds.map((athleteId) => crossAthletes[athleteId]?.clubId).filter(Boolean);
  const athleteSelectionValid = athleteIds.length >= 2
    && new Set(athleteIds).size === athleteIds.length
    && (mode === 'athlete-club' || (clubIds.length >= 2 && (selectedCrossAthleteClubIds.length < athleteIds.length || new Set(selectedCrossAthleteClubIds).size >= 2)));

  useEffect(() => {
    if ((mode !== 'athlete-club' && mode !== 'athlete-cross-club') || !athleteSelectionValid) {
      setComparison(null);
      setAthleteComparisonLoading(false);
      setAthleteError(null);
      return;
    }
    let current = true;
    setAthleteComparisonLoading(true);
    setAthleteError(null);
    const scope = mode === 'athlete-cross-club' ? 'cross-club' : undefined;
    const request = athleteIds.length === 2
      ? (seasonQueryValue(season) ? getTwoAthleteComparison(athleteIds[0], athleteIds[1], scope, season) : getTwoAthleteComparison(athleteIds[0], athleteIds[1], scope))
      : (seasonQueryValue(season) ? getMultiAthleteComparison(athleteIds, scope, season) : getMultiAthleteComparison(athleteIds, scope));
    void request
      .then((value) => {
        if (current) setComparison(value);
      })
      .catch((error: unknown) => {
        if (current) {
          setAthleteError(error instanceof Error ? error.message : 'Failed to load comparison');
          setComparison(null);
        }
      })
      .finally(() => {
        if (current) setAthleteComparisonLoading(false);
      });
    return () => { current = false; };
  }, [athleteIds.join(','), athleteSelectionValid, mode, season]);

  useEffect(() => {
    if (mode !== 'club-statistics' || !club1Id) {
      setClubStatistics(null);
      setClubStatisticsLoading(false);
      setClubStatisticsError(null);
      return;
    }
    let current = true;
    setClubStatisticsLoading(true);
    setClubStatisticsError(null);
    void (seasonQueryValue(season) ? getClubStatistics(club1Id, season) : getClubStatistics(club1Id))
      .then((value) => {
        if (current) setClubStatistics(value);
      })
      .catch((error: unknown) => {
        if (current) {
          setClubStatisticsError(error instanceof Error ? error.message : 'Failed to load club statistics');
          setClubStatistics(null);
        }
      })
      .finally(() => {
        if (current) setClubStatisticsLoading(false);
      });
    return () => { current = false; };
  }, [club1Id, mode, season]);

  const clubSelectionValid = clubIds.length >= 2 && new Set(clubIds).size === clubIds.length;

  useEffect(() => {
    if (mode !== 'club-comparison' || !clubSelectionValid) {
      setClubComparison(null);
      setClubComparisonLoading(false);
      setClubComparisonError(null);
      return;
    }
    let current = true;
    setClubComparisonLoading(true);
    setClubComparisonError(null);
    const request = clubIds.length === 2
      ? (seasonQueryValue(season) ? getClubComparison(clubIds[0], clubIds[1], season) : getClubComparison(clubIds[0], clubIds[1]))
      : (seasonQueryValue(season) ? getClubMultiComparison(clubIds, season) : getClubMultiComparison(clubIds));
    void request
      .then((value) => {
        if (current) setClubComparison(value);
      })
      .catch((error: unknown) => {
        if (current) {
          setClubComparisonError(error instanceof Error ? error.message : 'Failed to load club comparison');
          setClubComparison(null);
        }
      })
      .finally(() => {
        if (current) setClubComparisonLoading(false);
      });
    return () => { current = false; };
  }, [clubIds.join(','), clubSelectionValid, mode, season]);

  const updateParam = useCallback((key: string, value: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }, [setSearchParams]);

  const updateSelection = useCallback((prefix: 'athlete' | 'club', values: string[]) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      Array.from({ length: MAX_COMPARISON_ITEMS }, (_, index) => index + 1).forEach((index) => next.delete(`${prefix}${index}Id`));
      values.forEach((value, index) => { if (value) next.set(`${prefix}${index + 1}Id`, value); });
      return next;
    });
  }, [setSearchParams]);

  const removeCrossClub = useCallback((clubId: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      const nextClubIds = clubIds.filter((id) => id !== clubId);
      const nextAthleteIds = athleteIds.filter((athleteId) => crossAthletes[athleteId]?.clubId !== clubId);
      Array.from({ length: MAX_COMPARISON_ITEMS }, (_, position) => position + 1).forEach((position) => {
        next.delete(`club${position}Id`);
        next.delete(`athlete${position}Id`);
      });
      nextClubIds.forEach((id, position) => next.set(`club${position + 1}Id`, id));
      nextAthleteIds.forEach((id, position) => next.set(`athlete${position + 1}Id`, id));
      return next;
    });
    setCrossAthletes((current) => Object.fromEntries(Object.entries(current).filter(([, athlete]) => athlete.clubId !== clubId)));
  }, [athleteIds, clubIds, crossAthletes, setSearchParams]);

  const removeCrossAthlete = useCallback((athleteId: string) => {
    updateSelection('athlete', athleteIds.filter((id) => id !== athleteId));
    setCrossAthletes((current) => { const next = { ...current }; delete next[athleteId]; return next; });
  }, [athleteIds, updateSelection]);

  const changeMode = useCallback((nextMode: ComparisonMode) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('mode', nextMode);
      Array.from({ length: MAX_COMPARISON_ITEMS }, (_, index) => index + 1).forEach((index) => {
        next.delete(`athlete${index}Id`);
        next.delete(`club${index}Id`);
      });
      return next;
    });
    setCrossAthletes({});
    setDisciplineCode('');
  }, [setSearchParams]);

  const updateClub = useCallback((clubKey: 'club1Id' | 'club2Id', value: string) => {
    const athleteKey = clubKey === 'club1Id' ? 'athlete1Id' : 'athlete2Id';
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(clubKey, value);
      else next.delete(clubKey);
      next.delete(athleteKey);
      return next;
    });
  }, [setSearchParams]);
  void updateParam;

  const club1Options = clubs
    .filter((club) => club.id !== club2Id || club.id === club1Id)
    .map((club) => ({ value: club.id, label: club.name }));

  const athleteMode = mode === 'athlete-club' || mode === 'athlete-cross-club';
  const selectedCrossClubs = clubs.filter((club) => clubIds.includes(club.id));
  const availableDisciplines = athleteMode
    ? comparison?.availableDisciplines ?? []
    : mode === 'club-statistics'
      ? clubStatistics?.availableDisciplines ?? []
      : [...new Map((clubComparison?.clubs ?? []).flatMap((club) => club.availableDisciplines ?? []).map((discipline) => [discipline.discipline, discipline])).values()];
  const selectedDiscipline = availableDisciplines.find((discipline) => discipline.discipline === disciplineCode)
    ?? availableDisciplines[0];
  useEffect(() => {
    if (selectedDiscipline && selectedDiscipline.discipline !== disciplineCode) setDisciplineCode(selectedDiscipline.discipline);
  }, [disciplineCode, selectedDiscipline]);
  const selectDiscipline = useCallback((code: string) => {
    setDisciplineCode(code);
  }, []);
  const loading = athleteMode
    ? athleteComparisonLoading
    : mode === 'club-statistics'
      ? clubStatisticsLoading
      : clubComparisonLoading;
  const comparisonError = athleteMode
    ? athleteError
    : mode === 'club-statistics'
      ? clubStatisticsError
      : clubComparisonError;
  const error = (mode === 'athlete-club' ? null : clubsError) ?? comparisonError;
  const selectionReady = athleteMode
    ? athleteSelectionValid
    : mode === 'club-statistics'
      ? Boolean(club1Id)
      : clubSelectionValid;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Compare Performance</h1>
          <p className={styles.subtitle}>Compare athlete progression and club performance across every discipline for {seasonLabel(season)}.</p>
        </div>
        <SeasonSelector value={season} onChange={(nextSeason: SeasonValue) => setSearchParams((previous) => { const next = new URLSearchParams(previous); const value = seasonQueryValue(nextSeason); if (value) next.set('year', value); else next.delete('year'); return next; })} />
      </div>

      <Card>
        <div className={styles.publicationPanel}>
          <div>
            <p className={styles.publicationEyebrow}>Public statistics</p>
              <h2>Share this club's results</h2>
            <p>
              Publishing makes the club name, non-archived athlete names, and all-discipline metrics (personal bests, leaderboards, detailed reports) visible on Athlora's public Stats page.
            </p>
          </div>
          <div className={styles.publicationAction}>
            {publicationLoading ? <p>Loading publication status...</p> : activeWorkspace.role === 'coach' ? (
              <Button onClick={toggleResultsPublication} disabled={publicationUpdating}>
                {publication?.publicResultsEnabled ? 'Stop publishing' : 'Publish results'}
              </Button>
            ) : <p>Only a coach can change this setting.</p>}
            {publication && <span className={publication.publicResultsEnabled ? styles.published : styles.unpublished}>
              {publication.publicResultsEnabled ? 'Public' : 'Private'}
            </span>}
          </div>
        </div>
        <div className={styles.publicationPanel}>
          <div>
            <p className={styles.publicationEyebrow}>Public schedule</p>
            <h2>Share this club's upcoming meets</h2>
            <p>
              Publishing makes upcoming meet titles, dates/times, venues, and disciplines visible to anyone. It never exposes athlete or guest rosters.
            </p>
          </div>
          <div className={styles.publicationAction}>
            {publicationLoading ? <p>Loading publication status...</p> : activeWorkspace.role === 'coach' ? (
              <Button onClick={toggleSchedulePublication} disabled={publicationUpdating}>
                {publication?.publicScheduleEnabled ? 'Stop publishing' : 'Publish schedule'}
              </Button>
            ) : <p>Only a coach can change this setting.</p>}
            {publication && <span className={publication.publicScheduleEnabled ? styles.published : styles.unpublished}>
              {publication.publicScheduleEnabled ? 'Public' : 'Private'}
            </span>}
          </div>
        </div>
        {publicationError && <p className={styles.publicationError} role="alert">{publicationError}</p>}
      </Card>

      <Card>
        <div className={styles.modeSelector}>
          <label htmlFor="comparison-mode">Comparison mode</label>
          <Select
            id="comparison-mode"
            value={mode}
            onChange={(event) => changeMode(event.target.value as ComparisonMode)}
            aria-label="Comparison mode"
            options={comparisonModes}
          />
        </div>
      </Card>

      {mode === 'athlete-club' && (
        <Card>
          <div className={styles.selectionEditor}>
            <div className={styles.selector}><label htmlFor="athlete-add-select">Add athletes (up to 5)</label><Select id="athlete-add-select" value="" onChange={(event) => { if (event.target.value) updateSelection('athlete', [...athleteIds, event.target.value]); }} disabled={athletesLoading || athleteIds.length === MAX_COMPARISON_ITEMS} searchable searchPlaceholder="Search athletes in your club" aria-label="Add athlete to comparison" placeholder="Add an athlete..." options={athletes.filter((athlete) => !athleteIds.includes(athlete.id)).map((athlete) => ({ value: athlete.id, label: athlete.name }))} /></div>
            {athleteIds.length > 0 && <ul className={styles.selectionChips} aria-label="Selected athletes">{athleteIds.map((athleteId, index) => { const athlete = athletes.find((candidate) => candidate.id === athleteId); return <li key={`${athleteId}-${index}`}><span className={styles.selectionName}><strong>{athlete?.name ?? 'Selected athlete'}</strong><small>{activeWorkspace.name}</small></span><button type="button" aria-label={`Remove ${athlete?.name ?? 'athlete'}`} onClick={() => updateSelection('athlete', athleteIds.filter((id) => id !== athleteId))}>×</button></li>; })}</ul>}
          </div>
        </Card>
      )}

      {mode === 'athlete-cross-club' && (
        <Card>
          <div className={styles.selectionEditor}>
            <div className={styles.selector}><label htmlFor="cross-club-add-select">Add clubs (up to 5)</label><Select id="cross-club-add-select" value="" onChange={(event) => { if (event.target.value) updateSelection('club', [...clubIds, event.target.value]); }} disabled={clubsLoading || clubIds.length === MAX_COMPARISON_ITEMS} searchable searchPlaceholder="Search clubs" aria-label="Add club for athlete comparison" placeholder="Add a club..." options={clubs.filter((club) => !clubIds.includes(club.id)).map((club) => ({ value: club.id, label: club.name }))} /></div>
            {clubIds.length > 0 && <ul className={styles.selectionChips} aria-label="Selected comparison clubs">{clubIds.map((clubId, index) => { const club = clubs.find((candidate) => candidate.id === clubId); return <li key={`${clubId}-${index}`}>{club?.name ?? 'Selected club'}<button type="button" aria-label={`Remove ${club?.name ?? 'club'}`} onClick={() => removeCrossClub(clubId)}>×</button></li>; })}</ul>}
            {selectedCrossClubs.length > 0 && athleteIds.length < MAX_COMPARISON_ITEMS && <CrossClubAthleteAdder clubs={selectedCrossClubs} selectedAthleteIds={athleteIds} onAthleteChange={(athlete) => { setCrossAthletes((current) => ({ ...current, [athlete.id]: { name: athlete.name, clubId: athlete.clubId, clubName: athlete.clubName } })); updateSelection('athlete', [...athleteIds, athlete.id]); }} />}
            {athleteIds.length > 0 && <ul className={styles.selectionChips} aria-label="Selected comparison athletes">{athleteIds.map((athleteId, index) => { const selectedAthlete = crossAthletes[athleteId]; const athleteName = comparison?.athletes.find((athlete) => athlete.athlete.id === athleteId)?.athlete.name ?? selectedAthlete?.name ?? 'Selected athlete'; return <li key={`${athleteId}-${index}`}><span className={styles.selectionName}><strong>{athleteName}</strong><small>{selectedAthlete?.clubName ?? 'Selected club'}</small></span><button type="button" aria-label={`Remove ${athleteName}`} onClick={() => removeCrossAthlete(athleteId)}>×</button></li>; })}</ul>}
          </div>
        </Card>
      )}

      {mode === 'club-statistics' && (
        <Card>
          <div className={styles.singleSelector}><label htmlFor="statistics-club-select">Club</label><Select id="statistics-club-select" value={club1Id} onChange={(event) => updateClub('club1Id', event.target.value)} disabled={clubsLoading} searchable searchPlaceholder="Search clubs" aria-label="Select club for statistics" placeholder="Select club..." options={[{ value: '', label: 'Select club...' }, ...club1Options]} /></div>
        </Card>
      )}

      {mode === 'club-comparison' && (
        <Card>
          <div className={styles.selectionEditor}>
            <div className={styles.selector}><label htmlFor="club-add-select">Add clubs (up to 5)</label><Select id="club-add-select" value="" onChange={(event) => { if (event.target.value) updateSelection('club', [...clubIds, event.target.value]); }} disabled={clubsLoading || clubIds.length === MAX_COMPARISON_ITEMS} searchable searchPlaceholder="Search clubs" aria-label="Add club to comparison" placeholder="Add a club..." options={clubs.filter((club) => !clubIds.includes(club.id)).map((club) => ({ value: club.id, label: club.name }))} /></div>
            {clubIds.length > 0 && <ul className={styles.selectionChips} aria-label="Selected clubs">{clubIds.map((clubId, index) => { const club = clubs.find((candidate) => candidate.id === clubId); return <li key={`${clubId}-${index}`}>{club?.name ?? 'Selected club'}<button type="button" aria-label={`Remove ${club?.name ?? 'club'}`} onClick={() => updateSelection('club', clubIds.filter((id) => id !== clubId))}>×</button></li>; })}</ul>}
          </div>
        </Card>
      )}

      <div aria-live="polite" className="sr-only">
        {loading ? 'Loading comparison data...' : ''}
      </div>

      {loading && <Card><p role="status">Loading comparison data...</p></Card>}

      {error && (
        <Card>
          <div className={styles.error} role="alert">
            <strong>{clubsError ? 'Club list unavailable' : 'Comparison unavailable'}</strong>
            <p>{error}</p>
            {clubsError && <Button onClick={() => setClubRefreshKey((value) => value + 1)}>Retry club list</Button>}
          </div>
        </Card>
      )}

      {!loading && !error && !selectionReady && (
        <Card>
          <p className={styles.empty}>
            {mode === 'athlete-club' && 'Select two to five different athletes from your club.'}
            {mode === 'athlete-cross-club' && 'Select at least two clubs, then add two to five athletes across them.'}
            {mode === 'club-statistics' && `Select a club to view its ${seasonLabel(season).toLowerCase()} performance.`}
            {mode === 'club-comparison' && `Select two to five different clubs to compare their ${seasonLabel(season).toLowerCase()} performance.`}
          </p>
        </Card>
      )}

      {!loading && !error && athleteMode && selectionReady && comparison && (
        <>
          {selectedDiscipline && <Card><DisciplineTabs disciplines={availableDisciplines} selected={selectedDiscipline} onSelect={selectDiscipline} label="Comparison discipline" /></Card>}
          <Card>
            <div className={styles.metricsGrid} role="list" aria-label="Comparison metrics summary">
              {comparison.athletes.flatMap((athlete) => [
                <div key={`${athlete.athlete.id}-pb`} role="listitem"><MetricCard label={`${athlete.athlete.name} PB`} value={selectedDiscipline ? athleteDiscipline(athlete, selectedDiscipline)?.pb ?? null : null} discipline={selectedDiscipline} /></div>,
                <div key={`${athlete.athlete.id}-latest`} role="listitem"><MetricCard label={`${athlete.athlete.name} latest`} value={selectedDiscipline ? athleteDiscipline(athlete, selectedDiscipline)?.latestEffectiveResult ?? null : null} discipline={selectedDiscipline} /></div>,
              ])}
            </div>
          </Card>

          <Card>
            <div className={styles.viewToggle}>
              <Button onClick={() => setViewMode('chart')} aria-pressed={viewMode === 'chart'}>Chart</Button>
              <Button onClick={() => setViewMode('table')} aria-pressed={viewMode === 'table'}>Table</Button>
            </div>
            {selectedDiscipline && (viewMode === 'chart' ? <ComparisonChart comparison={comparison} discipline={selectedDiscipline} season={season} /> : <ComparisonTable comparison={comparison} discipline={selectedDiscipline} />)}
          </Card>
        </>
      )}

      {!loading && !error && mode === 'club-statistics' && clubStatistics && (
        <>
          {availableDisciplines.length > 0 && <Card><DisciplineTabs disciplines={availableDisciplines} selected={selectedDiscipline} onSelect={selectDiscipline} label="Club statistics discipline" /></Card>}
          <Card>
            <div className={styles.metricsGrid} role="list" aria-label="Club statistics summary">
              <div role="listitem"><TextMetricCard label="Total roster" value={selectedDiscipline ? clubDiscipline(clubStatistics, selectedDiscipline)?.rosterAthleteCount ?? clubStatistics.roster.total : clubStatistics.roster.total} /></div>
              <div role="listitem"><TextMetricCard label="Active athletes" value={selectedDiscipline ? clubDiscipline(clubStatistics, selectedDiscipline)?.activeAthleteCount ?? clubStatistics.roster.active : clubStatistics.roster.active} /></div>
               <div role="listitem"><MetricCard label="Best performance" value={selectedDiscipline ? clubDiscipline(clubStatistics, selectedDiscipline)?.fastestValidResult ?? (selectedDiscipline.discipline === '100m' ? clubStatistics.fastestValidTime : null) : null} discipline={selectedDiscipline} /></div>
               <div role="listitem"><MetricCard label="Average performance" value={selectedDiscipline ? clubDiscipline(clubStatistics, selectedDiscipline)?.averageValidResult ?? (selectedDiscipline.discipline === '100m' ? clubStatistics.averageValidTime : null) : null} discipline={selectedDiscipline} /></div>
            </div>
          </Card>
          {selectedDiscipline ? <Card><ClubStatisticsTable statistics={clubStatistics} season={season} discipline={selectedDiscipline} /></Card> : <Card><p className={styles.empty}>Choose a discipline to view discipline-specific statistics.</p></Card>}
        </>
      )}

      {!loading && !error && mode === 'club-comparison' && clubComparison && (
        <>
          {availableDisciplines.length > 0 && <Card><DisciplineTabs disciplines={availableDisciplines} selected={selectedDiscipline} onSelect={selectDiscipline} label="Club comparison discipline" /></Card>}
          <Card>
            <div className={styles.metricsGrid} role="list" aria-label="Club comparison summary">
              {clubComparison.clubs.flatMap((club) => {
                const disciplineStatistics = selectedDiscipline ? clubDiscipline(club, selectedDiscipline) : undefined;
                return [
                  <div key={`${club.club.id}-roster`} role="listitem"><TextMetricCard label={`${club.club.name} total roster`} value={disciplineStatistics?.rosterAthleteCount ?? club.roster.total} /></div>,
                  <div key={`${club.club.id}-active`} role="listitem"><TextMetricCard label={`${club.club.name} active athletes`} value={disciplineStatistics?.activeAthleteCount ?? club.roster.active} /></div>,
                ];
              })}
            </div>
          </Card>
          {selectedDiscipline ? <Card><ClubComparisonTable comparison={clubComparison} season={season} discipline={selectedDiscipline} /></Card> : <Card><p className={styles.empty}>Choose a discipline to view discipline-specific comparison metrics.</p></Card>}
        </>
      )}
    </main>
  );
}
