import { describe, expect, it } from 'vitest';
import { deriveMeasuredResult } from './measuredDerivation.js';
import type { DisciplineDefinition } from '../types/meets.js';

const def: DisciplineDefinition = {
  id: 'd2', code: 'long_jump', version: 1, kind: 'field', unit: 'metres', direction: 'higher',
  defaultRules: { aggregation: 'best', entrantType: 'individual', attempts: 6 }, precision: 2,
  presentation: { label: 'Long Jump' }, createdAt: '', source: 'test',
};

describe('measured field derivation and automatic best-mark selection', () => {
  it('automatically selects best legal mark and ignores fouls and passes', () => {
    const res = deriveMeasuredResult([
      { entryType: 'attempt', value: 5.90, isFoul: false, incidentType: null },
      { entryType: 'attempt', value: null, isFoul: true, incidentType: null },
      { entryType: 'attempt', value: 6.12, isFoul: false, incidentType: null },
      { entryType: 'attempt', value: null, isFoul: false, incidentType: null }, // pass
      { entryType: 'attempt', value: 6.05, isFoul: false, incidentType: null },
    ], def);
    expect(res).toMatchObject({ value: 6.12, outcome: 'valid' });
    expect(res.series).toHaveLength(5);
  });
  it('handles all fouls or no attempts as no_result', () => {
    expect(deriveMeasuredResult([{ entryType: 'attempt', value: null, isFoul: true, incidentType: null }], def)).toMatchObject({ value: null, outcome: 'no_result' });
    expect(deriveMeasuredResult([], def)).toMatchObject({ value: null, outcome: 'no_result' });
  });
});
