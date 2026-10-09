import type { CoachPerformanceAnalysis, CoachPerformanceDisciplineAnalysis } from '../../api/analytics';
import { chartSeriesById } from '../../utils/chartSeries';
import styles from './CoachPerformanceComparisonChart.module.css';

interface ChartRow {
  athlete: CoachPerformanceAnalysis['athletes'][number]['athlete'];
  analysis: CoachPerformanceDisciplineAnalysis | undefined;
}

function formatValue(value: number, analysis: CoachPerformanceDisciplineAnalysis): string {
  const unit = analysis.discipline.unit === 'seconds' ? 's' : analysis.discipline.unit === 'metres' ? 'm' : 'cm';
  return `${value.toFixed(analysis.discipline.precision)} ${unit}`;
}

function dateTimestamp(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime();
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

/** Renders one discipline only so every series shares an honest raw-value axis. */
export function CoachPerformanceComparisonChart({
  analysis,
  disciplineCode,
}: {
  analysis: CoachPerformanceAnalysis;
  disciplineCode: string;
}) {
  const rows: ChartRow[] = analysis.athletes.map((entry) => ({
    athlete: entry.athlete,
    analysis: entry.disciplines.find((discipline) => discipline.discipline.code === disciplineCode),
  }));
  const chartAnalysis = rows.find((row) => row.analysis)?.analysis;
  const points = rows.flatMap(({ athlete, analysis: athleteAnalysis }) => (athleteAnalysis?.history ?? [])
    .filter((point) => Number.isFinite(point.value))
    .map((point) => ({ athlete, point })));
  if (!chartAnalysis || points.length === 0) {
    return <p className={styles.empty}>No recorded {disciplineCode} performances are available for this comparison chart.</p>;
  }

  const values = points.map(({ point }) => point.value);
  const dates = points.map(({ point }) => dateTimestamp(point.date));
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const minimumPadding = chartAnalysis.discipline.unit === 'seconds' ? 0.05 : chartAnalysis.discipline.unit === 'metres' ? 0.1 : 5;
  const padding = Math.max((maxValue - minValue) * 0.12, minimumPadding);
  const paddedMin = Math.max(0, minValue - padding);
  const range = Math.max(maxValue - paddedMin + padding, Number.EPSILON);
  const series = chartSeriesById(rows.map(({ athlete }) => athlete.id));
  const left = 58;
  const right = 684;
  const top = 26;
  const bottom = 244;
  const x = (date: string) => left + (dateTimestamp(date) - minDate) / Math.max(maxDate - minDate, 1) * (right - left);
  const y = (value: number) => {
    const ratio = (value - paddedMin) / range;
    return chartAnalysis.discipline.direction === 'lower' ? top + ratio * (bottom - top) : bottom - ratio * (bottom - top);
  };
  const ticks = Array.from({ length: 5 }, (_, index) => paddedMin + index / 4 * range);
  const xLabels = [minDate, minDate + (maxDate - minDate) / 2, maxDate]
    .map((timestamp) => dateLabel(new Date(timestamp).toISOString().slice(0, 10)));
  const yLabel = chartAnalysis.discipline.unit === 'seconds'
    ? 'Time (s)'
    : `Performance (${chartAnalysis.discipline.unit === 'metres' ? 'm' : 'cm'})`;

  return (
    <figure className={styles.chart} data-testid="coach-performance-comparison-chart">
      <figcaption>
        <strong>{chartAnalysis.discipline.label} comparison</strong>
        <span>{chartAnalysis.discipline.direction === 'lower' ? 'Lower values are better' : 'Higher values are better'}. Values remain raw {chartAnalysis.discipline.unit} measurements.</span>
      </figcaption>
      <svg viewBox="0 0 720 282" role="img" aria-label={`${chartAnalysis.discipline.label} performance comparison chart`}>
        {ticks.map((tick, index) => <g key={`tick-${index}`}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className={styles.grid} />
          <text x={left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className={styles.axisLabel}>{tick.toFixed(chartAnalysis.discipline.precision)}</text>
        </g>)}
        <line x1={left} x2={right} y1={bottom} y2={bottom} className={styles.axis} />
        <line x1={left} x2={left} y1={top} y2={bottom} className={styles.axis} />
        {rows.map(({ athlete, analysis: athleteAnalysis }) => {
          const style = series.get(athlete.id)!;
          const history = athleteAnalysis?.history ?? [];
          return <g key={athlete.id}>
            {history.length > 1 && <polyline points={history.map((point) => `${x(point.date)},${y(point.value)}`).join(' ')} className={styles.seriesLine} style={{ stroke: style.color, strokeDasharray: style.dashArray }} />}
            {history.map((point, index) => <circle key={`${point.event.id}-${point.date}-${index}`} cx={x(point.date)} cy={y(point.value)} r="3.75" className={styles.seriesPoint} style={{ fill: style.color }}>
              <title>{`${athlete.name}: ${formatValue(point.value, athleteAnalysis!)} on ${point.date} at ${point.event.title}`}</title>
            </circle>)}
          </g>;
        })}
        {xLabels.map((label, index) => <text key={`${label}-${index}`} x={[left, (left + right) / 2, right][index]} y="261" textAnchor={index === 0 ? 'start' : index === 2 ? 'end' : 'middle'} className={styles.axisLabel}>{label}</text>)}
        <text x={(left + right) / 2} y="279" textAnchor="middle" className={styles.axisTitle}>Performance date</text>
        <text x="14" y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(top + bottom) / 2})`} className={styles.axisTitle}>{yLabel}</text>
      </svg>
      <div className={styles.legend} role="list" aria-label="Performance comparison legend">
        {rows.map(({ athlete, analysis: athleteAnalysis }) => {
          const style = series.get(athlete.id)!;
          return <span key={athlete.id} className={styles.legendItem} role="listitem"><i style={{ backgroundColor: style.color }} />{athlete.name}{athleteAnalysis?.history.length ? '' : ' (no recorded results)'}</span>;
        })}
      </div>
    </figure>
  );
}
