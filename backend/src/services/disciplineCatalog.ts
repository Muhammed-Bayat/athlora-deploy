import type { DbExecutor } from '../db/client.js';
import type { PublicDiscipline } from '../types/domain.js';

export async function listAvailableDisciplines(executor: DbExecutor): Promise<PublicDiscipline[]> {
  const result = await executor.query<{
    code: string; label: string; unit: PublicDiscipline['unit']; precision: number | string; direction: PublicDiscipline['direction'];
  }>(`SELECT code, presentation->>'label' AS label, unit, precision, direction
      FROM discipline_definitions
      ORDER BY kind, code, version DESC`);
  return (result?.rows ?? []).map((row) => ({
    discipline: row.code,
    label: row.label,
    unit: row.unit,
    precision: Number(row.precision),
    direction: row.direction,
  }));
}
