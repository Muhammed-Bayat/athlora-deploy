import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AthleteStatisticsDetail, DashboardSummary } from '../types';
import { getDashboardSummary } from './dashboard';
import { getAthleteStatistics } from './statistics';

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('aggregate API clients', () => {
  it('gets the combined athlete statistics and history resource', async () => {
    const statistics = {
      athleteId: ATHLETE_ID,
      discipline: '100m',
      unit: 'seconds',
      pb: null,
      sb: null,
      resultsCount: 0,
      latestResult: null,
      latestOutcome: 'no_result',
      updatedAt: '2026-08-17T10:00:00.000Z',
      athlete: { id: ATHLETE_ID, name: 'Ari Runner', squadNames: [], archivedAt: null },
      resultCounts: {
        allTime: 0,
        currentYear: 0,
        competitionAllTime: 0,
        trainingAllTime: 0,
      },
      latest: null,
      recentResults: { competitions: [], training: [] },
    } satisfies AthleteStatisticsDetail;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: statistics })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAthleteStatistics(ATHLETE_ID)).resolves.toEqual(statistics);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/athletes/${ATHLETE_ID}/statistics`,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('gets the stable dashboard summary resource', async () => {
    const dashboard = {
      state: 'summary',
      asOfDate: '2026-08-17',
      athletesCount: 0,
      activeAthletesCount: 0,
      archivedAthletesCount: 0,
      upcomingEventCount: 0,
      seasonPbs: 0,
      activeEvent: null,
      rosterSnapshot: [],
      upcomingEvents: [],
      recentResults: [],
      recentPbs: [],
    } satisfies DashboardSummary;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: dashboard })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getDashboardSummary()).resolves.toEqual(dashboard);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/dashboard/summary`,
    );
  });
});
