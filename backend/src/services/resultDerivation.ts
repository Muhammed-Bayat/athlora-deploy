import type { EntryType, IncidentType } from '../types/domain.js';

export interface EntryInput {
  entryType: EntryType;
  value: number | null;
  isFoul: boolean;
  incidentType: IncidentType | null;
}

export interface Derivation {
  value: number | null;
  incident: IncidentType | null;
}

export type DisciplineKind = 'field' | 'track';

const VOID_INCIDENTS: readonly IncidentType[] = ['dq', 'dnf', 'dns'];

function bestValidAttempt(entries: readonly EntryInput[]): number | null {
  let best: number | null = null;
  for (const entry of entries) {
    if (entry.entryType !== 'attempt' || entry.isFoul || entry.value === null) continue;
    best = best === null ? entry.value : Math.max(best, entry.value);
  }
  return best;
}

function voidedBy(entries: readonly EntryInput[]): Derivation | null {
  const voided = entries.find(
    (entry) => entry.incidentType !== null && VOID_INCIDENTS.includes(entry.incidentType),
  );
  if (voided && voided.incidentType) {
    return { value: null, incident: voided.incidentType };
  }
  return null;
}

export function deriveFieldBest(entries: readonly EntryInput[]): Derivation {
  const voided = voidedBy(entries);
  if (voided) return voided;
  return { value: bestValidAttempt(entries), incident: null };
}

export function deriveTrackTime(entries: readonly EntryInput[]): Derivation {
  const voided = voidedBy(entries);
  if (voided) return voided;
  return { value: bestValidAttempt(entries), incident: null };
}

export function deriveResult(entries: readonly EntryInput[], kind: DisciplineKind): Derivation {
  return kind === 'field' ? deriveFieldBest(entries) : deriveTrackTime(entries);
}