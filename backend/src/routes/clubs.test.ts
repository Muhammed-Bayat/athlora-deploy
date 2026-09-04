import request from 'supertest';
import { jwtVerify } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { getPool } from '../db/client.js';
import * as clubService from '../services/clubs.js';

vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(() => 'keyset'), jwtVerify: vi.fn() }));
vi.mock('../db/client.js', () => ({ getPool: vi.fn(), pool: null }));
vi.mock('../services/clubs.js', () => ({
  assertActiveClubWorkspace: vi.fn(),
  createClub: vi.fn(),
  createJoinRequest: vi.fn(),
  listClubJoinRequests: vi.fn(),
  listClubs: vi.fn(),
  listMyJoinRequests: vi.fn(),
  reviewJoinRequest: vi.fn(),
  withdrawJoinRequest: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-822222222222';
const CLUB_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();
const app = createApp();

function localUser() {
  return { rows: [{ user_id: USER_ID, auth0_id: 'auth0|user-1', role: 'coach', deletion_status: null }] };
}

function applicationUser(role: 'coach' | 'assistant' = 'coach') {
  return { rows: [{ ...localUser().rows[0], workspace_id: WORKSPACE_ID, workspace_role: role }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as never);
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|user-1' } } as never);
});

describe('club routes', () => {
  it('lists clubs with a verified local user that has no workspace membership', async () => {
    query.mockResolvedValueOnce(localUser());
    vi.mocked(clubService.listClubs).mockResolvedValue([]);

    const response = await request(app).get('/api/v1/clubs?q=track').set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], meta: { count: 0 } });
    expect(clubService.listClubs).toHaveBeenCalledWith('track');
  });

  it('creates a club without requiring an existing workspace membership', async () => {
    query.mockResolvedValueOnce(localUser());
    vi.mocked(clubService.createClub).mockResolvedValue({
      id: CLUB_ID, workspaceId: WORKSPACE_ID, name: 'Track Club', createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z',
    });

    const response = await request(app).post('/api/v1/clubs').set('Authorization', 'Bearer valid').send({ name: 'Track Club' });

    expect(response.status).toBe(201);
    expect(clubService.createClub).toHaveBeenCalledWith(USER_ID, 'Track Club');
  });

  it('requires the active club workspace and a coach to approve a request', async () => {
    query.mockResolvedValueOnce(applicationUser());
    vi.mocked(clubService.assertActiveClubWorkspace).mockResolvedValue(undefined);
    vi.mocked(clubService.reviewJoinRequest).mockResolvedValue({
      id: REQUEST_ID, clubId: CLUB_ID, userId: USER_ID, status: 'approved', reviewedBy: USER_ID, reviewedAt: '2026-09-04T00:00:00.000Z', createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z',
    });

    const response = await request(app)
      .post(`/api/v1/clubs/${CLUB_ID}/join-requests/${REQUEST_ID}/approve`)
      .set('Authorization', 'Bearer valid')
      .send({ role: 'assistant' });

    expect(response.status).toBe(200);
    expect(clubService.assertActiveClubWorkspace).toHaveBeenCalledWith(CLUB_ID, WORKSPACE_ID);
    expect(clubService.reviewJoinRequest).toHaveBeenCalledWith(CLUB_ID, REQUEST_ID, USER_ID, 'approved', 'assistant');
  });

  it('rejects approval by assistants before querying the club', async () => {
    query.mockResolvedValueOnce(applicationUser('assistant'));

    const response = await request(app)
      .post(`/api/v1/clubs/${CLUB_ID}/join-requests/${REQUEST_ID}/approve`)
      .set('Authorization', 'Bearer valid')
      .send({ role: 'coach' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('WORKSPACE_CAPABILITY_DENIED');
    expect(clubService.assertActiveClubWorkspace).not.toHaveBeenCalled();
  });
});
