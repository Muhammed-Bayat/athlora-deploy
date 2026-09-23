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
import { Button, Card, SeasonSelector, Select } from '../../components';
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
  ProgressionEntry,
} from '../../types';
import { format100mSeconds, formatDateOnly } from '../../utils/formatting';
import { chartSeriesById } from '../../utils/chartSeries';
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

function ComparisonChart({ comparison, season }: { comparison: MultiComparisonDetail; season: SeasonValue }) {
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  const geometry = useMemo(
    () => buildComparisonChartGeometry(comparison.athletes),
    [comparison],
  );
  const seriesByAthleteId = useMemo(
    () => chartSeriesById(comparison.athletes.map((athlete) => athlete.athlete.id)),
    [comparison.athletes],
  );

  if (!geometry) {
    return <p className={styles.empty}>None of the selected athletes has a valid 100m result to chart.</p>;
  }

  const { series, yTickValues } = geometry;

  return (
    <div className={styles.chartWrap}>
      <h2 className={styles.chartHeading}>
        {`${comparison.athletes.map((athlete) => athlete.athlete.name).join(' vs ')}: ${seasonLabel(season)} 100m Progression`}
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
                  data-series={seriesByAthleteId.get(comparison.athletes[athleteIndex].athlete.id)!.label}
                  data-series-color={seriesByAthleteId.get(comparison.athletes[athleteIndex].athlete.id)!.color}
                  points={athleteSeries.map((point) => `${point.x},${point.y}`).join(' ')}
                  className={styles.seriesLine}
                  style={{ stroke: seriesByAthleteId.get(comparison.athletes[athleteIndex].athlete.id)!.color, strokeDasharray: seriesByAthleteId.get(comparison.athletes[athleteIndex].athlete.id)!.dashArray }}
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
                style={{ fill: seriesByAthleteId.get(comparison.athletes[athleteIndex].athlete.id)!.color }}
                tabIndex={0}
                role="img"
                aria-label={`${seriesByAthleteId.get(comparison.athletes[athleteIndex].athlete.id)!.label}: ${comparison.athletes[athleteIndex].athlete.name}, ${format100mSeconds(point.entry.effectiveResult!)} on ${formatDateOnly(point.entry.event.date)}`}
                onPointerEnter={() => setHoveredPoint(point)}
                onPointerLeave={() => setHoveredPoint(null)}
                onFocus={() => setHoveredPoint(point)}
                onBlur={() => setHoveredPoint(null)}
              >
                  <title>{`${seriesByAthleteId.get(comparison.athletes[athleteIndex].athlete.id)!.label}: ${comparison.athletes[athleteIndex].athlete.name}, ${format100mSeconds(point.entry.effectiveResult!)} on ${formatDateOnly(point.entry.event.date)}`}</title>
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
            <text x="10" y="14" className={styles.tooltipText}>{`${seriesByAthleteId.get(comparison.athletes[hoveredPoint.athleteIndex].athlete.id)!.label}: ${comparison.athletes[hoveredPoint.athleteIndex].athlete.name}`}</text>
            <text x="10" y="28" className={styles.tooltipValue}>
              {`${formatDateOnly(hoveredPoint.entry.event.date)} - ${format100mSeconds(hoveredPoint.entry.effectiveResult!)}`}
            </text>
          </g>
        )}
      </svg>
      <div className={styles.legend} role="list" aria-label="Chart legend">
        {comparison.athletes.map((athlete) => <span key={athlete.athlete.id} className={styles.legendItem} role="listitem">
          <svg className={styles.legendLine} viewBox="0 0 24 6" aria-hidden="true"><line x1="0" y1="3" x2="24" y2="3" style={{ stroke: seriesByAthleteId.get(athlete.athlete.id)!.color, strokeDasharray: seriesByAthleteId.get(athlete.athlete.id)!.dashArray }} /></svg>
          {`${athlete.athlete.name} (${seriesByAthleteId.get(athlete.athlete.id)!.label})`}
        </span>)}
      </div>
    </div>
  );
}

function ClubStatisticsTable({ statistics, season }: { statistics: ClubStatistics; season: SeasonValue }) {
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
    <table className={styles.comparisonTable} aria-label={`${statistics.club.name} ${seasonLabel(season).toLowerCase()} 100m statistics`}>
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

function ClubComparisonTable({ comparison, season }: { comparison: ClubMultiComparisonDetail; season: SeasonValue }) {
  const rows: Array<{ label: string; value: (club: ClubStatistics) => string }> = [
    { label: 'Total roster', value: (club) => String(club.roster.total) }, { label: 'Active athletes', value: (club) => String(club.roster.active) },
    { label: 'Athletes with valid results', value: (club) => String(club.distinctAthletesWithValidResults) }, { label: 'Valid 100m results', value: (club) => String(club.valid100mResultCount) },
    { label: 'Fastest valid time', value: (club) => formatMetric(club.fastestValidTime) }, { label: 'Latest valid time', value: (club) => formatMetric(club.latestValidTime) },
    { label: 'Average valid time', value: (club) => formatMetric(club.averageValidTime) }, { label: 'Median valid time', value: (club) => formatMetric(club.medianValidTime) },
    { label: 'Consistency (SD)', value: (club) => formatMetric(club.populationStandardDeviation) },
  ];

  return (
    <table className={styles.comparisonTable} aria-label={`${seasonLabel(season)} club comparison metrics`}>
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

function athleteSearchMessage(search: string, loading: boolean): string {
  if (loading) return 'Searching athletes...';
  if (search.trim().length < 2) return 'Type at least two characters to search';
  return 'No athletes match this search';
}

function CrossClubAthleteAdder({ clubs, selectedAthleteIds, onAthleteChange }: { clubs: Club[]; selectedAthleteIds: string[]; onAthleteChange: (athlete: ClubAthleteLookup & { clubId: string; clubName: string }) => void }) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [athletes, setAthletes] = useState<Array<ClubAthleteLookup & { clubId: string; clubName: string }>>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (deferredSearch.trim().length < 2) { setAthletes([]); return; }
    const controller = new AbortController();
    setLoading(true);
    void Promise.all(clubs.map((club) => listClubComparisonAthletes(club.id, deferredSearch, controller.signal)
      .then((result) => result.data.map((athlete) => ({ ...athlete, clubId: club.id, clubName: club.name })))))
      .then((result) => { if (!controller.signal.aborted) setAthletes(result.flat()); })
      .catch(() => { if (!controller.signal.aborted) setAthletes([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [clubs.map((club) => club.id).join(','), deferredSearch]);
  const athleteLabel = 'Search athletes from selected clubs';
  return <div className={styles.selector}>
    <label htmlFor="cross-athlete-add-select">Add athletes from selected clubs (up to 5)</label>
    <Select id="cross-athlete-add-select" value="" onChange={(event) => { const athlete = athletes.find((candidate) => candidate.id === event.target.value); if (athlete) { setSearch(''); onAthleteChange(athlete); } }} searchable searchPlaceholder={athleteLabel} emptyMessage={athleteSearchMessage(search, loading)} aria-label={athleteLabel} placeholder="Search selected club rosters..." options={athletes.filter((athlete) => !selectedAthleteIds.includes(athlete.id)).map((athlete) => ({ value: athlete.id, label: `${athlete.name} - ${athlete.clubName}` }))} onSearchChange={setSearch} />
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

  useEffect(() => {
    let current = true;
    setAthletesLoading(true);
    void (seasonQueryValue(season) ? listAthletes({ year: season }) : listAthletes())
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
  const club2Options = clubs
    .filter((club) => club.id !== club1Id || club.id === club2Id)
    .map((club) => ({ value: club.id, label: club.name }));
  void club2Options;

  const athleteMode = mode === 'athlete-club' || mode === 'athlete-cross-club';
  const selectedCrossClubs = clubs.filter((club) => clubIds.includes(club.id));
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
          <p className={styles.subtitle}>Compare athlete progression or club performance for {seasonLabel(season)}.</p>
        </div>
        <SeasonSelector value={season} onChange={(nextSeason: SeasonValue) => setSearchParams((previous) => { const next = new URLSearchParams(previous); const value = seasonQueryValue(nextSeason); if (value) next.set('year', value); else next.delete('year'); return next; })} />
      </div>

      <Card>
        <div className={styles.publicationPanel}>
          <div>
            <p className={styles.publicationEyebrow}>Public statistics</p>
            <h2>Share this club's 100m results</h2>
            <p>
              Publishing makes the club name, non-archived athlete names, and all-time 100m metrics (personal bests, leaderboards, detailed reports) visible on Athlora's public Stats page.
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
            <div className={styles.selector}>
              <label htmlFor="athlete-add-select">Add athletes (up to 5)</label>
              <Select id="athlete-add-select" value="" onChange={(event) => { if (event.target.value) updateSelection('athlete', [...athleteIds, event.target.value]); }} disabled={athletesLoading || athleteIds.length === MAX_COMPARISON_ITEMS} aria-label="Add athlete to comparison" placeholder="Add an athlete..." options={[{ value: '', label: athleteIds.length === MAX_COMPARISON_ITEMS ? 'Maximum athletes selected' : 'Add an athlete...' }, ...athletes.filter((athlete) => !athleteIds.includes(athlete.id)).map((athlete) => ({ value: athlete.id, label: athlete.name }))]} />
            </div>
            {athleteIds.length > 0 && <ul className={styles.selectionChips} aria-label="Selected athletes">{athleteIds.map((athleteId, index) => { const athlete = athletes.find((candidate) => candidate.id === athleteId); return <li key={`${athleteId}-${index}`}>{athlete?.name ?? 'Selected athlete'}<button type="button" aria-label={`Remove ${athlete?.name ?? 'athlete'}`} onClick={() => updateSelection('athlete', athleteIds.filter((id) => id !== athleteId))}>×</button></li>; })}</ul>}
          </div>
        </Card>
      )}

      {mode === 'athlete-cross-club' && (
        <Card>
          <div className={styles.selectionEditor}>
            <div className={styles.selector}>
              <label htmlFor="cross-club-add-select">Add clubs (up to 5)</label>
              <Select id="cross-club-add-select" value="" onChange={(event) => { if (event.target.value) updateSelection('club', [...clubIds, event.target.value]); }} disabled={clubsLoading || clubIds.length === MAX_COMPARISON_ITEMS} aria-label="Add club for athlete comparison" placeholder="Add a club..." options={[{ value: '', label: clubIds.length === MAX_COMPARISON_ITEMS ? 'Maximum clubs selected' : 'Add a club...' }, ...clubs.filter((club) => !clubIds.includes(club.id)).map((club) => ({ value: club.id, label: club.name }))]} />
            </div>
            {clubIds.length > 0 && <ul className={styles.selectionChips} aria-label="Selected comparison clubs">{clubIds.map((clubId, index) => { const club = clubs.find((candidate) => candidate.id === clubId); return <li key={`${clubId}-${index}`}>{club?.name ?? 'Selected club'}<button type="button" aria-label={`Remove ${club?.name ?? 'club'}`} onClick={() => removeCrossClub(clubId)}>×</button></li>; })}</ul>}
            {selectedCrossClubs.length > 0 && athleteIds.length < MAX_COMPARISON_ITEMS && <CrossClubAthleteAdder key={athleteIds.join(',')} clubs={selectedCrossClubs} selectedAthleteIds={athleteIds} onAthleteChange={(athlete) => { setCrossAthletes((current) => ({ ...current, [athlete.id]: { name: athlete.name, clubId: athlete.clubId, clubName: athlete.clubName } })); updateSelection('athlete', [...athleteIds, athlete.id]); }} />}
            {athleteIds.length > 0 && <ul className={styles.selectionChips} aria-label="Selected comparison athletes">{athleteIds.map((athleteId, index) => { const selectedAthlete = crossAthletes[athleteId]; const athleteName = comparison?.athletes.find((athlete) => athlete.athlete.id === athleteId)?.athlete.name ?? selectedAthlete?.name ?? 'Selected athlete'; return <li key={`${athleteId}-${index}`}>{selectedAthlete?.clubName && `${selectedAthlete.clubName}: `}{athleteName}<button type="button" aria-label={`Remove ${athleteName}`} onClick={() => removeCrossAthlete(athleteId)}>×</button></li>; })}</ul>}
          </div>
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
          <div className={styles.selectionEditor}>
            <div className={styles.selector}>
              <label htmlFor="club-add-select">Add clubs (up to 5)</label>
              <Select id="club-add-select" value="" onChange={(event) => { if (event.target.value) updateSelection('club', [...clubIds, event.target.value]); }} disabled={clubsLoading || clubIds.length === MAX_COMPARISON_ITEMS} aria-label="Add club to comparison" placeholder="Add a club..." options={[{ value: '', label: clubIds.length === MAX_COMPARISON_ITEMS ? 'Maximum clubs selected' : 'Add a club...' }, ...clubs.filter((club) => !clubIds.includes(club.id)).map((club) => ({ value: club.id, label: club.name }))]} />
            </div>
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
            {mode === 'athlete-club' && 'Select exactly two different athletes from your club.'}
            {mode === 'athlete-cross-club' && 'Select at least two clubs, then add two to five athletes across them.'}
            {mode === 'club-statistics' && `Select a club to view its ${seasonLabel(season).toLowerCase()} 100m performance.`}
            {mode === 'club-comparison' && `Select exactly two different clubs to compare their ${seasonLabel(season).toLowerCase()} 100m performance.`}
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
            {viewMode === 'chart' ? <ComparisonChart comparison={comparison} season={season} /> : <ComparisonTable comparison={comparison} />}
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
          <Card><ClubStatisticsTable statistics={clubStatistics} season={season} /></Card>
        </>
      )}

      {!loading && !error && mode === 'club-comparison' && clubComparison && (
        <Card><ClubComparisonTable comparison={clubComparison} season={season} /></Card>
      )}
    </main>
  );
}
