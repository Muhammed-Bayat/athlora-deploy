import type { DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';

export type SeasonYear = number | 'all';

export interface SeasonScope {
  selected: SeasonYear;
  startDate: string | null;
  endDate: string | null;
}

export function currentUtcYear(now = new Date()): number {
  return now.getUTCFullYear();
}

export function parseSeasonYear(value: unknown, now = new Date()): SeasonScope {
  const selected = value === undefined ? String(currentUtcYear(now)) : value;
  if (selected === 'all') return { selected, startDate: null, endDate: null };
  if (typeof selected !== 'string' || !/^[1-9][0-9]{3}$/.test(selected)) {
    throw new ApiError(422, 'SEASON_YEAR_INVALID', 'year must be all or a four-digit Gregorian year');
  }
  const year = Number(selected);
  return { selected: year, startDate: `${year}-01-01`, endDate: `${year + 1}-01-01` };
}

export function seasonSql(scope: SeasonScope, column: string, parameters: unknown[]): string {
  if (scope.selected === 'all') return '';
  const start = parameters.push(scope.startDate!);
  const end = parameters.push(scope.endDate!);
  return ` AND ${column} >= $${start}::date AND ${column} < $${end}::date`;
}

export async function listAvailableSeasons(
  executor: DbExecutor,
  workspaceId: string,
  now = new Date(),
): Promise<number[]> {
  const result = await executor.query<{ year: number | string }>(
    `SELECT DISTINCT EXTRACT(YEAR FROM e.date)::integer AS year
     FROM events e
     WHERE e.workspace_id = $1
        OR EXISTS (
          SELECT 1 FROM results r JOIN athletes a ON a.id = r.athlete_id
          WHERE r.event_id = e.id AND a.workspace_id = $1
        )
     UNION
     SELECT $2::integer
     ORDER BY year DESC`,
    [workspaceId, currentUtcYear(now)],
  );
  return result.rows.map((row) => Number(row.year));
}

export function seasonMetadata(scope: SeasonScope, available: number[] = []): SeasonScope & { available: number[] } {
  return { ...scope, available };
}
