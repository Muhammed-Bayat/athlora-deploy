import request from 'supertest';
import { jwtVerify } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { createApp } from '../app.js';

const venueService = vi.hoisted(() => ({ searchVenues: vi.fn() }));
vi.mock('../services/venues.js', () => venueService);
vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(() => 'keyset'), jwtVerify: vi.fn() }));
vi.mock('../db/client.js', () => ({ getPool: vi.fn(), pool: null }));

const app = createApp();
const query = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|coach-1' } } as never);
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
  query.mockResolvedValue({ rows: [{ user_id: '11111111-1111-4111-8111-111111111111', auth0_id: 'auth0|coach-1', role: 'coach' }] });
  venueService.searchVenues.mockResolvedValue([{ displayName: 'Central Stadium', latitude: -26.2, longitude: 28.04 }]);
});

describe('GET /api/v1/venues/search', () => {
  it('requires authentication and returns the stable venue list', async () => {
    expect((await request(app).get('/api/v1/venues/search?q=Central')).status).toBe(401);
    const response = await request(app).get('/api/v1/venues/search?q=%20Central%20').set('Authorization', 'Bearer valid');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [{ displayName: 'Central Stadium', latitude: -26.2, longitude: 28.04 }], meta: { count: 1 } });
    expect(venueService.searchVenues).toHaveBeenCalledWith('Central');
  });

  it('rejects missing, overlong, and unknown query fields before the provider boundary', async () => {
    const response = await request(app).get('/api/v1/venues/search?city=x').set('Authorization', 'Bearer valid');
    expect(response.status).toBe(400);
    expect(response.body.error.details.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'q' }), expect.objectContaining({ path: 'city', code: 'unknown_field' })]));
    expect(venueService.searchVenues).not.toHaveBeenCalled();
  });
});
