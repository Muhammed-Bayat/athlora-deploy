import type { IncidentType, ResultOutcome } from '../types/domain.js';
import type { DisciplineDefinition } from '../types/meets.js';

export interface MeasuredAttemptInput {
  id?: string;
  entryType: string;
  value: number | null;
  isFoul: boolean;
  incidentType: IncidentType | null;
  deletedAt?: string | null;
}

export interface MeasuredDerivation {
  value: number | null;
  incident: IncidentType | null;
  outcome: ResultOutcome;
  series: Array<{ value: number | null; isFoul: boolean; incidentType: IncidentType | null }>;
}

export function deriveMeasuredResult(entries: readonly MeasuredAttemptInput[], definition: DisciplineDefinition, selectedEntryId: string | null = null): MeasuredDerivation {
  const active = entries.filter((e) => !e.deletedAt);
  const series = active.map((e) => ({ value: e.value, isFoul: e.isFoul, incidentType: e.incidentType }));

  const dq = active.find((e) => e.incidentType === 'dq')?.incidentType;
  if (dq) return { value: null, incident: dq, outcome: 'dq', series };
  const dnf = active.find((e) => e.incidentType === 'dnf')?.incidentType;
  if (dnf) return { value: null, incident: dnf, outcome: 'dnf', series };
  const dns = active.find((e) => e.incidentType === 'dns')?.incidentType;
  if (dns) return { value: null, incident: dns, outcome: 'dns', series };

  const factor = Math.pow(10, definition.precision);
  if (!selectedEntryId) return { value: null, incident: null, outcome: 'no_result', series };

  for (const entry of active) {
    if (entry.entryType !== 'attempt' || entry.isFoul || entry.incidentType !== null || entry.value === null || entry.value <= 0 || entry.id !== selectedEntryId) continue;
    const value = Math.round(entry.value * factor) / factor;
    return { value, incident: null, outcome: 'valid', series };
  }

  return { value: null, incident: null, outcome: 'no_result', series };
}
