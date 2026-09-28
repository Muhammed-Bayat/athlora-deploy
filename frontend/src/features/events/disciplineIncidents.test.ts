import { describe, expect, it } from 'vitest';
import type { DisciplineDefinition } from '../../types/meets';
import { incidentButtons } from './disciplineIncidents';

function definition(overrides: Partial<DisciplineDefinition> = {}): DisciplineDefinition {
  return {
    id: 'd', code: '100m', version: 1, kind: 'track', unit: 'seconds', direction: 'lower',
    defaultRules: { aggregation: 'timed', entrantType: 'individual' },
    precision: 2, presentation: { label: '100m' }, createdAt: '2026-09-01T00:00:00.000Z', source: 'catalogue',
    ...overrides,
  };
}

describe('incidentButtons', () => {
  it('keeps the full set for lane races including sprints without a distance rule', () => {
    expect(incidentButtons(definition()).map((button) => button.value))
      .toEqual(['false_start', 'lane_infringement', 'dq', 'dnf', 'dns']);
    expect(incidentButtons(definition({ defaultRules: { aggregation: 'timed', entrantType: 'individual', distance: 400, hurdleCount: 10 } })).map((button) => button.value))
      .toEqual(['false_start', 'lane_infringement', 'dq', 'dnf', 'dns']);
  });

  it('drops the lane infringement for races longer than one lap', () => {
    expect(incidentButtons(definition({ code: '1500m', defaultRules: { aggregation: 'timed', entrantType: 'individual', distance: 1500 } })).map((button) => button.value))
      .toEqual(['false_start', 'dq', 'dnf', 'dns']);
  });

  it('tracks only fouls and status incidents for throws and horizontal jumps', () => {
    expect(incidentButtons(definition({ code: 'discus', kind: 'field', unit: 'metres', direction: 'higher', defaultRules: { aggregation: 'best', entrantType: 'individual', attempts: 6 } })).map((button) => button.value))
      .toEqual(['dq', 'dnf', 'dns']);
  });

  it('drops the false start for race walks', () => {
    expect(incidentButtons(definition({ code: '5000mw', defaultRules: { aggregation: 'timed', entrantType: 'individual', distance: 5000, raceWalk: true } })).map((button) => button.value))
      .toEqual(['dq', 'dnf', 'dns']);
  });

  it('keeps the full set for relays', () => {
    expect(incidentButtons(definition({ code: '4x400m', kind: 'relay', defaultRules: { aggregation: 'timed', entrantType: 'relay', teamSize: 4 } })).map((button) => button.value))
      .toEqual(['false_start', 'lane_infringement', 'dq', 'dnf', 'dns']);
  });
});
