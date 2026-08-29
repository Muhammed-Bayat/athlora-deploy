import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { createApp } from '../app.js';

vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(() => 'keyset'), jwtVerify: vi.fn() }));
vi.mock('../db/client.js', () => ({ getPool: vi.fn(), pool: null }));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const SQUAD_ID = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();
const app = createApp();

function context(role: 'coach' | 'assistant' = 'coach') {
  return { rows: [{ user_id: USER_ID, auth0_id: 'auth0|coach-1', role, workspace_id: WORKSPACE_ID, workspace_role: role }] };
}
function squad(archived_at: Date | null = null) {
  return { id: SQUAD_ID, name: 'Sprint', archived_at, created_at: new Date('2026-08-01T10:00:00.000Z'), updated_at: new Date('2026-08-01T10:00:00.000Z') };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as never);
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|coach-1' } } as never);
});
afterEach(() => { delete process.env.AUTH0_DOMAIN; delete process.env.AUTH0_AUDIENCE; });

describe('squad routes', () => {
  it('lists only squads in the active workspace', async () => {
    query.mockResolvedValueOnce(context()).mockResolvedValueOnce({ rows: [squad()] });
    const response = await request(app).get('/api/v1/squads').set('Authorization', 'Bearer valid');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject([{ id: SQUAD_ID, name: 'Sprint', archivedAt: null }]);
    expect(query.mock.calls[1][1]).toEqual([WORKSPACE_ID]);
    expect(query.mock.calls[1][0]).toContain('workspace_id = $1');
    expect(query.mock.calls[1][1]).not.toContain(OTHER_WORKSPACE_ID);
  });

  it('allows coaches, but not assistants, to create squads', async () => {
    query.mockResolvedValueOnce(context()).mockResolvedValueOnce({ rows: [squad()] });
    const created = await request(app).post('/api/v1/squads').set('Authorization', 'Bearer valid').send({ name: 'Sprint' });
    expect(created.status).toBe(201);
    expect(query.mock.calls[1][1]).toEqual([WORKSPACE_ID, 'Sprint']);

    query.mockResolvedValueOnce(context('assistant'));
    const forbidden = await request(app).post('/api/v1/squads').set('Authorization', 'Bearer valid').send({ name: 'Throws' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('WORKSPACE_CAPABILITY_DENIED');
  });

  it('archives and restores a squad within the active workspace', async () => {
    query.mockResolvedValueOnce(context()).mockResolvedValueOnce({ rows: [squad(new Date('2026-08-02T10:00:00.000Z'))] });
    const archived = await request(app).delete(`/api/v1/squads/${SQUAD_ID}`).set('Authorization', 'Bearer valid');
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).toBe('2026-08-02T10:00:00.000Z');
    expect(query.mock.calls[1][1]).toEqual([SQUAD_ID, WORKSPACE_ID]);

    query.mockResolvedValueOnce(context()).mockResolvedValueOnce({ rows: [squad()] });
    const restored = await request(app).post(`/api/v1/squads/${SQUAD_ID}/unarchive`).set('Authorization', 'Bearer valid');
    expect(restored.status).toBe(200);
    expect(restored.body.data.archivedAt).toBeNull();
    expect(query.mock.calls[1][1]).toEqual([SQUAD_ID, WORKSPACE_ID]);
  });
});
