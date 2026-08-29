import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { getAthleteStatisticsDetail } from '../services/statistics.js';
import { getDashboardSummary } from '../services/dashboard.js';
import type { AthleteStatisticsDetail, DashboardSummary } from '../types/domain.js';
import { createApp } from '../app.js';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
  pool: null,
}));

vi.mock('../services/statistics.js', () => ({
  getAthleteStatisticsDetail: vi.fn(),
}));

vi.mock('../services/dashboard.js', () => ({
  getDashboardSummary: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const query = vi.fn();
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|coach-1' } } as never);
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

afterEach(() => {
  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_AUDIENCE;
});

function synchronizedUser() {
  return { rows: [{ user_id: USER_ID, auth0_id: 'auth0|coach-1', role: 'coach' }] };
}

describe('aggregate API routes', () => {
  it('returns an owned athlete statistics detail envelope', async () => {
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
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [{ owned: 1 }] });
    vi.mocked(getAthleteStatisticsDetail).mockResolvedValue(statistics);

    const response = await request(app)
      .get(`/api/v1/athletes/${ATHLETE_ID}/statistics`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: statistics });
    expect(getAthleteStatisticsDetail).toHaveBeenCalledWith(USER_ID, ATHLETE_ID);
  });

  it('uses the generic not-found response for foreign athlete statistics', async () => {
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get(`/api/v1/athletes/${ATHLETE_ID}/statistics`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} },
    });
    expect(getAthleteStatisticsDetail).not.toHaveBeenCalled();
  });

  it('returns the stable dashboard envelope', async () => {
    const dashboard = {
      state: 'summary',
      asOfDate: '2026-08-17',
      athletesCount: 0,
      activeAthletesCount: 0,
      inactiveAthletesCount: 0,
      archivedAthletesCount: 0,
      statusReviewCount: 0,
      upcomingEventCount: 0,
      seasonPbs: 0,
      activeEvent: null,
      rosterSnapshot: [],
      upcomingEvents: [],
      recentResults: [],
      recentPbs: [],
    } satisfies DashboardSummary;
    query.mockResolvedValueOnce(synchronizedUser());
    vi.mocked(getDashboardSummary).mockResolvedValue(dashboard);

    const response = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: dashboard });
    expect(getDashboardSummary).toHaveBeenCalledWith(USER_ID);
  });

  it('requires authentication before either aggregate service runs', async () => {
    const [statisticsResponse, dashboardResponse] = await Promise.all([
      request(app).get(`/api/v1/athletes/${ATHLETE_ID}/statistics`),
      request(app).get('/api/v1/dashboard/summary'),
    ]);

    expect(statisticsResponse.status).toBe(401);
    expect(dashboardResponse.status).toBe(401);
    expect(getAthleteStatisticsDetail).not.toHaveBeenCalled();
    expect(getDashboardSummary).not.toHaveBeenCalled();
  });
});
