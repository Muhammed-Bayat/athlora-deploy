import { describe, expect, it } from 'vitest';
import { calculateAge, format100mSeconds, formatDateOnly, formatOutcome } from './formatting';

describe('shared formatting', () => {
  it('formats 100m seconds to hundredths', () => {
    expect(format100mSeconds(11.2)).toBe('11.20s');
  });

  it.each([
    ['valid', 'Valid result'],
    ['dq', 'Disqualified'],
    ['dnf', 'Did not finish'],
    ['dns', 'Did not start'],
    ['no_result', 'No result'],
  ] as const)('formats %s outcomes', (outcome, expected) => {
    expect(formatOutcome(outcome)).toBe(expected);
  });

  it('formats date-only values consistently without a local-time shift', () => {
    expect(formatDateOnly('2004-02-29')).toBe('29 Feb 2004');
    expect(formatDateOnly(null)).toBe('Not provided');
  });

  it('calculates current age before, on, and after the birthday', () => {
    expect(calculateAge('2004-08-18', new Date(2026, 7, 17))).toBe(21);
    expect(calculateAge('2004-08-17', new Date(2026, 7, 17))).toBe(22);
    expect(calculateAge('2004-02-29', new Date(2026, 1, 28))).toBe(21);
    expect(calculateAge(null, new Date(2026, 7, 17))).toBeNull();
  });
});
