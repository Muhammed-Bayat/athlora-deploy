import { describe, expect, it } from 'vitest';
import { currentSeasonYear, normalizeSeason, seasonLabel, seasonQueryValue } from './season';

describe('season utilities', () => {
  it('defaults invalid or missing query values to the current calendar year', () => {
    expect(normalizeSeason(null)).toBe(currentSeasonYear());
    expect(normalizeSeason('202')).toBe(currentSeasonYear());
    expect(normalizeSeason('summer')).toBe(currentSeasonYear());
  });

  it('preserves supported calendar years and all time', () => {
    expect(normalizeSeason('2024')).toBe('2024');
    expect(normalizeSeason('all')).toBe('all');
    expect(seasonLabel('all')).toBe('All time');
  });

  it('keeps the current-year default out of the URL while retaining explicit scopes', () => {
    expect(seasonQueryValue(currentSeasonYear())).toBeUndefined();
    expect(seasonQueryValue('all')).toBe('all');
    expect(seasonQueryValue('2024')).toBe('2024');
  });
});
