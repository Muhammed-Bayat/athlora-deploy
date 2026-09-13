import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
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
import { Button, Card, Select } from '../../components';
import type {
  Athlete,
  Club,
  ClubAthleteLookup,
  ClubMultiComparisonDetail,
  ClubPublication,
  ClubStatistics,
  ComparisonAthleteAggregate,
  MultiComparisonDetail,
  ProgressionEntry,
} from '../../types';
import { format100mSeconds, formatDateOnly } from '../../utils/formatting';
import styles from './ComparisonPage.module.css';
import { useWorkspace } from '../auth/WorkspaceContext';

const SVG_PADDING = { top: 28, right: 24, bottom: 48, left: 64 };
const SVG_WIDTH = 700;
const SVG_HEIGHT = 320;
const CHART_WIDTH = SVG_WIDTH - SVG_PADDING.left - SVG_PADDING.right;
const CHART_HEIGHT = SVG_HEIGHT - SVG_PADDING.top - SVG_PADDING.bottom;

type ViewMode = 'chart' | 'table';
type ComparisonMode = 'athlete-club' | 'athlete-cross-club' | 'club-statistics' | 'club-comparison';
type ChartPoint = { x: number; y: number; entry: ProgressionEntry; athleteIndex: number };
const MAX_COMPARISON_ITEMS = 5;
const SERIES_COLORS = ['var(--console-comparison-series-a)', 'var(--console-comparison-series-b)', '#bb8af5', '#f0b45e', '#78d69a'];

interface ChartGeometry {
  series: ChartPoint[][];
  yTickValues: number[];
  yMin: number;
  yRange: number;
  minTime: number;
  maxTime: number;
}

const comparisonModes: Array<{ value: ComparisonMode; label: string }> = [
  { value: 'athlete-club', label: 'Athlete vs athlete in my club' },
  { value: 'athlete-cross-club', label: 'Athlete vs athlete across clubs' },
  { value: 'club-statistics', label: 'Club statistics' },
  { value: 'club-comparison', label: 'Club vs club' },
];

function isComparisonMode(value: string | null): value is ComparisonMode {
  return comparisonModes.some((mode) => mode.value === value);
}

function closestPoint(points: ChartPoint[], svg: SVGSVGElement | null, clientX: number, clientY: number): ChartPoint | null {
  if (!svg || points.length === 0) return null;
  const bounds = svg.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) return points[0];
  const x = ((clientX - bounds.left) / bounds.width) * SVG_WIDTH;
  const y = ((clientY - bounds.top) / bounds.height) * SVG_HEIGHT;
  return points.reduce((nearest, point) => (
    (point.x - x) ** 2 + (point.y - y) ** 2 < (nearest.x - x) ** 2 + (nearest.y - y) ** 2
      ? point
      : nearest
  ));
}

function buildComparisonChartGeometry(athletes: ComparisonAthleteAggregate[]): ChartGeometry | null {
  const series = athletes.map((athlete, athleteIndex) =>
    athlete.progression
      .filter((entry) => entry.effectiveOutcome === 'valid' && entry.effectiveResult !== null)
      .map((entry) => ({ entry, athleteIndex })),
  );
  const allValid = series.flat();
  if (allValid.length === 0) return null;

  const times = allValid.map((point) => new Date(point.entry.event.date).getTime());
  const results = allValid.map((point) => point.entry.effectiveResult!);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minResult = Math.min(...results);
  const maxResult = Math.max(...results);
  const resultPadding = Math.max((maxResult - minResult) * 0.12, 0.08);

  const xMin = minTime;
  const xRange = Math.max(maxTime - minTime, 1);
  const yMin = minResult - resultPadding;
  const yRange = maxResult - minResult + resultPadding * 2;

  function xScale(time: number): number {
    return SVG_PADDING.left + ((time - xMin) / xRange) * CHART_WIDTH;
  }

  function yScale(result: number): number {
    return SVG_PADDING.top + ((result - yMin) / yRange) * CHART_HEIGHT;
  }

  const scaledSeries = series.map((athleteSeries) => athleteSeries.map((point) => ({
    x: xScale(new Date(point.entry.event.date).getTime()),
    y: yScale(point.entry.effectiveResult!),
    entry: point.entry,
    athleteIndex: point.athleteIndex,
  })));

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, index) => yMin + (index / yTicks) * yRange);

  return { series: scaledSeries, yTickValues, yMin, yRange, minTime, maxTime };
}

function formatMetric(value: number | null): string {
  if (value === null) return '-';
  return format100mSeconds(value);
}

function MetricCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      {value !== null ? (
        <p className={styles.metricValue}>{formatMetric(value)}</p>
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

function ComparisonTable({ comparison }: { comparison: MultiComparisonDetail }) {
  const rows: Array<{ label: string; value: (athlete: ComparisonAthleteAggregate) => string }> = [
    { label: 'PB', value: (athlete) => formatMetric(athlete.pb) },
    { label: 'Latest effective result', value: (athlete) => formatMetric(athlete.latestEffectiveResult) },
    { label: 'Valid result count', value: (athlete) => String(athlete.validResultCount) },
    { label: 'Average', value: (athlete) => formatMetric(athlete.average) },
    { label: 'Consistency (SD)', value: (athlete) => formatMetric(athlete.consistency) },
    { label: 'Improvement', value: (athlete) => formatMetric(athlete.improvement) },
  ];

  return (
    <table className={styles.comparisonTable} aria-label={comparison.athletes.length === 2 ? 'Two-athlete comparison metrics' : 'Athlete comparison metrics'}>
      <thead>
        <tr>
          <th scope="col">Metric</th>
          {comparison.athletes.map((athlete) => <th key={athlete.athlete.id} scope="col">{athlete.athlete.name}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {comparison.athletes.map((athlete) => <td key={athlete.athlete.id}>{row.value(athlete)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ComparisonChart({ comparison }: { comparison: MultiComparisonDetail }) {
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  const geometry = useMemo(
    () => buildComparisonChartGeometry(comparison.athletes),
    [comparison],
  );
  const athleteColors = useMemo(() => new Map(
    [...comparison.athletes]
      .sort((left, right) => left.athlete.id.localeCompare(right.athlete.id))
      .map((athlete, index) => [athlete.athlete.id, SERIES_COLORS[index]]),
  ), [comparison.athletes]);

  if (!geometry) {
    return <p className={styles.empty}>None of the selected athletes has a valid 100m result to chart.</p>;
  }

  const { series, yTickValues } = geometry;

  return (
    <div className={styles.chartWrap}>
      <h2 className={styles.chartHeading}>
        {`${comparison.athletes.map((athlete) => athlete.athlete.name).join(' vs ')}: 100m Progression`}
      </h2>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label={`100m progression chart comparing ${comparison.athletes.map((athlete) => athlete.athlete.name).join(', ')}`}
      >
          <title>{`100m progression comparison: ${comparison.athletes.map((athlete) => athlete.athlete.name).join(' vs ')}`}</title>
        <desc>
          {`Chronological progression of valid 100m results for ${comparison.athletes.map((athlete) => athlete.athlete.name).join(', ')}`}
        </desc>

        <line
          x1={SVG_PADDING.left}
          y1={SVG_PADDING.top}
          x2={SVG_PADDING.left}
          y2={SVG_HEIGHT - SVG_PADDING.bottom}
          stroke="var(--console-line)"
          strokeWidth="1"
        />
        <line
          x1={SVG_PADDING.left}
          y1={SVG_HEIGHT - SVG_PADDING.bottom}
          x2={SVG_WIDTH - SVG_PADDING.right}
          y2={SVG_HEIGHT - SVG_PADDING.bottom}
          stroke="var(--console-line)"
          strokeWidth="1"
        />

        {yTickValues.map((tick) => (
          <g key={tick}>
            <line
              x1={SVG_PADDING.left}
              y1={SVG_PADDING.top + ((tick - geometry.yMin) / geometry.yRange) * CHART_HEIGHT}
              x2={SVG_PADDING.left + CHART_WIDTH}
              y2={SVG_PADDING.top + ((tick - geometry.yMin) / geometry.yRange) * CHART_HEIGHT}
              stroke="var(--console-line)"
              strokeDasharray="4 4"
            />
            <text
              x={SVG_PADDING.left - 8}
              y={SVG_PADDING.top + ((tick - geometry.yMin) / geometry.yRange) * CHART_HEIGHT + 4}
              textAnchor="end"
              className={styles.axisLabel}
            >
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        <text
          x={SVG_PADDING.left + CHART_WIDTH / 2}
          y={SVG_HEIGHT - 8}
          textAnchor="middle"
          className={styles.axisTitle}
        >
          Date
        </text>
        <text
          x={12}
          y={SVG_HEIGHT / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${SVG_HEIGHT / 2})`}
          className={styles.axisTitle}
        >
          Time (s)
        </text>

        {series.map((athleteSeries, athleteIndex) => (
          <g key={comparison.athletes[athleteIndex].athlete.id}>
            {athleteSeries.length > 1 && (
              <>
                <polyline
                  data-series={`athlete-${athleteIndex + 1}`}
                  data-series-color={athleteColors.get(comparison.athletes[athleteIndex].athlete.id)}
                  points={athleteSeries.map((point) => `${point.x},${point.y}`).join(' ')}
                  className={styles.seriesLine}
                  style={{ stroke: athleteColors.get(comparison.athletes[athleteIndex].athlete.id) }}
                />
                <polyline
                  data-testid={`comparison-line-hit-area-${athleteIndex + 1}`}
                  points={athleteSeries.map((point) => `${point.x},${point.y}`).join(' ')}
                  className={styles.lineHitArea}
                  onPointerMove={(event) => setHoveredPoint(closestPoint(
                    athleteSeries,
                    event.currentTarget.ownerSVGElement,
                    event.clientX,
                    event.clientY,
                  ))}
                  onPointerLeave={() => setHoveredPoint(null)}
                />
              </>
            )}
            {athleteSeries.map((point) => (
              <circle
                key={point.entry.event.id}
                cx={point.x}
                cy={point.y}
                r={4.5}
                className={styles.seriesPoint}
                style={{ fill: athleteColors.get(comparison.athletes[athleteIndex].athlete.id) }}
                tabIndex={0}
                role="img"
                aria-label={`${comparison.athletes[athleteIndex].athlete.name}: ${format100mSeconds(point.entry.effectiveResult!)} on ${formatDateOnly(point.entry.event.date)}`}
                onPointerEnter={() => setHoveredPoint(point)}
                onPointerLeave={() => setHoveredPoint(null)}
                onFocus={() => setHoveredPoint(point)}
                onBlur={() => setHoveredPoint(null)}
              >
                <title>{`${comparison.athletes[athleteIndex].athlete.name}: ${format100mSeconds(point.entry.effectiveResult!)} on ${formatDateOnly(point.entry.event.date)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {hoveredPoint && (
          <g
            role="tooltip"
            className={styles.tooltip}
            transform={`translate(${Math.min(hoveredPoint.x + 12, SVG_WIDTH - 190)} ${Math.max(hoveredPoint.y - 42, SVG_PADDING.top)})`}
          >
            <rect width="178" height="36" rx="6" className={styles.tooltipBox} />
            <text x="10" y="14" className={styles.tooltipText}>{comparison.athletes[hoveredPoint.athleteIndex].athlete.name}</text>
            <text x="10" y="28" className={styles.tooltipValue}>
              {`${formatDateOnly(hoveredPoint.entry.event.date)} - ${format100mSeconds(hoveredPoint.entry.effectiveResult!)}`}
            </text>
          </g>
        )}
      </svg>
      <div className={styles.legend} role="list" aria-label="Chart legend">
        {comparison.athletes.map((athlete) => <span key={athlete.athlete.id} className={styles.legendItem} role="listitem">
          <span className={styles.legendLine} style={{ background: athleteColors.get(athlete.athlete.id) }} aria-hidden="true" />
          {athlete.athlete.name}
        </span>)}
      </div>
    </div>
  );
}

function ClubStatisticsTable({ statistics }: { statistics: ClubStatistics }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Total roster', value: String(statistics.roster.total) },
    { label: 'Active athletes', value: String(statistics.roster.active) },
    { label: 'Inactive athletes', value: String(statistics.roster.inactive) },
    { label: 'Archived athletes', value: String(statistics.roster.archived) },
    { label: 'Athletes with valid results', value: String(statistics.distinctAthletesWithValidResults) },
    { label: 'Valid 100m results', value: String(statistics.valid100mResultCount) },
    { label: 'All 100m result records', value: String(statistics.total100mResultCount) },
    { label: 'Fastest valid time', value: formatMetric(statistics.fastestValidTime) },
    { label: 'Latest valid time', value: formatMetric(statistics.latestValidTime) },
    { label: 'Average valid time', value: formatMetric(statistics.averageValidTime) },
    { label: 'Median valid time', value: formatMetric(statistics.medianValidTime) },
    { label: 'Consistency (SD)', value: formatMetric(statistics.populationStandardDeviation) },
  ];

  return (
    <table className={styles.comparisonTable} aria-label={`${statistics.club.name} all-time 100m statistics`}>
      <thead>
        <tr><th scope="col">Metric</th><th scope="col">{statistics.club.name}</th></tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function ClubComparisonTable({ comparison }: { comparison: ClubMultiComparisonDetail }) {
  const rows: Array<{ label: string; value: (club: ClubStatistics) => string }> = [
    { label: 'Total roster', value: (club) => String(club.roster.total) }, { label: 'Active athletes', value: (club) => String(club.roster.active) },
    { label: 'Athletes with valid results', value: (club) => String(club.distinctAthletesWithValidResults) }, { label: 'Valid 100m results', value: (club) => String(club.valid100mResultCount) },
    { label: 'Fastest valid time', value: (club) => formatMetric(club.fastestValidTime) }, { label: 'Latest valid time', value: (club) => formatMetric(club.latestValidTime) },
    { label: 'Average valid time', value: (club) => formatMetric(club.averageValidTime) }, { label: 'Median valid time', value: (club) => formatMetric(club.medianValidTime) },
    { label: 'Consistency (SD)', value: (club) => formatMetric(club.populationStandardDeviation) },
  ];

  return (
    <table className={styles.comparisonTable} aria-label="Club comparison metrics">
      <thead>
        <tr><th scope="col">Metric</th>{comparison.clubs.map((club) => <th key={club.club.id} scope="col">{club.club.name}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}><th scope="row">{row.label}</th>{comparison.clubs.map((club) => <td key={club.club.id}>{row.value(club)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function athleteSearchMessage(clubId: string, search: string, loading: boolean): string {
  if (!clubId) return 'Select a club first';
  if (loading) return 'Searching athletes...';
  if (search.trim().length < 2) return 'Type at least two characters to search';
  return 'No athletes match this search';
}

function CrossClubAthleteSelector({ index, clubId, athleteId, clubs, selectedClubIds, onClubChange, onAthleteChange, onRemove }: {
  index: number; clubId: string; athleteId: string; clubs: Club[]; selectedClubIds: string[];
  onClubChange: (value: string) => void; onAthleteChange: (value: string) => void; onRemove: () => void;
}) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [athletes, setAthletes] = useState<ClubAthleteLookup[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!clubId || deferredSearch.trim().length < 2) { setAthletes([]); return; }
    const controller = new AbortController();
    setLoading(true);
    void listClubComparisonAthletes(clubId, deferredSearch, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setAthletes(result.data); })
      .catch(() => { if (!controller.signal.aborted) setAthletes([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [clubId, deferredSearch]);
  const clubOptions = clubs.filter((club) => club.id === clubId || !selectedClubIds.includes(club.id)).map((club) => ({ value: club.id, label: club.name }));
  const position = index + 1;
  const clubLabel = index === 0 ? 'Select first club for athlete comparison' : index === 1 ? 'Select second club for athlete comparison' : `Select club ${position} for athlete comparison`;
  const athleteLabel = index === 0 ? 'Search first athlete by name' : index === 1 ? 'Search second athlete by name' : `Search athlete ${position} by name`;
  return <div className={styles.selector}>
    <label htmlFor={`cross-club-${position}-select`}>Club {position}</label>
    <Select id={`cross-club-${position}-select`} value={clubId} onChange={(event) => onClubChange(event.target.value)} aria-label={clubLabel} placeholder="Select club..." options={[{ value: '', label: 'Select club...' }, ...clubOptions]} />
    <label htmlFor={`cross-athlete-${position}-select`}>Search athlete {position} by name</label>
    <Select key={`cross-athlete-${position}-${clubId}`} id={`cross-athlete-${position}-select`} value={athleteId} onChange={(event) => onAthleteChange(event.target.value)} disabled={!clubId} searchable searchPlaceholder={athleteLabel} emptyMessage={athleteSearchMessage(clubId, search, loading)} aria-label={athleteLabel} placeholder="Search club roster..." options={athletes.map((athlete) => ({ value: athlete.id, label: athlete.name }))} onSearchChange={(value) => { setSearch(value); onAthleteChange(''); }} />
    {(clubId || athleteId) && <Button onClick={onRemove}>Remove athlete {position}</Button>}
  </div>;
}

export function ComparisonPage() {
  const { activeWorkspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const mode: ComparisonMode = isComparisonMode(modeParam) ? modeParam : 'athlete-club';
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
  const [club1Athletes, setClub1Athletes] = useState<ClubAthleteLookup[]>([]);
  const [club2Athletes, setClub2Athletes] = useState<ClubAthleteLookup[]>([]);
  const [club1Search, setClub1Search] = useState('');
  const [club2Search, setClub2Search] = useState('');
  const [club1AthletesLoading, setClub1AthletesLoading] = useState(false);
  const [club2AthletesLoading, setClub2AthletesLoading] = useState(false);
  const [crossSearchError, setCrossSearchError] = useState<string | null>(null);
  void club1Athletes;
  void club2Athletes;
  void club1AthletesLoading;
  void club2AthletesLoading;
  void crossSearchError;
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
  const [athleteSlotCount, setAthleteSlotCount] = useState(2);
  const [clubSlotCount, setClubSlotCount] = useState(2);
  const deferredClub1Search = useDeferredValue(club1Search);
  const deferredClub2Search = useDeferredValue(club2Search);

  useEffect(() => {
    let current = true;
    setAthletesLoading(true);
    void listAthletes()
      .then((result) => {
        if (current) setAthletes(result.data);
      })
      .catch(() => {
        if (current) setAthletes([]);
      })
      .finally(() => {
        if (current) setAthletesLoading(false);
      });
    return () => { current = false; };
  }, []);

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

  const togglePublication = useCallback(() => {
    if (!publication || activeWorkspace.role !== 'coach') return;
    const nextEnabled = !publication.publicResultsEnabled;
    setPublicationUpdating(true);
    setPublicationError(null);
    void updateClubPublication(nextEnabled)
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
      .then((result) => {
        if (current) setClubs(result.data);
      })
      .catch((error: unknown) => {
        if (current) {
          setClubs([]);
          setClubsError(error instanceof Error ? error.message : 'Could not load clubs');
        }
      })
      .finally(() => {
        if (current) setClubsLoading(false);
      });
    return () => { current = false; };
  }, [activeWorkspace.id, clubRefreshKey]);

  useEffect(() => {
    if (mode !== 'athlete-cross-club' || !club1Id || deferredClub1Search.trim().length < 2) {
      setClub1Athletes([]);
      setClub1AthletesLoading(false);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setClub1AthletesLoading(true);
    setCrossSearchError(null);
    void listClubComparisonAthletes(club1Id, deferredClub1Search, controller.signal)
      .then((result) => {
        if (current) setClub1Athletes(result.data);
      })
      .catch((error: unknown) => {
        if (current && !controller.signal.aborted) {
          setCrossSearchError(error instanceof Error ? error.message : 'Could not search the first club roster');
        }
      })
      .finally(() => {
        if (current && !controller.signal.aborted) setClub1AthletesLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [club1Id, deferredClub1Search, mode]);

  useEffect(() => {
    if (mode !== 'athlete-cross-club' || !club2Id || deferredClub2Search.trim().length < 2) {
      setClub2Athletes([]);
      setClub2AthletesLoading(false);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setClub2AthletesLoading(true);
    setCrossSearchError(null);
    void listClubComparisonAthletes(club2Id, deferredClub2Search, controller.signal)
      .then((result) => {
        if (current) setClub2Athletes(result.data);
      })
      .catch((error: unknown) => {
        if (current && !controller.signal.aborted) {
          setCrossSearchError(error instanceof Error ? error.message : 'Could not search the second club roster');
        }
      })
      .finally(() => {
        if (current && !controller.signal.aborted) setClub2AthletesLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [club2Id, deferredClub2Search, mode]);

  const athleteSelectionValid = athleteIds.length >= 2
    && new Set(athleteIds).size === athleteIds.length
    && (mode === 'athlete-club' || (clubIds.length === athleteIds.length && new Set(clubIds).size === clubIds.length));

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
      ? getTwoAthleteComparison(athleteIds[0], athleteIds[1], scope)
      : getMultiAthleteComparison(athleteIds, scope);
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
  }, [athleteIds.join(','), athleteSelectionValid, mode]);

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
    void getClubStatistics(club1Id)
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
  }, [club1Id, mode]);

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
      ? getClubComparison(clubIds[0], clubIds[1])
      : getClubMultiComparison(clubIds);
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
  }, [clubIds.join(','), clubSelectionValid, mode]);

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

  const removeCrossClubSelection = useCallback((index: number) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      const nextClubIds = clubIds.filter((_, position) => position !== index);
      const nextAthleteIds = athleteIds.filter((_, position) => position !== index);
      Array.from({ length: MAX_COMPARISON_ITEMS }, (_, position) => position + 1).forEach((position) => {
        next.delete(`club${position}Id`);
        next.delete(`athlete${position}Id`);
      });
      nextClubIds.forEach((id, position) => next.set(`club${position + 1}Id`, id));
      nextAthleteIds.forEach((id, position) => next.set(`athlete${position + 1}Id`, id));
      return next;
    });
    setAthleteSlotCount((count) => Math.max(2, count - 1));
  }, [athleteIds, clubIds, setSearchParams]);

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
    setClub1Search('');
    setClub2Search('');
    setCrossSearchError(null);
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
    if (clubKey === 'club1Id') {
      setClub1Search('');
      setClub1Athletes([]);
    } else {
      setClub2Search('');
      setClub2Athletes([]);
    }
  }, [setSearchParams]);

  const updateCrossClubSearch = useCallback((athleteKey: 'athlete1Id' | 'athlete2Id', value: string) => {
    if (athleteKey === 'athlete1Id') setClub1Search(value);
    else setClub2Search(value);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete(athleteKey);
      return next;
    });
  }, [setSearchParams]);
  void updateParam;
  void updateCrossClubSearch;

  const club1Options = clubs
    .filter((club) => club.id !== club2Id || club.id === club1Id)
    .map((club) => ({ value: club.id, label: club.name }));
  const club2Options = clubs
    .filter((club) => club.id !== club1Id || club.id === club2Id)
    .map((club) => ({ value: club.id, label: club.name }));
  void club2Options;

  const athleteMode = mode === 'athlete-club' || mode === 'athlete-cross-club';
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
          <h1 className={styles.heading}>Compare 100m Performance</h1>
          <p className={styles.subtitle}>Compare athlete progression or all-time club performance.</p>
        </div>
      </div>

      <Card>
        <div className={styles.publicationPanel}>
          <div>
            <p className={styles.publicationEyebrow}>Public statistics</p>
            <h2>Share this club's 100m results</h2>
            <p>
              Publishing makes the club name, non-archived athlete names, and all-time 100m metrics visible on Athlora's public Stats page.
            </p>
          </div>
          <div className={styles.publicationAction}>
            {publicationLoading ? <p>Loading publication status...</p> : activeWorkspace.role === 'coach' ? (
              <Button onClick={togglePublication} disabled={publicationUpdating}>
                {publication?.publicResultsEnabled ? 'Stop publishing' : 'Publish results'}
              </Button>
            ) : <p>Only a coach can change this setting.</p>}
            {publication && <span className={publication.publicResultsEnabled ? styles.published : styles.unpublished}>
              {publication.publicResultsEnabled ? 'Public' : 'Private'}
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
          <div className={styles.selectorRow}>
            {Array.from({ length: Math.max(2, athleteIds.length, athleteSlotCount) }, (_, index) => <div className={styles.selector} key={index}>
              <label htmlFor={`athlete${index + 1}-select`}>Athlete {index + 1}</label>
              <Select id={`athlete${index + 1}-select`} value={athleteIds[index] ?? ''} onChange={(event) => { const next = [...athleteIds]; next[index] = event.target.value; updateSelection('athlete', next); }} disabled={athletesLoading} aria-label={`Select athlete ${index + 1} for comparison`} placeholder="Select athlete..." options={[{ value: '', label: 'Select athlete...' }, ...athletes.filter((athlete) => athlete.id === athleteIds[index] || !athleteIds.includes(athlete.id)).map((athlete) => ({ value: athlete.id, label: athlete.name }))]} />
              {athleteIds[index] && <Button onClick={() => { updateSelection('athlete', athleteIds.filter((_, position) => position !== index)); setAthleteSlotCount((count) => Math.max(2, count - 1)); }}>Remove athlete {index + 1}</Button>}
            </div>)}
          </div>
          {Math.max(athleteIds.length, athleteSlotCount) < MAX_COMPARISON_ITEMS && <Button onClick={() => setAthleteSlotCount((count) => count + 1)}>Add athlete</Button>}
        </Card>
      )}

      {mode === 'athlete-cross-club' && (
        <Card>
          <div className={styles.selectorRow}>
            {Array.from({ length: Math.max(2, athleteIds.length, athleteSlotCount) }, (_, index) => <CrossClubAthleteSelector key={index} index={index} clubId={clubIds[index] ?? ''} athleteId={athleteIds[index] ?? ''} clubs={clubs} selectedClubIds={clubIds} onClubChange={(value) => setSearchParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set(`club${index + 1}Id`, value); else next.delete(`club${index + 1}Id`); next.delete(`athlete${index + 1}Id`); return next; })} onAthleteChange={(value) => { const next = [...athleteIds]; next[index] = value; updateSelection('athlete', next); }} onRemove={() => removeCrossClubSelection(index)} />)}
          </div>
          {Math.max(athleteIds.length, athleteSlotCount) < MAX_COMPARISON_ITEMS && <Button onClick={() => setAthleteSlotCount((count) => count + 1)}>Add athlete</Button>}
        </Card>
      )}

      {mode === 'club-statistics' && (
        <Card>
          <div className={styles.singleSelector}>
            <label htmlFor="statistics-club-select">Club</label>
            <Select
              id="statistics-club-select"
              value={club1Id}
              onChange={(event) => updateClub('club1Id', event.target.value)}
              disabled={clubsLoading}
              aria-label="Select club for statistics"
              placeholder="Select club..."
              options={[{ value: '', label: 'Select club...' }, ...club1Options]}
            />
          </div>
        </Card>
      )}

      {mode === 'club-comparison' && (
        <Card>
          <div className={styles.selectorRow}>
            {Array.from({ length: Math.max(2, clubIds.length, clubSlotCount) }, (_, index) => <div className={styles.selector} key={index}>
              <label htmlFor={`club${index + 1}-select`}>{index === 0 ? 'First club' : index === 1 ? 'Second club' : `Club ${index + 1}`}</label>
              <Select id={`club${index + 1}-select`} value={clubIds[index] ?? ''} onChange={(event) => { const next = [...clubIds]; next[index] = event.target.value; updateSelection('club', next); }} disabled={clubsLoading} aria-label={`Select ${index === 0 ? 'first' : index === 1 ? 'second' : `${index + 1}th`} club for comparison`} placeholder="Select club..." options={[{ value: '', label: 'Select club...' }, ...clubs.filter((club) => club.id === clubIds[index] || !clubIds.includes(club.id)).map((club) => ({ value: club.id, label: club.name }))]} />
              {clubIds[index] && <Button onClick={() => { updateSelection('club', clubIds.filter((_, position) => position !== index)); setClubSlotCount((count) => Math.max(2, count - 1)); }}>Remove club {index + 1}</Button>}
            </div>)}
          </div>
          {Math.max(clubIds.length, clubSlotCount) < MAX_COMPARISON_ITEMS && <Button onClick={() => setClubSlotCount((count) => count + 1)}>Add club</Button>}
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
            {mode === 'athlete-club' && 'Select exactly two different athletes from your club.'}
            {mode === 'athlete-cross-club' && 'Select two different clubs, then search for one athlete from each club.'}
            {mode === 'club-statistics' && 'Select a club to view its all-time 100m performance.'}
            {mode === 'club-comparison' && 'Select exactly two different clubs to compare their all-time 100m performance.'}
          </p>
        </Card>
      )}

      {!loading && !error && athleteMode && selectionReady && comparison && (
        <>
          <Card>
            <div className={styles.metricsGrid} role="list" aria-label="Comparison metrics summary">
              {comparison.athletes.flatMap((athlete) => [
                <div key={`${athlete.athlete.id}-pb`} role="listitem"><MetricCard label={`${athlete.athlete.name} PB`} value={athlete.pb} /></div>,
                <div key={`${athlete.athlete.id}-latest`} role="listitem"><MetricCard label={`${athlete.athlete.name} latest`} value={athlete.latestEffectiveResult} /></div>,
              ])}
            </div>
          </Card>

          <Card>
            <div className={styles.viewToggle}>
              <Button onClick={() => setViewMode('chart')} aria-pressed={viewMode === 'chart'}>Chart</Button>
              <Button onClick={() => setViewMode('table')} aria-pressed={viewMode === 'table'}>Table</Button>
            </div>
            {viewMode === 'chart' ? <ComparisonChart comparison={comparison} /> : <ComparisonTable comparison={comparison} />}
          </Card>
        </>
      )}

      {!loading && !error && mode === 'club-statistics' && clubStatistics && (
        <>
          <Card>
            <div className={styles.metricsGrid} role="list" aria-label="Club statistics summary">
              <div role="listitem"><TextMetricCard label="Total roster" value={clubStatistics.roster.total} /></div>
              <div role="listitem"><TextMetricCard label="Active athletes" value={clubStatistics.roster.active} /></div>
              <div role="listitem"><MetricCard label="Fastest valid time" value={clubStatistics.fastestValidTime} /></div>
              <div role="listitem"><MetricCard label="Average valid time" value={clubStatistics.averageValidTime} /></div>
            </div>
          </Card>
          <Card><ClubStatisticsTable statistics={clubStatistics} /></Card>
        </>
      )}

      {!loading && !error && mode === 'club-comparison' && clubComparison && (
        <Card><ClubComparisonTable comparison={clubComparison} /></Card>
      )}
    </main>
  );
}
