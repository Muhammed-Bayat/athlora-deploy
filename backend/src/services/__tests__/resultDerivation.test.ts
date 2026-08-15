import { describe, expect, it } from 'vitest';
import {
  calculatePlacings,
  checkPbSb,
  deriveEffectiveResult,
  deriveFieldBest,
  deriveTrackTime,
  type EntryInput,
} from '../resultDerivation.js';

function attempt(value: number | null, overrides: Partial<EntryInput> = {}): EntryInput {
  return { entryType: 'attempt', value, isFoul: false, incidentType: null, deletedAt: null, ...overrides };
}

describe('deriveFieldBest', () => {
  it('returns the best valid attempt as valid', () => {
    const derivation = deriveFieldBest([attempt(6.42), attempt(6.61), attempt(6.55)]);
    expect(derivation.value).toBe(6.61);
    expect(derivation.outcome).toBe('valid');
  });

  it('ignores foul attempts and soft-deleted entries', () => {
    const { value } = deriveFieldBest([
      attempt(7.1),
      attempt(0, { isFoul: true }),
      attempt(7.5, { deletedAt: '2026-01-01T00:00:00Z' }),
      attempt(7.04),
    ]);
    expect(value).toBe(7.1);
  });

  it('is no_result when every attempt is foul', () => {
    const derivation = deriveFieldBest([attempt(0, { isFoul: true }), attempt(0, { isFoul: true })]);
    expect(derivation.value).toBeNull();
    expect(derivation.outcome).toBe('no_result');
  });
});

describe('deriveTrackTime (100m engine)', () => {
  it('competition uses single active finish', () => {
    const derivation = deriveTrackTime([attempt(11.32), attempt(11.2)], 'competition');
    expect(derivation.value).toBe(11.2);
    expect(derivation.outcome).toBe('valid');
  });

  it('training uses fastest active positive finish (minimum time)', () => {
    const derivation = deriveTrackTime([attempt(11.5), attempt(10.9), attempt(11.2)], 'training');
    expect(derivation.value).toBe(10.9);
    expect(derivation.outcome).toBe('valid');
  });

  it('ignores soft-deleted entries and invalid times (zero/negative)', () => {
    const derivation = deriveTrackTime(
      [
        attempt(0),
        attempt(-5),
        attempt(11.2, { deletedAt: '2026-01-01T00:00:00Z' }),
        attempt(10.8),
      ],
      'training',
    );
    expect(derivation.value).toBe(10.8);
    expect(derivation.outcome).toBe('valid');
  });

  it('voids the result on DQ, DNF, or DNS incidents', () => {
    const dqDerivation = deriveTrackTime([attempt(10.9), attempt(0, { incidentType: 'dq' })]);
    expect(dqDerivation.value).toBeNull();
    expect(dqDerivation.outcome).toBe('dq');

    const dnfDerivation = deriveTrackTime([attempt(0, { incidentType: 'dnf' })]);
    expect(dnfDerivation.value).toBeNull();
    expect(dnfDerivation.outcome).toBe('dnf');

    const dnsDerivation = deriveTrackTime([attempt(0, { incidentType: 'dns' })]);
    expect(dnsDerivation.value).toBeNull();
    expect(dnsDerivation.outcome).toBe('dns');
  });

  it('retains false_start and lane_infringement penalties without voiding result', () => {
    const derivation = deriveTrackTime([
      attempt(10.5, { incidentType: 'false_start' }),
      attempt(10.3, { incidentType: 'lane_infringement' }),
      attempt(10.2),
    ]);
    expect(derivation.value).toBe(10.2);
    expect(derivation.outcome).toBe('valid');
    expect(derivation.incident).toBeNull();
  });

  it('is no_result without any valid attempt', () => {
    const derivation = deriveTrackTime([]);
    expect(derivation.value).toBeNull();
    expect(derivation.outcome).toBe('no_result');
  });
});

describe('deriveEffectiveResult', () => {
  it('incorporates valid manual override', () => {
    const derived = { value: 11.2, incident: null, outcome: 'valid' as const };
    const effective = deriveEffectiveResult(derived, 10.95);
    expect(effective.value).toBe(10.95);
    expect(effective.outcome).toBe('valid');
  });

  it('returns derived result when override is null', () => {
    const derived = { value: 11.2, incident: null, outcome: 'valid' as const };
    const effective = deriveEffectiveResult(derived, null);
    expect(effective.value).toBe(11.2);
    expect(effective.outcome).toBe('valid');
  });
});

describe('calculatePlacings', () => {
  it('ranks valid competition times ascending with deterministic tie placings', () => {
    const results = [
      { athleteId: 'a1', value: 10.5, outcome: 'valid' as const },
      { athleteId: 'a2', value: 10.2, outcome: 'valid' as const },
      { athleteId: 'a3', value: 10.5, outcome: 'valid' as const },
      { athleteId: 'a4', value: null, outcome: 'dq' as const },
    ];
    const placings = calculatePlacings(results);
    expect(placings.get('a2')).toBe(1);
    expect(placings.get('a1')).toBe(2);
    expect(placings.get('a3')).toBe(2);
    expect(placings.get('a4')).toBeNull();
  });
});

describe('checkPbSb', () => {
  it('calculates PB and calendar-year SB correctly', () => {
    const historical = [
      { value: 10.8, date: '2025-06-01', outcome: 'valid' as const },
      { value: 10.5, date: '2026-05-15', outcome: 'valid' as const },
    ];

    const res1 = checkPbSb(10.2, 'valid', '2026-07-01', historical);
    expect(res1).toEqual({ isPb: true, isSb: true });

    const res2 = checkPbSb(10.4, 'valid', '2026-07-01', historical);
    expect(res2).toEqual({ isPb: true, isSb: true });

    const res3 = checkPbSb(10.6, 'valid', '2026-07-01', historical);
    expect(res3).toEqual({ isPb: false, isSb: false });

    const res4 = checkPbSb(9.9, 'dq', '2026-07-01', historical);
    expect(res4).toEqual({ isPb: false, isSb: false });
  });
});
