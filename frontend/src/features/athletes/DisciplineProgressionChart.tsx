import { useEffect, useMemo, useState } from 'react';
import { getAthleteDisciplineProgression, type DisciplineProgressionDetail } from '../../api/statistics';
import type { DisciplineDefinition } from '../../types/meets';
import { seasonQueryValue, type SeasonValue } from '../../utils/season';
import styles from './DisciplineProgressionChart.module.css';

interface DisciplineProgressionChartProps {
  athleteId: string;
  disciplineDefinitionId: string;
  disciplineLabel: string;
  direction: DisciplineDefinition['direction'];
  unit: DisciplineDefinition['unit'];
  precision: number;
  season: SeasonValue;
}

const WIDTH = 720;
const HEIGHT = 220;
const PADDING = { top: 20, right: 20, bottom: 32, left: 56 };

function formatValue(value: number, precision: number, unit: DisciplineDefinition['unit']): string {
  return `${value.toFixed(precision)} ${unit === 'seconds' ? 's' : unit === 'metres' ? 'm' : 'cm'}`;
}

export function DisciplineProgressionChart({ athleteId, disciplineDefinitionId, disciplineLabel, direction, unit, precision, season }: DisciplineProgressionChartProps) {
  const [progression, setProgression] = useState<DisciplineProgressionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void getAthleteDisciplineProgression(athleteId, disciplineDefinitionId, seasonQueryValue(season) ?? 'all')
      .then((value) => { if (current) setProgression(value); })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'Could not load progression'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [athleteId, disciplineDefinitionId, season]);

  const geometry = useMemo(() => {
    const entries = progression?.entries ?? [];
    if (entries.length === 0) return null;
    const times = entries.map((entry) => new Date(entry.eventDate).getTime());
    const values = entries.map((entry) => entry.value);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valuePadding = Math.max((maxValue - minValue) * 0.12, unit === 'seconds' ? 0.08 : 0.2);
    const valueRange = Math.max(maxValue - minValue + valuePadding * 2, 0.01);
    const timeRange = Math.max(maxTime - minTime, 1);
    const chartWidth = WIDTH - PADDING.left - PADDING.right;
    const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const y = (value: number) => {
      const normalized = (value - (minValue - valuePadding)) / valueRange;
      return PADDING.top + (direction === 'lower' ? normalized : 1 - normalized) * chartHeight;
    };
    return { points: entries.map((entry) => ({ entry, x: PADDING.left + ((new Date(entry.eventDate).getTime() - minTime) / timeRange) * chartWidth, y: y(entry.value) })), y, minValue, maxValue, valuePadding };
  }, [direction, progression, unit]);

  if (loading) return <p className={styles.status} role="status">Loading {disciplineLabel} progression...</p>;
  if (error) return <p className={styles.error} role="alert">Progression unavailable: {error}</p>;
  if (!geometry || !progression) return <p className={styles.empty}>No finalized {disciplineLabel} results yet.</p>;

  const ticks = Array.from({ length: 5 }, (_, index) => geometry.minValue - geometry.valuePadding + (index / 4) * (geometry.maxValue - geometry.minValue + geometry.valuePadding * 2));
  return <section className={styles.chart} aria-label={`${disciplineLabel} performance progression`}>
    <div className={styles.chartHeader}><h3>Performance progression</h3><span>{progression.summary.resultCount} finalized result{progression.summary.resultCount === 1 ? '' : 's'}</span></div>
    <svg className={styles.svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${disciplineLabel} performance graph`}>
      {ticks.map((tick) => <g key={tick}><line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={geometry.y(tick)} y2={geometry.y(tick)} className={styles.grid} /><text x={PADDING.left - 8} y={geometry.y(tick)} textAnchor="end" dominantBaseline="middle" className={styles.axis}>{tick.toFixed(precision)}</text></g>)}
      <polyline points={geometry.points.map((point) => `${point.x},${point.y}`).join(' ')} className={styles.line} />
      {geometry.points.map(({ entry, x, y }) => <g key={entry.eventId}><circle cx={x} cy={y} r={entry.isNewPb ? 5.5 : 4} className={entry.isNewPb ? styles.pbPoint : styles.point}><title>{`${entry.eventTitle}, ${entry.eventDate}: ${formatValue(entry.value, precision, unit)}${entry.isNewPb ? ' (PB)' : ''}`}</title></circle></g>)}
      <text x={WIDTH / 2} y={HEIGHT - 6} textAnchor="middle" className={styles.axis}>Date</text>
    </svg>
  </section>;
}
