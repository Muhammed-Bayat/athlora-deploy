import { describe, expect, it } from 'vitest';
import {
  deriveFieldBest,
  deriveResult,
  deriveTrackTime,
  type EntryInput,
} from '../resultDerivation.js';

function attempt(value: number | null, overrides: Partial<EntryInput> = {}): EntryInput {
  return { entryType: 'attempt', value, isFoul: false, incidentType: null, ...overrides };
}

describe('deriveFieldBest', () => {
  it('returns the best valid attempt as valid', () => {
    const derivation = deriveFieldBest([attempt(6.42), attempt(6.61), attempt(6.55)]);
    expect(derivation.value).toBe(6.61);
    expect(derivation.outcome).toBe('valid');
  });

  it('ignores foul attempts', () => {
    const { value } = deriveFieldBest([attempt(7.1), attempt(0, { isFoul: true }), attempt(7.04)]);
    expect(value).toBe(7.1);
  });

  it('is no_result when every attempt is foul', () => {
    const derivation = deriveFieldBest([attempt(0, { isFoul: true }), attempt(0, { isFoul: true })]);
    expect(derivation.value).toBeNull();
    expect(derivation.outcome).toBe('no_result');
  });
});

describe('deriveTrackTime', () => {
  it('returns the finishing time from valid attempts as valid', () => {
    const derivation = deriveTrackTime([attempt(11.32), attempt(11.2)]);
    expect(derivation.value).toBe(11.32);
    expect(derivation.outcome).toBe('valid');
  });

  it('voids the result on a DQ incident', () => {
    const derivation = deriveTrackTime([
      attempt(10.9),
      attempt(10.9, { incidentType: 'dq' }),
    ]);
    expect(derivation.value).toBeNull();
    expect(derivation.incident).toBe('dq');
    expect(derivation.outcome).toBe('dq');
  });

  it('voids the result on a DNS incident', () => {
    const derivation = deriveTrackTime([attempt(0, { incidentType: 'dns' })]);
    expect(derivation.value).toBeNull();
    expect(derivation.outcome).toBe('dns');
  });

  it('is no_result without any valid attempt', () => {
    const derivation = deriveTrackTime([]);
    expect(derivation.value).toBeNull();
    expect(derivation.outcome).toBe('no_result');
  });
});

describe('deriveResult', () => {
  it('uses field rules for measured disciplines', () => {
    const { value } = deriveResult([attempt(6.4), attempt(6.8)], 'field');
    expect(value).toBe(6.8);
  });

  it('uses track rules for timed disciplines', () => {
    const { value } = deriveResult([attempt(21.4), attempt(21.8)], 'track');
    expect(value).toBe(21.8);
  });

  it('keeps both entries when results are tied by value semantics', () => {
    const entries = [attempt(5.0), attempt(0, { isFoul: true })];
    const { value } = deriveResult(entries, 'field');
    expect(value).toBe(5.0);
  });

  it('maps a DNF void to the dnf outcome', () => {
    const derivation = deriveResult([attempt(0, { incidentType: 'dnf' })], 'track');
    expect(derivation.value).toBeNull();
    expect(derivation.outcome).toBe('dnf');
  });
});