import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAthleteDisciplineAnalysis,
  getCoachInjuryAnalysis,
  getCoachPerformanceAnalysis,
  getCoachRankingsAnalysis,
  getWorkspaceDisciplineAnalysis,
} from './analytics';

afterEach(() => vi.unstubAllGlobals());

describe('analytics API', () => {
  it('loads selected-athlete discipline analysis from the protected endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { athleteId: 'athlete-1' } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAthleteDisciplineAnalysis('athlete-1', '100m', '2026')).resolves.toEqual({ athleteId: 'athlete-1' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/analytics/athletes/athlete-1/disciplines/100m?year=2026`);
  });

  it('loads workspace rankings from the protected discipline endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { athletes: [] } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getWorkspaceDisciplineAnalysis('long_jump')).resolves.toEqual({ athletes: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/analytics/disciplines/long_jump/athletes`);
  });

  it('loads filtered coach performance analysis using URL search parameters', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { athletes: [] } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCoachPerformanceAnalysis({
      athleteIds: ['athlete-1', 'athlete-2'],
      discipline: '100m',
      dateFrom: '2026-01-01',
      dateTo: '2026-03-31',
      lifecycleStatus: 'active',
    })).resolves.toEqual({ athletes: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/analytics/coach/performance?athleteIds=athlete-1%2Cathlete-2&discipline=100m&dateFrom=2026-01-01&dateTo=2026-03-31&lifecycleStatus=active`);
  });

  it('loads filtered coach injury analysis using the injury endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { athletes: [] } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCoachInjuryAnalysis({
      athleteIds: ['athlete-1'],
      dateFrom: '2026-01-01',
      dateTo: '2026-03-31',
      lifecycleStatus: 'inactive',
    })).resolves.toEqual({ athletes: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/analytics/coach/injuries?athleteIds=athlete-1&dateFrom=2026-01-01&dateTo=2026-03-31&lifecycleStatus=inactive`);
  });

  it('loads discipline-specific coach rankings with their optional limit', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { athletes: [] } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCoachRankingsAnalysis({
      discipline: 'long_jump',
      dateFrom: '2026-01-01',
      dateTo: '2026-03-31',
      lifecycleStatus: 'all',
      limit: 10,
    })).resolves.toEqual({ athletes: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/analytics/coach/rankings?discipline=long_jump&dateFrom=2026-01-01&dateTo=2026-03-31&lifecycleStatus=all&limit=10`);
  });
});
