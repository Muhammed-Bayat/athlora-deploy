import type { Discipline, EntryType, IncidentType, ResultOutcome } from '../types/domain.js';

export interface EntryInput {
  entryType: EntryType;
  value: number | null;
  isFoul: boolean;
  incidentType: IncidentType | null;
}

export interface Derivation {
  value: number | null;
  incident: IncidentType | null;
  outcome: ResultOutcome;
}

export type DisciplineKind = 'field' | 'track';

export const DISCIPLINE_KIND: Record<Discipline, DisciplineKind> = {
  '100m': 'track',
};

const VOID_INCIDENTS: readonly ['dq', 'dnf', 'dns'] = ['dq', 'dnf', 'dns'];

function bestValidAttempt(entries: readonly EntryInput[]): number | null {
  let best: number | null = null;
  for (const entry of entries) {
    if (entry.entryType !== 'attempt' || entry.isFoul || entry.value === null) continue;
    best = best === null ? entry.value : Math.max(best, entry.value);
  }
  return best;
}

function voidedBy(entries: readonly EntryInput[]): Derivation | null {
  const incident = VOID_INCIDENTS.find((candidate) =>
    entries.some((entry) => entry.incidentType === candidate),
  );
  if (incident) {
    return { value: null, incident, outcome: incident };
  }
  return null;
}

export function deriveFieldBest(entries: readonly EntryInput[]): Derivation {
  const voided = voidedBy(entries);
  if (voided) return voided;
  const value = bestValidAttempt(entries);
  return { value, incident: null, outcome: value === null ? 'no_result' : 'valid' };
}

export function deriveTrackTime(entries: readonly EntryInput[]): Derivation {
  const voided = voidedBy(entries);
  if (voided) return voided;
  const value = bestValidAttempt(entries);
  return { value, incident: null, outcome: value === null ? 'no_result' : 'valid' };
}

export function deriveResult(entries: readonly EntryInput[], kind: DisciplineKind): Derivation {
  return kind === 'field' ? deriveFieldBest(entries) : deriveTrackTime(entries);
}