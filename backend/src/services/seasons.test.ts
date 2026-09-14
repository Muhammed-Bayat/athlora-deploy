import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../middleware/errors.js';
import { currentUtcYear, listAvailableSeasons, parseSeasonYear, seasonMetadata, seasonSql } from './seasons.js';

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

  it('adds bounded season parameters only for a selected year', () => {
    const parameters: unknown[] = ['workspace-id'];

    expect(seasonSql(parseSeasonYear('2024'), 'e.date', parameters)).toBe(' AND e.date >= $2::date AND e.date < $3::date');
    expect(parameters).toEqual(['workspace-id', '2024-01-01', '2025-01-01']);
    expect(seasonSql(parseSeasonYear('all'), 'e.date', parameters)).toBe('');
  });

  it('lists distinct event years with the current year and exposes season metadata', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ year: '2025' }, { year: 2024 }] });
    const now = new Date('2026-08-17T10:00:00.000Z');

    await expect(listAvailableSeasons({ query } as never, 'workspace-id', now)).resolves.toEqual([2025, 2024]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SELECT DISTINCT EXTRACT(YEAR FROM e.date)::integer AS year'), ['workspace-id', 2026]);
    expect(seasonMetadata(parseSeasonYear('2024'), [2026, 2024])).toEqual({
      selected: 2024,
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      available: [2026, 2024],
    });
  });
});
