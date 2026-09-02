import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { getTwoAthleteComparison } from '../services/comparison.js';
import { ApiError } from '../middleware/errors.js';
import type { ComparisonDetail } from '../types/domain.js';
import { createApp } from '../app.js';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
  pool: null,
}));

vi.mock('../services/comparison.js', () => ({
  getTwoAthleteComparison: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_1_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_2_ID = '44444444-4444-4444-8444-444444444444';
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

describe('comparison API route', () => {
  it('returns a two-athlete comparison envelope', async () => {
    const comparison: ComparisonDetail = {
      athletes: [
        {
          athlete: { id: ATHLETE_1_ID, name: 'Athlete One', squadNames: [], archivedAt: null },
          pb: 11.20,
          latestEffectiveResult: 11.20,
          latestEffectiveOutcome: 'valid',
          validResultCount: 3,
          totalResultCount: 3,
          average: 11.33,
          consistency: 0.12,
          improvement: 0.30,
          progression: [],
        },
        {
          athlete: { id: ATHLETE_2_ID, name: 'Athlete Two', squadNames: [], archivedAt: null },
          pb: 11.80,
          latestEffectiveResult: 11.80,
          latestEffectiveOutcome: 'valid',
          validResultCount: 1,
          totalResultCount: 1,
          average: 11.80,
          consistency: null,
          improvement: null,
          progression: [],
        },
      ],
    };

    query.mockResolvedValueOnce(synchronizedUser());
    vi.mocked(getTwoAthleteComparison).mockResolvedValue(comparison);

    const response = await request(app)
      .get(`/api/v1/athletes/comparison?athlete1Id=${ATHLETE_1_ID}&athlete2Id=${ATHLETE_2_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: comparison });
    expect(getTwoAthleteComparison).toHaveBeenCalledWith(USER_ID, ATHLETE_1_ID, ATHLETE_2_ID);
  });

  it('rejects duplicate athlete IDs', async () => {
    query.mockResolvedValueOnce(synchronizedUser());
    vi.mocked(getTwoAthleteComparison).mockRejectedValue(
      new ApiError(400, 'DUPLICATE_ATHLETE_ID', 'Exactly two distinct athlete IDs are required'),
    );

    const response = await request(app)
      .get(`/api/v1/athletes/comparison?athlete1Id=${ATHLETE_1_ID}&athlete2Id=${ATHLETE_1_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DUPLICATE_ATHLETE_ID');
  });

  it('returns 404 for foreign/missing athlete IDs', async () => {
    query.mockResolvedValueOnce(synchronizedUser());
    vi.mocked(getTwoAthleteComparison).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Resource not found'),
    );

    const response = await request(app)
      .get(`/api/v1/athletes/comparison?athlete1Id=${ATHLETE_1_ID}&athlete2Id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .get(`/api/v1/athletes/comparison?athlete1Id=${ATHLETE_1_ID}&athlete2Id=${ATHLETE_2_ID}`);

    expect(response.status).toBe(401);
    expect(getTwoAthleteComparison).not.toHaveBeenCalled();
  });
});
