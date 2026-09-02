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

interface ChartGeometry {
  points: Array<{ x: number; y: number; entry: ProgressionEntry; athleteIndex: number }>;
  yTickValues: number[];
  yMin: number;
  yRange: number;
  minTime: number;
  maxTime: number;
}

function buildComparisonChartGeometry(athletes: [ComparisonAthleteAggregate, ComparisonAthleteAggregate]): ChartGeometry | null {
  const allValid = athletes.flatMap((a, idx) =>
    a.progression
      .filter((e) => e.effectiveOutcome === 'valid' && e.effectiveResult !== null)
      .map((e) => ({ entry: e, athleteIndex: idx })),
  );
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

  const points = allValid.map((p) => ({
    x: xScale(new Date(p.entry.event.date).getTime()),
    y: yScale(p.entry.effectiveResult!),
    entry: p.entry,
    athleteIndex: p.athleteIndex,
  }));

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (i / yTicks) * yRange);

  return { points, yTickValues, yMin, yRange, minTime, maxTime };
}

function formatMetric(value: number | null, unit = 's'): string {
  if (value === null) return '—';
  return `${format100mSeconds(value)}${unit}`;
}

function MetricCard({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className={styles.metricCard}>
      <p className={styles.metricLabel}>{label}</p>
      {value !== null ? (
        <p className={styles.metricValue}>{formatMetric(value, unit)}</p>
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
  const geometry = useMemo(
    () => buildComparisonChartGeometry(comparison.athletes),
    [comparison],
  );

  if (!geometry) return null;

  const { points, yTickValues } = geometry;

  return (
    <div className={styles.chartWrap}>
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
              {format100mSeconds(y)}
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

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={p.athleteIndex === 0 ? 'var(--cyan-400)' : 'var(--blue-500)'}
            stroke="var(--white)"
            strokeWidth={1.5}
          >
            <title>{`${p.athleteIndex === 0 ? comparison.athletes[0].athlete.name : comparison.athletes[1].athlete.name}: ${format100mSeconds(p.entry.effectiveResult!)} on ${formatDateOnly(p.entry.event.date)}`}</title>
          </circle>
        ))}
      </svg>
      <div className={styles.legend} role="list" aria-label="Chart legend">
        <span className={styles.legendItem} role="listitem">
          <span className={`${styles.legendDot} ${styles.legendDotA}`} aria-hidden="true" />
          {comparison.athletes[0].athlete.name}
        </span>
        <span className={styles.legendItem} role="listitem">
          <span className={`${styles.legendDot} ${styles.legendDotB}`} aria-hidden="true" />
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
