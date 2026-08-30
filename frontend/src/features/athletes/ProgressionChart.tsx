import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAthleteProgression } from '../../api/statistics';
import { Button, Card } from '../../components';
import type { ProgressionDetail, ProgressionEntry } from '../../types';
import { format100mSeconds, formatDateOnly } from '../../utils/formatting';
import styles from './ProgressionChart.module.css';

interface ProgressionChartProps {
  athleteId: string;
  athleteName: string;
}

type ViewMode = 'chart' | 'table';

const SVG_PADDING = { top: 28, right: 24, bottom: 48, left: 64 };
const SVG_WIDTH = 700;
const SVG_HEIGHT = 320;
const CHART_WIDTH = SVG_WIDTH - SVG_PADDING.left - SVG_PADDING.right;
const CHART_HEIGHT = SVG_HEIGHT - SVG_PADDING.top - SVG_PADDING.bottom;

function buildChartGeometry(entries: ProgressionEntry[]) {
  const validEntries = entries.filter(
    (entry) => entry.effectiveOutcome === 'valid' && entry.effectiveResult !== null,
  );
  if (validEntries.length === 0) return null;

  const times = validEntries.map((entry) => new Date(entry.event.date).getTime());
  const results = validEntries.map((entry) => entry.effectiveResult!);
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

  const points = validEntries.map((entry) => ({
    x: xScale(new Date(entry.event.date).getTime()),
    y: yScale(entry.effectiveResult!),
    entry,
  }));

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (i / yTicks) * yRange);

  return { points, yTickValues, yMin, yRange, minTime, maxTime, xScale, yScale };
}

function ProgressionRow({ entry }: { entry: ProgressionEntry }) {
  const { event, effectiveResult, effectiveOutcome, isNewPb } = entry;
  const isPb = isNewPb && effectiveResult !== null;

  return (
    <li className={styles.tableRow}>
      <div className={styles.tableCell}>
        <time dateTime={event.date}>{formatDateOnly(event.date)}</time>
        <strong>{event.title}</strong>
      </div>
      <div className={styles.tableCell}>
        {effectiveOutcome === 'valid' && effectiveResult !== null
          ? format100mSeconds(effectiveResult)
          : effectiveOutcome}
      </div>
      <div className={styles.tableCell}>
        {isPb ? <span className={styles.pbBadge}>PB</span> : '\u00A0'}
      </div>
    </li>
  );
}

export function ProgressionChart({ athleteId, athleteName }: ProgressionChartProps) {
  const [progression, setProgression] = useState<ProgressionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [retryCount, setRetryCount] = useState(0);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void getAthleteProgression(athleteId)
      .then((value) => {
        if (current) setProgression(value);
      })
      .catch((err: unknown) => {
        if (current) setError(err instanceof Error ? err.message : 'Failed to load progression');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [athleteId, retryCount]);

  const geometry = useMemo(
    () => (progression ? buildChartGeometry(progression.entries) : null),
    [progression],
  );

  const summaryLabel = useMemo(() => {
    if (!progression) return '';
    const { allTimePb, totalResults, totalValid } = progression.summary;
    const pb = allTimePb !== null ? format100mSeconds(allTimePb) : 'none';
    return `All-time PB: ${pb} \u00B7 ${totalValid} of ${totalResults} valid`;
  }, [progression]);

  const handleLoad = useCallback(() => {
    setRetryCount((n) => n + 1);
  }, []);

  if (loading) {
    return (
      <Card className={styles.card}>
        <p role="status">Loading all-time 100m progression\u2026</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={styles.card}>
        <div className={styles.error} role="alert">
          <strong>Progression unavailable</strong>
          <p>{error}</p>
          <Button onClick={handleLoad}>Retry</Button>
        </div>
      </Card>
    );
  }

  if (!progression || progression.entries.length === 0) {
    return (
      <Card className={styles.card}>
        <p className={styles.empty}>No 100m results recorded yet.</p>
      </Card>
    );
  }

  const viewToggleLabel = viewMode === 'chart' ? 'Show table' : 'Show chart';

  return (
    <Card className={styles.card}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Performance trend</p>
          <h2 className={styles.heading}>All-time 100m progression</h2>
        </div>
        <Button
          variant="secondary"
          onClick={() => setViewMode(viewMode === 'chart' ? 'table' : 'chart')}
        >
          {viewToggleLabel}
        </Button>
      </header>

      <div className={styles.summary}>{summaryLabel}</div>

      <div className={styles.paginationInfo}>
        {progression.pagination.total} result{progression.pagination.total !== 1 ? 's' : ''}
        {progression.pagination.nextCursor !== null && (
          <span className={styles.pageNote}>(showing latest {progression.pagination.count})</span>
        )}
      </div>

      <div ref={liveRegionRef} className="sr-only" aria-live="polite">
        {progression.summary.allTimePb !== null
          ? `All-time personal best: ${format100mSeconds(progression.summary.allTimePb)}`
          : 'No valid personal best recorded'}
      </div>

      {viewMode === 'chart' && geometry && (
        <div className={styles.chartWrap}>
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className={styles.svg}
            role="img"
            aria-label={`${athleteName} 100m progression chart`}
          >
            <title>{`${athleteName} 100m progression`}</title>
            <desc>Line chart of effective 100m results over time, with PB milestones highlighted</desc>

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

            {geometry.yTickValues.map((tick) => {
              const y = geometry.yScale(tick);
              return (
                <g key={`ytick-${tick}`}>
                  <line
                    x1={SVG_PADDING.left}
                    y1={y}
                    x2={SVG_WIDTH - SVG_PADDING.right}
                    y2={y}
                    stroke="var(--console-line)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={SVG_PADDING.left - 8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className={styles.axisLabel}
                  >
                    {tick.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {geometry.points.length > 1 && (
              <polyline
                points={geometry.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="var(--cyan-400)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {geometry.points.map((point) => {
              const isPb = point.entry.isNewPb && point.entry.effectiveResult !== null;
              const r = isPb ? 7 : 4.5;
              const fill = isPb ? 'var(--blue-500)' : 'var(--cyan-400)';
              const stroke = isPb ? 'var(--white)' : 'none';
              return (
                <circle
                  key={point.entry.event.id}
                  cx={point.x}
                  cy={point.y}
                  r={r}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isPb ? 2 : 0}
                >
                  <title>
                    {`${formatDateOnly(point.entry.event.date)} \u2014 ${point.entry.effectiveResult !== null ? format100mSeconds(point.entry.effectiveResult) : point.entry.effectiveOutcome}${isPb ? ' (PB)' : ''}`}
                  </title>
                </circle>
              );
            })}

            <text
              x={SVG_WIDTH / 2}
              y={SVG_HEIGHT - 6}
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
          </svg>
        </div>
      )}

      {viewMode === 'table' && (
        <ol className={styles.table}>
          {progression.entries.map((entry) => (
            <ProgressionRow
              key={entry.event.id}
              entry={entry}
            />
          ))}
        </ol>
      )}

      {viewMode === 'chart' && (
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendDot} aria-hidden="true" />
            Regular result
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendDotPb}`} aria-hidden="true" />
            PB milestone
          </span>
        </div>
      )}
    </Card>
  );
}
