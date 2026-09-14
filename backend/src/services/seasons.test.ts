import { describe, expect, it } from 'vitest';
import { ApiError } from '../middleware/errors.js';
import { currentUtcYear, parseSeasonYear } from './seasons.js';

describe('season scopes', () => {
  it('uses the UTC calendar year and inclusive/exclusive date boundaries', () => {
    expect(currentUtcYear(new Date('2026-01-01T00:00:00.000Z'))).toBe(2026);
    expect(parseSeasonYear(undefined, new Date('2025-12-31T23:59:59.999Z'))).toEqual({
      selected: 2025, startDate: '2025-01-01', endDate: '2026-01-01',
    });
    expect(parseSeasonYear('2024')).toEqual({
      selected: 2024, startDate: '2024-01-01', endDate: '2025-01-01',
    });
  });

  it('supports all-time and rejects non-Gregorian year values', () => {
    expect(parseSeasonYear('all')).toEqual({ selected: 'all', startDate: null, endDate: null });
    for (const value of ['24', '0200', '0000', '20240', 'current']) {
      expect(() => parseSeasonYear(value)).toThrow(ApiError);
    }
  });
});
