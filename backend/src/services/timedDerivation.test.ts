import { describe, expect, it } from 'vitest';
import { deriveTimedResult } from './timedDerivation.js';
import type { DisciplineDefinition } from '../types/meets.js';

const def: DisciplineDefinition = {
  id: 'd1', code: '1500m', version: 1, kind: 'track', unit: 'seconds', direction: 'lower',
  defaultRules: { aggregation: 'timed', entrantType: 'individual' }, precision: 2,
  presentation: { label: '1500m' }, createdAt: '', source: 'test',
};

describe('timed discipline derivation and eligibility', () => {
  it('derives valid timed result with precision rounding and lower-is-better sort', () => {
    const res = deriveTimedResult([{ entryType: 'attempt', value: 210.456, isFoul: false, incidentType: null }], def);
    expect(res).toEqual({ value: 210.46, incident: null, outcome: 'valid' });
  });
  it('excludes DNS, DNF, DSQ, and incomplete results from valid outcomes', () => {
    expect(deriveTimedResult([{ entryType: 'attempt', value: null, isFoul: false, incidentType: 'dnf' }], def)).toMatchObject({ outcome: 'dnf', value: null });
    expect(deriveTimedResult([{ entryType: 'attempt', value: null, isFoul: false, incidentType: 'dq' }], def)).toMatchObject({ outcome: 'dq', value: null });
    expect(deriveTimedResult([{ entryType: 'attempt', value: null, isFoul: false, incidentType: 'dns' }], def)).toMatchObject({ outcome: 'dns', value: null });
    expect(deriveTimedResult([], def)).toMatchObject({ outcome: 'no_result', value: null });
  });
});
