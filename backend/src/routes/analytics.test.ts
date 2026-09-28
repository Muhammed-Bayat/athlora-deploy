import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getPool } from '../db/client.js';
import {
  getAthleteDisciplineAnalytics,
  getSquadDisciplineAnalytics,
  getWorkspaceDisciplineAnalytics,
} from '../services/athleteAnalytics.js';

vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(() => 'keyset'), jwtVerify: vi.fn() }));
vi.mock('../db/client.js', () => ({ getPool: vi.fn(), pool: null }));
vi.mock('../services/athleteAnalytics.js', () => ({
  getAthleteDisciplineAnalytics: vi.fn(),
  getSquadDisciplineAnalytics: vi.fn(),
  getWorkspaceDisciplineAnalytics: vi.fn(),
}));

const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const athleteId = '33333333-3333-4333-8333-333333333333';
const squadId = '44444444-4444-4444-8444-444444444444';
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

  it('returns squad ranking factors through the protected workspace route', async () => {
    query.mockResolvedValueOnce(context());
    vi.mocked(getSquadDisciplineAnalytics).mockResolvedValue({
      squad: { id: squadId, name: 'Jumps' },
      discipline: { code: 'long_jump', label: 'Long jump', unit: 'metres', precision: 2, direction: 'higher' },
      season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' },
      ranking: {
        basis: 'pb', direction: 'higher', ordering: 'Higher personal-best values rank first',
        tieHandling: 'Equal personal-best values share a rank; name and ID only order tied rows for display',
        unrankedHandling: 'Athletes without a valid result are returned after ranked athletes with rank null',
        factors: ['pb', 'sb', 'latest', 'first', 'average', 'median', 'improvement', 'recentTrend', 'resultCount'],
      },
      athletes: [],
    });

    const response = await request(app)
      .get(`/api/v1/analytics/squads/${squadId}/disciplines/long_jump?year=2026`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data.ranking).toMatchObject({ basis: 'pb', direction: 'higher' });
    expect(response.body.data.ranking).not.toHaveProperty('score');
    expect(getSquadDisciplineAnalytics).toHaveBeenCalledWith(
      workspaceId,
      squadId,
      'long_jump',
      { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' },
      expect.anything(),
    );
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
});
