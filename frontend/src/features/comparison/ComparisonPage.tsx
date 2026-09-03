import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getTwoAthleteComparison } from '../../api/comparison';
import { listAthletes } from '../../api/athletes';
import { Button, Card, Select } from '../../components';
import type { Athlete, ComparisonDetail, ComparisonAthleteAggregate, ProgressionEntry } from '../../types';
import { format100mSeconds, formatDateOnly } from '../../utils/formatting';
import styles from './ComparisonPage.module.css';

const SVG_PADDING = { top: 28, right: 24, bottom: 48, left: 64 };
const SVG_WIDTH = 700;
const SVG_HEIGHT = 320;
const CHART_WIDTH = SVG_WIDTH - SVG_PADDING.left - SVG_PADDING.right;
const CHART_HEIGHT = SVG_HEIGHT - SVG_PADDING.top - SVG_PADDING.bottom;

type ViewMode = 'chart' | 'table';
type ChartPoint = { x: number; y: number; entry: ProgressionEntry; athleteIndex: number };

interface ChartGeometry {
  series: ChartPoint[][];
  yTickValues: number[];
  yMin: number;
  yRange: number;
  minTime: number;
  maxTime: number;
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

function buildComparisonChartGeometry(athletes: [ComparisonAthleteAggregate, ComparisonAthleteAggregate]): ChartGeometry | null {
  const series = athletes.map((a, athleteIndex) =>
    a.progression
      .filter((e) => e.effectiveOutcome === 'valid' && e.effectiveResult !== null)
      .map((e) => ({ entry: e, athleteIndex })),
  );
  const allValid = series.flat();
  if (allValid.length === 0) return null;

  const times = allValid.map((p) => new Date(p.entry.event.date).getTime());
  const results = allValid.map((p) => p.entry.effectiveResult!);
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

  const scaledSeries = series.map((athleteSeries) => athleteSeries.map((p) => ({
    x: xScale(new Date(p.entry.event.date).getTime()),
    y: yScale(p.entry.effectiveResult!),
    entry: p.entry,
    athleteIndex: p.athleteIndex,
  })));

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (i / yTicks) * yRange);

  return { series: scaledSeries, yTickValues, yMin, yRange, minTime, maxTime };
}

function formatMetric(value: number | null): string {
  if (value === null) return '—';
  return format100mSeconds(value);
}

function MetricCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      {value !== null ? (
        <p className={styles.metricValue}>{formatMetric(value)}</p>
      ) : (
        <p className={`${styles.metricValue} ${styles.metricEmpty}`}>—</p>
      )}
    </div>
  );
}

function ComparisonTable({ comparison }: { comparison: ComparisonDetail }) {
  const [a, b] = comparison.athletes;
  const rows: Array<{ label: string; a: string; b: string }> = [
    { label: 'PB', a: formatMetric(a.pb), b: formatMetric(b.pb) },
    { label: 'Latest effective result', a: formatMetric(a.latestEffectiveResult), b: formatMetric(b.latestEffectiveResult) },
    { label: 'Valid result count', a: String(a.validResultCount), b: String(b.validResultCount) },
    { label: 'Average', a: formatMetric(a.average), b: formatMetric(b.average) },
    { label: 'Consistency (SD)', a: formatMetric(a.consistency), b: formatMetric(b.consistency) },
    { label: 'Improvement', a: formatMetric(a.improvement), b: formatMetric(b.improvement) },
  ];

  return (
    <table className={styles.comparisonTable} role="table" aria-label="Two-athlete comparison metrics">
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">{a.athlete.name}</th>
          <th scope="col">{b.athlete.name}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.a}</td>
            <td>{row.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ComparisonChart({ comparison }: { comparison: ComparisonDetail }) {
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  const geometry = useMemo(
    () => buildComparisonChartGeometry(comparison.athletes),
    [comparison],
  );

  if (!geometry) return null;

  const { series, yTickValues } = geometry;

  return (
    <div className={styles.chartWrap}>
      <h2 className={styles.chartHeading}>
        {`${comparison.athletes[0].athlete.name} vs ${comparison.athletes[1].athlete.name}: 100m Progression`}
      </h2>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label={`Two-athlete 100m progression chart comparing ${comparison.athletes[0].athlete.name} and ${comparison.athletes[1].athlete.name}`}
      >
        <title>{`100m progression comparison: ${comparison.athletes[0].athlete.name} vs ${comparison.athletes[1].athlete.name}`}</title>
        <desc>
          {`Chronological progression of valid 100m results for ${comparison.athletes[0].athlete.name} and ${comparison.athletes[1].athlete.name}`}
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

        {yTickValues.map((y) => (
          <g key={y}>
            <line
              x1={SVG_PADDING.left}
              y1={SVG_PADDING.top + ((y - geometry.yMin) / geometry.yRange) * CHART_HEIGHT}
              x2={SVG_PADDING.left + CHART_WIDTH}
              y2={SVG_PADDING.top + ((y - geometry.yMin) / geometry.yRange) * CHART_HEIGHT}
              stroke="var(--console-line)"
              strokeDasharray="4 4"
            />
            <text
              x={SVG_PADDING.left - 8}
              y={SVG_PADDING.top + ((y - geometry.yMin) / geometry.yRange) * CHART_HEIGHT + 4}
              textAnchor="end"
              className={styles.axisLabel}
            >
              {y.toFixed(2)}
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
                  points={athleteSeries.map((point) => `${point.x},${point.y}`).join(' ')}
                  className={athleteIndex === 0 ? styles.seriesLineA : styles.seriesLineB}
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
                className={athleteIndex === 0 ? styles.seriesPointA : styles.seriesPointB}
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
              {`${formatDateOnly(hoveredPoint.entry.event.date)} · ${format100mSeconds(hoveredPoint.entry.effectiveResult!)}`}
            </text>
          </g>
        )}
      </svg>
      <div className={styles.legend} role="list" aria-label="Chart legend">
        <span className={styles.legendItem} role="listitem">
          <span className={`${styles.legendLine} ${styles.legendLineA}`} aria-hidden="true" />
          {comparison.athletes[0].athlete.name}
        </span>
        <span className={styles.legendItem} role="listitem">
          <span className={`${styles.legendLine} ${styles.legendLineB}`} aria-hidden="true" />
          {comparison.athletes[1].athlete.name}
        </span>
      </div>
    </div>
  );
}

export function ComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athletesLoading, setAthletesLoading] = useState(true);
  const [comparison, setComparison] = useState<ComparisonDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const athlete1Id = searchParams.get('athlete1Id') ?? '';
  const athlete2Id = searchParams.get('athlete2Id') ?? '';

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
    if (!athlete1Id || !athlete2Id || athlete1Id === athlete2Id) {
      setComparison(null);
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    setError(null);
    void getTwoAthleteComparison(athlete1Id, athlete2Id)
      .then((value) => {
        if (current) setComparison(value);
      })
      .catch((err: unknown) => {
        if (current) {
          setError(err instanceof Error ? err.message : 'Failed to load comparison');
          setComparison(null);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [athlete1Id, athlete2Id]);

  const updateParam = useCallback((key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, [setSearchParams]);

  const isValidSelection = athlete1Id && athlete2Id && athlete1Id !== athlete2Id;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Two-Athlete 100m Comparison</h1>
      </div>

      <Card>
        <div className={styles.selectorRow}>
          <div className={styles.selector}>
            <label htmlFor="athlete1-select">Athlete 1</label>
            <Select
              id="athlete1-select"
              value={athlete1Id}
              onChange={(e) => updateParam('athlete1Id', e.target.value)}
              disabled={athletesLoading}
              aria-label="Select first athlete for comparison"
              options={[
                { value: '', label: 'Select athlete…' },
                ...athletes.map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </div>
          <div className={styles.selector}>
            <label htmlFor="athlete2-select">Athlete 2</label>
            <Select
              id="athlete2-select"
              value={athlete2Id}
              onChange={(e) => updateParam('athlete2Id', e.target.value)}
              disabled={athletesLoading}
              aria-label="Select second athlete for comparison"
              options={[
                { value: '', label: 'Select athlete…' },
                ...athletes.map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </div>
        </div>
      </Card>

      <div ref={liveRegionRef} aria-live="polite" className="sr-only">
        {loading ? 'Loading comparison data…' : ''}
      </div>

      {loading && (
        <Card>
          <p role="status">Loading two-athlete comparison…</p>
        </Card>
      )}

      {error && (
        <Card>
          <div className={styles.error} role="alert">
            <strong>Comparison unavailable</strong>
            <p>{error}</p>
          </div>
        </Card>
      )}

      {!loading && !error && !isValidSelection && (
        <Card>
          <p className={styles.empty}>Select exactly two different athletes to compare their all-time 100m progression.</p>
        </Card>
      )}

      {!loading && !error && isValidSelection && comparison && (
        <>
          <Card>
            <div className={styles.metricsGrid} role="list" aria-label="Comparison metrics summary">
              <div role="listitem">
                <MetricCard label={`${comparison.athletes[0].athlete.name} PB`} value={comparison.athletes[0].pb} />
              </div>
              <div role="listitem">
                <MetricCard label={`${comparison.athletes[1].athlete.name} PB`} value={comparison.athletes[1].pb} />
              </div>
              <div role="listitem">
                <MetricCard label={`${comparison.athletes[0].athlete.name} latest`} value={comparison.athletes[0].latestEffectiveResult} />
              </div>
              <div role="listitem">
                <MetricCard label={`${comparison.athletes[1].athlete.name} latest`} value={comparison.athletes[1].latestEffectiveResult} />
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <Button
                onClick={() => setViewMode('chart')}
                aria-pressed={viewMode === 'chart'}
              >
                Chart
              </Button>
              <Button
                onClick={() => setViewMode('table')}
                aria-pressed={viewMode === 'table'}
              >
                Table
              </Button>
            </div>
            {viewMode === 'chart' ? (
              <ComparisonChart comparison={comparison} />
            ) : (
              <ComparisonTable comparison={comparison} />
            )}
          </Card>
        </>
      )}
    </main>
  );
}
