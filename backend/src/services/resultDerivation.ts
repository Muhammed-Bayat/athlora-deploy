import type { Discipline, EntryType, EventType, IncidentType, ResultOutcome } from '../types/domain.js';
import { isPositiveRaceTime } from '../validation/primitives.js';

export interface EntryInput {
  entryType: EntryType;
  value: number | null;
  isFoul: boolean;
  incidentType: IncidentType | null;
  deletedAt?: string | null;
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

const VOID_INCIDENTS: readonly ('dq' | 'dnf' | 'dns')[] = ['dq', 'dnf', 'dns'];

function voidedBy(entries: readonly EntryInput[]): Derivation | null {
  const activeEntries = entries.filter((e) => !e.deletedAt);
  const incident = VOID_INCIDENTS.find((candidate) =>
    activeEntries.some((entry) => entry.incidentType === candidate),
  );
  if (incident) {
    return { value: null, incident, outcome: incident };
  }
  return null;
}

export function deriveFieldBest(entries: readonly EntryInput[]): Derivation {
  const voided = voidedBy(entries);
  if (voided) return voided;

  const activeEntries = entries.filter((e) => !e.deletedAt);
  let best: number | null = null;
  for (const entry of activeEntries) {
    if (
      entry.entryType !== 'attempt' ||
      entry.isFoul ||
      entry.value === null ||
      !isPositiveRaceTime(entry.value)
    )
      continue;
    best = best === null ? entry.value : Math.max(best, entry.value);
  }
  return { value: best, incident: null, outcome: best === null ? 'no_result' : 'valid' };
}

function isValidEntryForTrack(entry: EntryInput): boolean {
  if (entry.entryType !== 'attempt') return false;
  if (entry.deletedAt !== null && entry.deletedAt !== undefined) return false;
  if (entry.value === null || !isPositiveRaceTime(entry.value)) return false;
  return true;
}

export function deriveTrackTime(
  entries: readonly EntryInput[],
  eventType: EventType = 'competition',
): Derivation {
  const voided = voidedBy(entries);
  if (voided) return voided;

  const activeAttempts = entries.filter(isValidEntryForTrack);
  if (activeAttempts.length === 0) {
    return { value: null, incident: null, outcome: 'no_result' };
  }

  if (eventType === 'competition') {
    const latestAttempt = activeAttempts[activeAttempts.length - 1];
    return { value: latestAttempt.value, incident: null, outcome: 'valid' };
  } else {
    let fastest: number | null = null;
    for (const attempt of activeAttempts) {
      if (attempt.value !== null) {
        fastest = fastest === null ? attempt.value : Math.min(fastest, attempt.value);
      }
    }
    return { value: fastest, incident: null, outcome: fastest === null ? 'no_result' : 'valid' };
  }
}

export function deriveResult(
  entries: readonly EntryInput[],
  kind: DisciplineKind,
  eventType: EventType = 'competition',
): Derivation {
  return kind === 'field' ? deriveFieldBest(entries) : deriveTrackTime(entries, eventType);
}

export function deriveEffectiveResult(
  derived: Derivation,
  manualOverride: number | null,
): { value: number | null; outcome: ResultOutcome; incident: IncidentType | null } {
  if (manualOverride !== null && isPositiveRaceTime(manualOverride)) {
    return {
      value: manualOverride,
      outcome: derived.outcome === 'no_result' ? 'valid' : derived.outcome,
      incident: derived.incident,
    };
  }
  return {
    value: derived.value,
    outcome: derived.outcome,
    incident: derived.incident,
  };
}

export function calculatePlacings(
  results: readonly { athleteId: string; value: number | null; outcome: ResultOutcome }[],
): Map<string, number | null> {
  const validResults = results
    .filter((r) => r.outcome === 'valid' && r.value !== null)
    .sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

  const placings = new Map<string, number | null>();
  for (const r of results) {
    if (r.outcome !== 'valid' || r.value === null) {
      placings.set(r.athleteId, null);
    }
  }

  let currentPlace = 1;
  for (let i = 0; i < validResults.length; i++) {
    if (i > 0 && validResults[i].value === validResults[i - 1].value) {
      placings.set(
        validResults[i].athleteId,
        placings.get(validResults[i - 1].athleteId) ?? currentPlace,
      );
    } else {
      currentPlace = i + 1;
      placings.set(validResults[i].athleteId, currentPlace);
    }
  }

  return placings;
}

export function checkPbSb(
  resultValue: number | null,
  outcome: ResultOutcome,
  eventDate: string,
  historicalResults: readonly { value: number; date: string; outcome: ResultOutcome }[],
): { isPb: boolean; isSb: boolean } {
  if (outcome !== 'valid' || resultValue === null) {
    return { isPb: false, isSb: false };
  }

  const validHistorical = historicalResults.filter((h) => h.outcome === 'valid' && h.value > 0);
  const eventYear = eventDate.slice(0, 4);

  const isPb = validHistorical.every((h) => resultValue < h.value);
  const yearHistorical = validHistorical.filter((h) => h.date.slice(0, 4) === eventYear);
  const isSb = yearHistorical.every((h) => resultValue < h.value);

  return { isPb, isSb };
}
