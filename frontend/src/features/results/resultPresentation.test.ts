import { describe, expect, it } from 'vitest';
import type { IncidentType, Result, ResultOutcome } from '../../types';
import {
  createResultPresentationRow,
  format100mSeconds,
  formatAuditDateTime,
  getEffectiveResult,
  getIncidentTypeLabel,
  getResultOutcomeLabel,
  has100mHundredthPrecision,
  sortResultPresentationRows,
} from './resultPresentation';

const baseResult: Result = {
  eventId: '11111111-1111-4111-8111-111111111111',
  athleteId: '22222222-2222-4222-8222-222222222222',
  discipline: '100m',
  outcome: 'valid',
  finalResult: 11.24,
  unit: 'seconds',
  placing: 1,
  isPb: true,
  isSb: true,
  manualOverride: null,
  overrideReason: null,
  overriddenBy: null,
  overrideAt: null,
  updatedAt: '2026-08-17T10:00:00.000Z',
};

function row(
  athleteId: string,
  athleteName: string,
  outcome: ResultOutcome,
  value: number | null,
) {
  const result: Result = {
    ...baseResult,
    athleteId,
    outcome,
    finalResult: outcome === 'valid' ? value : null,
    unit: outcome === 'valid' ? 'seconds' : null,
  };
  return createResultPresentationRow({ id: athleteId, name: athleteName }, result);
}

describe('effective result presentation', () => {
  it('uses a raw valid result when no effective override exists', () => {
    expect(getEffectiveResult(baseResult)).toEqual({
      value: 11.24,
      outcome: 'valid',
      isOverrideEffective: false,
    });
  });

  it('uses a positive finite override for a valid result', () => {
    expect(getEffectiveResult({ ...baseResult, manualOverride: 11.1 })).toEqual({
      value: 11.1,
      outcome: 'valid',
      isOverrideEffective: true,
    });
  });

  it('promotes no_result to valid when it has a positive finite override', () => {
    expect(getEffectiveResult({
      ...baseResult,
      outcome: 'no_result',
      finalResult: null,
      manualOverride: 11.5,
    })).toEqual({ value: 11.5, outcome: 'valid', isOverrideEffective: true });
  });

  it.each(['dq', 'dnf', 'dns'] as const)('%s remains void despite an override', (outcome) => {
    expect(getEffectiveResult({
      ...baseResult,
      outcome,
      finalResult: null,
      manualOverride: 10.9,
    })).toEqual({ value: null, outcome, isOverrideEffective: false });
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    'ignores a non-positive or non-finite override (%s)',
    (manualOverride) => {
      expect(getEffectiveResult({ ...baseResult, manualOverride })).toEqual({
        value: baseResult.finalResult,
        outcome: baseResult.outcome,
        isOverrideEffective: false,
      });
    },
  );
});

describe('result labels', () => {
  it('formats 100m seconds to exactly two decimal places', () => {
    expect(format100mSeconds(11.2)).toBe('11.20s');
    expect(format100mSeconds(10)).toBe('10.00s');
  });

  it.each([
    ['10', true],
    ['10.5', true],
    ['10.55', true],
    ['10.555', false],
    ['.55', false],
    ['ten', false],
  ])('validates hundredth precision for %s', (value, expected) => {
    expect(has100mHundredthPrecision(value)).toBe(expected);
  });

  it.each<[ResultOutcome, string]>([
    ['no_result', 'No result'],
    ['valid', 'Valid result'],
    ['dq', 'Disqualified'],
    ['dnf', 'Did not finish'],
    ['dns', 'Did not start'],
  ])('labels the %s result outcome', (outcome, label) => {
    expect(getResultOutcomeLabel(outcome)).toBe(label);
  });

  it.each<[IncidentType, string]>([
    [null, 'No incident'],
    ['false_start', 'False start'],
    ['dq', 'Disqualified'],
    ['dnf', 'Did not finish'],
    ['dns', 'Did not start'],
    ['lane_infringement', 'Lane infringement'],
  ])('labels the %s incident', (incidentType, label) => {
    expect(getIncidentTypeLabel(incidentType)).toBe(label);
  });

  it('formats audit timestamps consistently in UTC', () => {
    expect(formatAuditDateTime('2026-08-17T10:05:00.000Z')).toBe('17 Aug 2026, 10:05 UTC');
  });
});

describe('result row sorting', () => {
  it('sorts valid times ascending, then void outcomes, with no_result last', () => {
    const rows = [
      row('no-result', 'No Result', 'no_result', null),
      row('slow', 'Slow Runner', 'valid', 12.1),
      row('dq', 'DQ Runner', 'dq', null),
      row('fast', 'Fast Runner', 'valid', 10.9),
      row('dns', 'DNS Runner', 'dns', null),
    ];

    expect(sortResultPresentationRows(rows).map(({ athleteId }) => athleteId)).toEqual([
      'fast',
      'slow',
      'dns',
      'dq',
      'no-result',
    ]);
    expect(rows.map(({ athleteId }) => athleteId)).toEqual([
      'no-result',
      'slow',
      'dq',
      'fast',
      'dns',
    ]);
  });

  it('breaks effective-time ties by athlete name and then athlete ID', () => {
    const rows = [
      row('z-id', 'Blair Runner', 'valid', 11.2),
      row('b-id', 'Alex Runner', 'valid', 11.2),
      row('a-id', 'Alex Runner', 'valid', 11.2),
    ];

    expect(sortResultPresentationRows(rows).map(({ athleteId }) => athleteId)).toEqual([
      'a-id',
      'b-id',
      'z-id',
    ]);
  });

  it('preserves input order when all documented tie-breakers are equal', () => {
    const first = row('same-id', 'Same Runner', 'dnf', null);
    const second = { ...first };
    const sorted = sortResultPresentationRows([first, second]);

    expect(sorted[0]).toBe(first);
    expect(sorted[1]).toBe(second);
  });
});
