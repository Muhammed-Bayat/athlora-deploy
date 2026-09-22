export const CHART_SERIES = [
  { color: 'var(--chart-series-1)', dashArray: undefined, label: 'Series 1' },
  { color: 'var(--chart-series-2)', dashArray: '9 5', label: 'Series 2' },
  { color: 'var(--chart-series-3)', dashArray: '3 4', label: 'Series 3' },
  { color: 'var(--chart-series-4)', dashArray: '12 4 3 4', label: 'Series 4' },
  { color: 'var(--chart-series-5)', dashArray: '2 3', label: 'Series 5' },
] as const;

export function chartSeriesById(ids: string[]): Map<string, (typeof CHART_SERIES)[number]> {
  return new Map(
    [...ids]
      .sort((left, right) => left.localeCompare(right))
      .map((id, index) => [id, CHART_SERIES[index % CHART_SERIES.length]]),
  );
}
