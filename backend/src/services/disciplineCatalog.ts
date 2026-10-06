import type { DbExecutor } from '../db/client.js';
import type { PublicDiscipline } from '../types/domain.js';

// The immutable catalogue retains retired definitions for historical foreign keys,
// while current Athlora surfaces expose only this supported set.
export const SUPPORTED_DISCIPLINE_CODES = [
  '100m', '200m', '400m', '800m', '1500m', '100mh', '110mh', '400mh',
  '4x100m', 'high_jump', 'long_jump', 'triple_jump', 'javelin', 'discus', 'shot_put',
] as const;

export const SUPPORTED_DISCIPLINE_SQL_LIST = SUPPORTED_DISCIPLINE_CODES.map((code) => `'${code}'`).join(', ');

export function isSupportedDiscipline(code: string): boolean {
  return (SUPPORTED_DISCIPLINE_CODES as readonly string[]).includes(code);
}

export async function listAvailableDisciplines(executor: DbExecutor): Promise<PublicDiscipline[]> {
  const result = await executor.query<{
    code: string; label: string; unit: PublicDiscipline['unit']; precision: number | string; direction: PublicDiscipline['direction'];
  }>(`SELECT code, presentation->>'label' AS label, unit, precision, direction
      FROM discipline_definitions
      WHERE code = ANY($1::text[])
      ORDER BY array_position($1::text[], code), version DESC`, [SUPPORTED_DISCIPLINE_CODES]);
  return (result?.rows ?? []).map((row) => ({
    discipline: row.code,
    label: row.label,
    unit: row.unit,
    precision: Number(row.precision),
    direction: row.direction,
  }));
}
