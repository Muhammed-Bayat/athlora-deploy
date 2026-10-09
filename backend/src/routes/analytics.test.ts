import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getPool } from '../db/client.js';
import {
  getAthleteDisciplineAnalytics,
  getWorkspaceDisciplineAnalytics,
} from '../services/athleteAnalytics.js';
import {
  getCoachInjuryAnalytics,
  getCoachPerformanceAnalytics,
  getCoachRankingsAnalytics,
} from '../services/coachAnalytics.js';

vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(() => 'keyset'), jwtVerify: vi.fn() }));
vi.mock('../db/client.js', () => ({ getPool: vi.fn(), pool: null }));
vi.mock('../services/athleteAnalytics.js', () => ({
  getAthleteDisciplineAnalytics: vi.fn(),
  getWorkspaceDisciplineAnalytics: vi.fn(),
}));
vi.mock('../services/coachAnalytics.js', () => ({
  getCoachInjuryAnalytics: vi.fn(),
  getCoachPerformanceAnalytics: vi.fn(),
  getCoachRankingsAnalytics: vi.fn(),
}));

const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const athleteId = '33333333-3333-4333-8333-333333333333';
const query = vi.fn();
const app = createApp();

function context() {
  return { rows: [{ user_id: userId, auth0_id: 'auth0|coach-1', role: 'coach', workspace_id: workspaceId, workspace_role: 'coach' }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|coach-1' } } as never);
  vi.mocked(getPool).mockReturnValue({ query } as never);
});

afterEach(() => {
  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_AUDIENCE;
});

describe('analytics routes', () => {
  it('requires authentication before analytics reads', async () => {
    const response = await request(app).get(`/api/v1/analytics/athletes/${athleteId}/disciplines/100m`);

    expect(response.status).toBe(401);
    expect(getAthleteDisciplineAnalytics).not.toHaveBeenCalled();
  });

  it('requires authentication before workspace-wide discipline reads', async () => {
    const response = await request(app).get('/api/v1/analytics/disciplines/100m/athletes');

    expect(response.status).toBe(401);
    expect(getWorkspaceDisciplineAnalytics).not.toHaveBeenCalled();
  });

  it('returns an owned athlete direction-aware analysis', async () => {
    query.mockResolvedValueOnce(context()).mockResolvedValueOnce({ rows: [{ id: athleteId }] });
    vi.mocked(getAthleteDisciplineAnalytics).mockResolvedValue({
      athleteId, discipline: { code: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower' },
      season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' }, pb: 10.8, sb: 10.8,
      latest: null, first: null, average: 10.8, median: 10.8, improvement: null, recentTrend: null,
      resultCount: 1, recentResults: [], history: [],
    });

    const response = await request(app)
      .get(`/api/v1/analytics/athletes/${athleteId}/disciplines/100m?year=2026`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ pb: 10.8, discipline: { direction: 'lower' } });
    expect(getAthleteDisciplineAnalytics).toHaveBeenCalledWith(
      workspaceId,
      athleteId,
      '100m',
      { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' },
      expect.anything(),
    );
  });

  it('does not disclose a foreign athlete through the analytics route', async () => {
    query.mockResolvedValueOnce(context()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get(`/api/v1/analytics/athletes/${athleteId}/disciplines/100m`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} },
    });
    expect(getAthleteDisciplineAnalytics).not.toHaveBeenCalled();
  });

  it('uses the authenticated workspace when returning workspace-wide discipline analytics', async () => {
    query.mockResolvedValueOnce(context());
    vi.mocked(getWorkspaceDisciplineAnalytics).mockResolvedValue({
      discipline: { code: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower' },
      season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' },
      ranking: {
        basis: 'pb', direction: 'lower', ordering: 'Lower personal-best values rank first',
        tieHandling: 'Equal personal-best values share a rank; name and ID only order tied rows for display',
        unrankedHandling: 'Athletes without a valid result are returned after ranked athletes with rank null',
        factors: ['pb', 'sb', 'latest', 'first', 'average', 'median', 'improvement', 'recentTrend', 'resultCount'],
      },
      athletes: [],
    });

    const response = await request(app)
      .get('/api/v1/analytics/disciplines/100m/athletes?year=2026')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data.ranking).toMatchObject({ basis: 'pb', direction: 'lower' });
    expect(getWorkspaceDisciplineAnalytics).toHaveBeenCalledWith(
      workspaceId,
      '100m',
      { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' },
      expect.anything(),
    );
  });

  it('validates coach analytics query values before invoking a service', async () => {
    query.mockResolvedValueOnce(context());

    const response = await request(app)
      .get('/api/v1/analytics/coach/rankings?discipline=not-a-catalogue-code&limit=0')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(getCoachRankingsAnalytics).not.toHaveBeenCalled();
  });

  it('uses the authenticated workspace and normalized validated filters for coach performance', async () => {
    query.mockResolvedValueOnce(context());
    vi.mocked(getCoachPerformanceAnalytics).mockResolvedValue({
      selectedRange: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
      lifecycleStatus: 'active',
      athletes: [],
        comparison: {
          methodology: 'Eligible athlete-discipline changes are ranked by direction-aware percentage change from the first to latest valid result in the selected range; times improve when lower, while distances and heights improve when higher. Raw values from different disciplines are not compared directly.',
          eligibleAthleteDisciplineCount: 0,
          mostImproved: null,
          mostDeclined: null,
          insufficientDataReason: 'At least two valid normalized results in the selected range are required for each athlete-discipline comparison.',
          relativeImprovementRanking: {
            methodology: 'Athletes are ranked descriptively by their strongest eligible direction-aware first-to-latest percentage change in the selected range. Timed events improve when lower, while distances and heights improve when higher. Each athlete appears once with the discipline that produced that relative change; this is not an official athletics ranking or a comparison of raw performances across disciplines.',
            eligibility: 'At least two distinct valid normalized results with a positive first result are required for an athlete-discipline comparison.',
            limit: 50,
            eligibleAthleteCount: 0,
            entries: [],
            insufficientDataReason: 'At least two valid normalized results with a positive first result are required for each athlete before descriptive relative-improvement ranking is available.',
          },
        },
    });

    const response = await request(app)
      .get(`/api/v1/analytics/coach/performance?athleteIds=${athleteId}&discipline=100m&dateFrom=2026-01-01&dateTo=2026-03-31&lifecycleStatus=active`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      selectedRange: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
      comparison: { eligibleAthleteDisciplineCount: 0 },
    });
    expect(getCoachPerformanceAnalytics).toHaveBeenCalledWith(
      workspaceId,
      {
        athleteIds: [athleteId],
        discipline: '100m',
        dateRange: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
        lifecycleStatus: 'active',
      },
      expect.anything(),
    );
  });

  it('routes coach injury analytics through the authenticated workspace', async () => {
    query.mockResolvedValueOnce(context());
    vi.mocked(getCoachInjuryAnalytics).mockResolvedValue({
      selectedRange: { dateFrom: null, dateTo: null },
      lifecycleStatus: 'all',
      limitations: [
        'Indicators summarize recorded injuries only; they are not medical diagnoses or probability estimates.',
        'No workload, readiness, attendance, treatment, or recovery data is available to these indicators.',
      ],
      athletes: [],
      rosterSummary: {
        injuryRecordCount: 0,
        athletesWithRecordedInjuries: 0,
        mostCommonRecordedArea: null,
        mostCommonBodyRegion: null,
        athletesWithRepeatedInjuries: [],
        insufficientDataReason: 'No recorded injuries were found for the selected athletes and date range.',
      },
    });

    const response = await request(app)
      .get('/api/v1/analytics/coach/injuries')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data.rosterSummary).toMatchObject({ injuryRecordCount: 0, insufficientDataReason: expect.any(String) });
    expect(getCoachInjuryAnalytics).toHaveBeenCalledWith(
      workspaceId,
      { dateRange: { dateFrom: null, dateTo: null }, lifecycleStatus: 'all' },
      expect.anything(),
    );
  });
});
