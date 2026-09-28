import { describe, expect, it } from 'vitest';
import { deriveMeasuredResult } from './measuredDerivation.js';
import type { DisciplineDefinition } from '../types/meets.js';

const def: DisciplineDefinition = {
  id: 'd2', code: 'long_jump', version: 1, kind: 'field', unit: 'metres', direction: 'higher',
  defaultRules: { aggregation: 'best', entrantType: 'individual', attempts: 6 }, precision: 2,
  presentation: { label: 'Long Jump' }, createdAt: '', source: 'test',
};

describe('measured field derivation and official-mark selection', () => {
  it('uses the selected legal mark and ignores fouls and passes', () => {
    const res = deriveMeasuredResult([
      { id: 'first', entryType: 'attempt', value: 5.90, isFoul: false, incidentType: null },
      { id: 'foul', entryType: 'attempt', value: null, isFoul: true, incidentType: null },
      { id: 'official', entryType: 'attempt', value: 6.12, isFoul: false, incidentType: null },
      { id: 'pass', entryType: 'attempt', value: null, isFoul: false, incidentType: null }, // pass
      { id: 'later', entryType: 'attempt', value: 6.05, isFoul: false, incidentType: null },
    ], def, 'official');
    expect(res).toMatchObject({ value: 6.12, outcome: 'valid' });
    expect(res.series).toHaveLength(5);
  });
  it('requires an active legal selected mark', () => {
    expect(deriveMeasuredResult([{ id: 'mark', entryType: 'attempt', value: 6.12, isFoul: false, incidentType: null }], def)).toMatchObject({ value: null, outcome: 'no_result' });
    expect(deriveMeasuredResult([{ id: 'foul', entryType: 'attempt', value: null, isFoul: true, incidentType: null }], def, 'foul')).toMatchObject({ value: null, outcome: 'no_result' });
    expect(deriveMeasuredResult([{ entryType: 'attempt', value: null, isFoul: true, incidentType: null }], def)).toMatchObject({ value: null, outcome: 'no_result' });
    expect(deriveMeasuredResult([], def)).toMatchObject({ value: null, outcome: 'no_result' });
  });
});
