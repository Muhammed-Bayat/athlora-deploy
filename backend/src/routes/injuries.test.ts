import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import { createApp } from '../app.js';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
  pool: null,
}));

vi.mock('../db/transaction.js', () => ({
  withTransaction: vi.fn(),
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
  vi.mocked(withTransaction).mockImplementation(async (operation) => operation({ query } as never));
});

afterEach(() => {
  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_AUDIENCE;
});

function configureAuth(subject = 'auth0|coach-1'): void {
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: subject } } as never);
}

function synchronizedUser(role = 'coach'): { rows: Array<{ user_id: string; auth0_id: string; role: string; workspace_id: string; workspace_role: string }> } {
  return {
    rows: [
      {
        user_id: USER_ID,
        auth0_id: 'auth0|coach-1',
        role,
        workspace_id: WORKSPACE_ID,
        workspace_role: role,
      },
    ],
  };
}

describe('injuries routes', () => {
  it('lists injuries when authorized', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ id: ATHLETE_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: ATHLETE_ID }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get(`/api/v1/athletes/${ATHLETE_ID}/injuries`)
      .set('Authorization', 'Bearer token')
      .set('X-Workspace-Id', WORKSPACE_ID);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('forbids assistants from creating injuries', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser('assistant'));

    const response = await request(app)
      .post(`/api/v1/athletes/${ATHLETE_ID}/injuries`)
      .set('Authorization', 'Bearer token')
      .set('X-Workspace-Id', WORKSPACE_ID)
      .send({
        bodyRegion: 'Leg',
        area: 'Knee',
        side: 'Left',
        severity: 'Moderate',
        occurrenceDate: '2026-08-30',
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('WORKSPACE_CAPABILITY_DENIED');
  });
});
