import type { DisciplineDefinition, SessionEntry, VerticalConfig } from '../types/meets.js';
import { deriveTrackTime, type Derivation } from './resultDerivation.js';
import { deriveMeasuredResult } from './measuredDerivation.js';
import { deriveVertical, compareVertical, type VerticalDerivation } from './verticalScoring.js';

/** Orchestrates the existing engines; timed source selection never falls back silently. */
export function authoritativeResult(definition: DisciplineDefinition, entries: readonly SessionEntry[], selectedId: string | null, config?: VerticalConfig | null): Derivation | VerticalDerivation {
  if (definition.defaultRules.aggregation === 'vertical') {
    const result = deriveVertical(entries, config!);
    // DNF is an entrant outcome, separate from the vertical clearance/countback engine.
    if (!['dq', 'dns'].includes(result.outcome) && entries.some(e => !e.deletedAt && e.incidentType === 'dnf')) return { ...result, value: null, outcome: 'dnf', incident: 'dnf' };
    return result;
  }
  if (definition.defaultRules.aggregation === 'best') return deriveMeasuredResult(entries, definition);
  const eligible = entries.map(e => e.entryType === 'attempt' && (e.id !== selectedId || e.isFoul || e.incidentType !== null)
    ? { ...e, entryType: 'note' as const, value: null } : e);
  const result = deriveTrackTime(eligible, 'competition', selectedId);
  return result.value === null ? result : { ...result, value: Number(result.value.toFixed(definition.precision)) };
}

export interface PlaceCandidate { entrantId: string; score: Derivation; entries: readonly SessionEntry[]; eligible: boolean }
export function sessionPlaces(definition: DisciplineDefinition, candidates: readonly PlaceCandidate[]): Map<string, number | null> {
  const places = new Map<string, number | null>(candidates.map(c => [c.entrantId, null]));
  const series = (c: PlaceCandidate) => c.entries.filter(e => !e.deletedAt && e.entryType === 'attempt' && !e.isFoul && e.value !== null && e.value > 0)
    .map(e => Number(e.value!.toFixed(definition.precision))).sort((a, b) => b - a);
  const compare = (a: PlaceCandidate, b: PlaceCandidate): number => {
    if (definition.defaultRules.aggregation === 'vertical') return compareVertical(a.score as VerticalDerivation, b.score as VerticalDerivation);
    const difference = (a.score.value! - b.score.value!) * (definition.direction === 'lower' ? 1 : -1);
    if (difference || definition.defaultRules.aggregation !== 'best') return difference;
    const aa = series(a), bb = series(b);
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
      const next = (bb[i] ?? 0) - (aa[i] ?? 0);
      if (next) return next;
    }
    return 0;
  };
  const ranked = candidates.filter(c => c.eligible && c.score.outcome === 'valid' && c.score.value !== null).slice().sort(compare);
  ranked.forEach((c, i) => places.set(c.entrantId, i > 0 && compare(ranked[i - 1], c) === 0 ? places.get(ranked[i - 1].entrantId)! : i + 1));
  return places;
}
