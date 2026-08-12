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
  it('returns the best valid attempt', () => {
    const { value } = deriveFieldBest([attempt(6.42), attempt(6.61), attempt(6.55)]);
    expect(value).toBe(6.61);
  });

  it('ignores foul attempts', () => {
    const { value } = deriveFieldBest([attempt(7.1), attempt(0, { isFoul: true }), attempt(7.04)]);
    expect(value).toBe(7.1);
  });

  it('returns null when every attempt is foul', () => {
    const { value } = deriveFieldBest([attempt(0, { isFoul: true }), attempt(0, { isFoul: true })]);
    expect(value).toBeNull();
  });
});

describe('deriveTrackTime', () => {
  it('returns the finishing time from valid attempts', () => {
    const { value } = deriveTrackTime([attempt(11.32), attempt(11.2)]);
    expect(value).toBe(11.32);
  });

  it('voids the result on a DQ incident', () => {
    const { value, incident } = deriveTrackTime([attempt(10.9), attempt(10.9, { incidentType: 'dq' })]);
    expect(value).toBeNull();
    expect(incident).toBe('dq');
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
});