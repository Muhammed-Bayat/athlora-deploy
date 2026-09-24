import { ApiError } from '../middleware/errors.js';
import type { SessionEntryInput, VerticalConfig, VerticalSummary } from '../types/meets.js';
import type { Derivation } from './resultDerivation.js';
import { centimetres, parseVerticalConfig } from '../validation/verticalMeets.js';

type Attempt = SessionEntryInput & { deletedAt?: string | null; attemptOrder?: number | null };
export interface VerticalDerivation extends Derivation, VerticalSummary {}
export function deriveVertical(entries: readonly Attempt[], config: VerticalConfig): VerticalDerivation {
  parseVerticalConfig(config);
  const result: VerticalDerivation = { value: null, outcome: 'no_result', incident: null, failuresAtBest: 0, totalFailuresToBest: 0, consecutiveFailures: 0, eliminated: false };
  let height = 0, closed = false, failuresAtHeight = 0, totalFailures = 0;
  const active = entries.filter(e => !e.deletedAt).slice().sort((a,b) => (a.attemptOrder ?? 0) - (b.attemptOrder ?? 0));
  for (const entry of active) {
    if (entry.entryType !== 'attempt') continue;
    if (entry.incidentType === 'dq' || entry.incidentType === 'dns') continue;
    if (!entry.verticalState || entry.value === null || entry.unit !== 'metres' || entry.isFoul || entry.incidentType) throw new ApiError(400, 'VALIDATION_ERROR', 'A vertical attempt requires a height and clearance, failure, pass or void state');
    const h = centimetres(entry.value);
    if (h < centimetres(config.startingHeight) || (h - centimetres(config.startingHeight)) % centimetres(config.heightIncrement) !== 0) throw new ApiError(400, 'VALIDATION_ERROR', 'Height is outside the configured progression');
    if (entry.verticalState === 'void') continue;
    if (result.eliminated || h < height || (h === height && closed)) throw new ApiError(409, 'INVALID_VERTICAL_SEQUENCE', 'Entrant is eliminated or this height is closed');
    if (h > height) { height = h; closed = false; failuresAtHeight = 0; }
    if (entry.verticalState === 'pass') { closed = true; continue; }
    if (entry.verticalState === 'failure') {
      failuresAtHeight++; totalFailures++; result.consecutiveFailures++;
      result.eliminated = result.consecutiveFailures >= config.failureLimit;
    } else {
      result.value = h / 100; result.outcome = 'valid'; result.failuresAtBest = failuresAtHeight;
      result.totalFailuresToBest = totalFailures; result.consecutiveFailures = 0; closed = true;
    }
  }
  const incident = active.some(e => e.incidentType === 'dq') ? 'dq' : active.some(e => e.incidentType === 'dns') ? 'dns' : null;
  if (incident) { result.value = null; result.outcome = incident; result.incident = incident; }
  return result;
}
export function compareVertical(a: Pick<VerticalDerivation, 'value' | 'failuresAtBest' | 'totalFailuresToBest'>, b: Pick<VerticalDerivation, 'value' | 'failuresAtBest' | 'totalFailuresToBest'>): number {
  return (b.value ?? 0) - (a.value ?? 0) || a.failuresAtBest - b.failuresAtBest || a.totalFailuresToBest - b.totalFailuresToBest;
}
export function verticalPlacings(results: readonly { entrantId: string; score: VerticalDerivation }[]): Map<string, number | null> {
  const places = new Map<string, number | null>(results.map(r => [r.entrantId, null]));
  const valid = results.filter(r => r.score.outcome === 'valid' && r.score.value !== null).slice().sort((a, b) => compareVertical(a.score, b.score));
  valid.forEach((r, index) => places.set(r.entrantId, index > 0 && compareVertical(valid[index - 1].score, r.score) === 0 ? places.get(valid[index - 1].entrantId)! : index + 1));
  return places;
}
