import type { IncidentType, ResultOutcome } from '../types/domain.js';
import type { DisciplineDefinition } from '../types/meets.js';

export interface TimedEntryInput {
  entryType: string;
  value: number | null;
  isFoul: boolean;
  incidentType: IncidentType | null;
  deletedAt?: string | null;
}

export function deriveTimedResult(entries: readonly TimedEntryInput[], definition: DisciplineDefinition): { value: number | null; incident: IncidentType | null; outcome: ResultOutcome } {
  const active = entries.filter((e) => !e.deletedAt);
  const dq = active.find((e) => e.incidentType === 'dq')?.incidentType;
  if (dq) return { value: null, incident: dq, outcome: 'dq' };
  const dnf = active.find((e) => e.incidentType === 'dnf')?.incidentType;
  if (dnf) return { value: null, incident: dnf, outcome: 'dnf' };
  const dns = active.find((e) => e.incidentType === 'dns')?.incidentType;
  if (dns) return { value: null, incident: dns, outcome: 'dns' };

  const attempts = active.filter((e) => e.entryType === 'attempt' && e.value !== null && e.value > 0);
  if (attempts.length === 0) return { value: null, incident: null, outcome: 'no_result' };

  // For timed races, the finishing time is the latest valid attempt (final recorded time).
  const latest = attempts[attempts.length - 1];
  const factor = Math.pow(10, definition.precision);
  const rounded = Math.round(latest.value! * factor) / factor;
  return { value: rounded, incident: null, outcome: 'valid' };
}
