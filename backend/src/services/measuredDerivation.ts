import type { IncidentType, ResultOutcome } from '../types/domain.js';
import type { DisciplineDefinition } from '../types/meets.js';

export interface MeasuredAttemptInput {
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

export function deriveMeasuredResult(entries: readonly MeasuredAttemptInput[], definition: DisciplineDefinition): MeasuredDerivation {
  const active = entries.filter((e) => !e.deletedAt);
  const series = active.map((e) => ({ value: e.value, isFoul: e.isFoul, incidentType: e.incidentType }));

  const dq = active.find((e) => e.incidentType === 'dq')?.incidentType;
  if (dq) return { value: null, incident: dq, outcome: 'dq', series };
  const dnf = active.find((e) => e.incidentType === 'dnf')?.incidentType;
  if (dnf) return { value: null, incident: dnf, outcome: 'dnf', series };
  const dns = active.find((e) => e.incidentType === 'dns')?.incidentType;
  if (dns) return { value: null, incident: dns, outcome: 'dns', series };

  const factor = Math.pow(10, definition.precision);
  let best: number | null = null;
  for (const entry of active) {
    if (entry.entryType !== 'attempt' || entry.isFoul || entry.value === null || entry.value <= 0) continue;
    const rounded = Math.round(entry.value * factor) / factor;
    if (best === null || rounded > best) {
      best = rounded;
    }
  }

  return { value: best, incident: null, outcome: best === null ? 'no_result' : 'valid', series };
}
