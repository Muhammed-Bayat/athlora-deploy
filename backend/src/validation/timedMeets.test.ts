import { describe, expect, it } from 'vitest';
import type { DisciplineDefinition } from '../types/meets.js';
import { validateTimedDefinition } from './timedMeets.js';

const sprint: DisciplineDefinition = {
  id: 'd1', code: '100m', version: 1, kind: 'track', unit: 'seconds', direction: 'lower',
  defaultRules: { aggregation: 'timed', entrantType: 'individual' }, precision: 2,
  presentation: { label: '100m' }, createdAt: '', source: 'test',
};

describe('timed discipline hurdle configuration', () => {
  // Rule values from the 0029 timed discipline catalogue.
  it.each([
    { code: '110mh', distance: 110, hurdleHeight: 1.067 },
    { code: '100mh', distance: 100, hurdleHeight: 0.838 },
    { code: '400mh', distance: 400, hurdleHeight: 0.914 },
  ])('accepts the catalogue hurdle count and rejects mismatches for $code', ({ code, distance, hurdleHeight }) => {
    const definition: DisciplineDefinition = {
      ...sprint, code,
      defaultRules: { ...sprint.defaultRules, distance, hurdleHeight, hurdleCount: 10 },
    };
    const count: number | undefined = definition.defaultRules.hurdleCount;
    expect(count).toBe(10);
    expect(() => validateTimedDefinition(definition, { distance, hurdleCount: count })).not.toThrow();
    for (const hurdleCount of [9, 11, 0, -1, 10.5, '10']) {
      expect(() => validateTimedDefinition(definition, { hurdleCount })).toThrow('Hurdle count configuration mismatch');
    }
    expect(() => validateTimedDefinition(definition, {})).not.toThrow();
  });

  it('does not require a hurdle count for the existing 100m discipline', () => {
    expect(sprint.defaultRules.hurdleCount).toBeUndefined();
    expect(() => validateTimedDefinition(sprint, {})).not.toThrow();
    expect(() => validateTimedDefinition(sprint, { distance: 100 })).not.toThrow();
  });
});
