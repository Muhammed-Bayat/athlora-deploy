import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { type AthleteRow } from '../db/row-mappers.js';
import type { Athlete } from '../types/domain.js';
import { createApp } from '../app.js';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
  pool: null,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const ATHLETE_ID_2 = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
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

function synchronizedUser(): { rows: Array<{ user_id: string; auth0_id: string; role: string }> } {
  return {
    rows: [{ user_id: USER_ID, auth0_id: 'auth0|coach-1', role: 'coach' }],
  };
}

const resourceNotFound = {
  error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} },
};

function athleteRow(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: ATHLETE_ID,
    coach_id: USER_ID,
    name: 'Ari Runner',
    dob: '2010-04-12',
    gender: null,
    squad: 'Sprint',
    notes: null,
    archived_at: null,
    created_at: new Date('2026-08-01T09:00:00.000Z'),
    updated_at: new Date('2026-08-01T09:00:00.000Z'),
    ...overrides,
  };
}

function athleteBody(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: ATHLETE_ID,
    coachId: USER_ID,
    name: 'Ari Runner',
    dob: '2010-04-12',
    gender: null,
    squad: 'Sprint',
    notes: null,
    archivedAt: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('GET /api/v1/athletes', () => {
  it('lists the active roster scoped to the coach', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [athleteRow()] });

    const response = await request(app)
      .get('/api/v1/athletes')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [athleteBody()], meta: { count: 1 } });
    const [sql, parameters] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/archived_at IS NULL/);
    expect(sql).toMatch(/workspace_id = \$1/);
    expect(parameters).toEqual([USER_ID]);
  });

  it('includes archived athletes with includeArchived=true', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({
        rows: [
          athleteRow(),
          athleteRow({
            id: ATHLETE_ID_2,
            name: 'Shelved Runner',
            archived_at: new Date('2026-08-02T10:00:00.000Z'),
          }),
        ],
      });

    const response = await request(app)
      .get('/api/v1/athletes?includeArchived=true')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: expect.any(Array), meta: { count: 2 } });
    const [sql] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).not.toMatch(/archived_at IS NULL/);
  });

  it('filters by name and squad', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [athleteRow()] });

    const response = await request(app)
      .get('/api/v1/athletes?name=ari&squad=Sprint')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [athleteBody()], meta: { count: 1 } });
    const [sql, parameters] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('name ILIKE $2');
    expect(sql).toContain('squad = $3');
    expect(parameters).toEqual([USER_ID, '%ari%', 'Sprint']);
  });

  it('rejects an invalid query value with the validation envelope', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/athletes?includeArchived=banana')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [
          expect.objectContaining({ path: 'includeArchived', code: 'invalid_value' }),
        ],
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('rejects an unknown query field', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/athletes?page=1')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'page', code: 'unknown_field' })],
      },
    });
  });
});

describe('POST /api/v1/athletes', () => {
  it('creates an athlete scoped to the requesting coach', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [athleteRow()] });

    const response = await request(app)
      .post('/api/v1/athletes')
      .set('Authorization', 'Bearer valid')
      .send({ name: 'Ari Runner', dob: '2010-04-12', squad: 'Sprint' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: athleteBody() });
    const [sql, parameters] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO athletes');
    expect(parameters).toEqual([USER_ID, USER_ID, 'Ari Runner', '2010-04-12', null, 'Sprint', null]);
  });

  it('rejects an invalid create payload', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .post('/api/v1/athletes')
      .set('Authorization', 'Bearer valid')
      .send({ name: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'name', code: 'blank' })],
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('rejects coach-supplied ownership ids before a write query', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .post('/api/v1/athletes')
      .set('Authorization', 'Bearer valid')
      .send({ name: 'Ari Runner', coachId: USER_ID, createdBy: USER_ID });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [
          expect.objectContaining({ path: 'coachId', code: 'unknown_field' }),
          expect.objectContaining({ path: 'createdBy', code: 'unknown_field' }),
        ],
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });
});

describe('GET /api/v1/athletes/:id', () => {
  it('returns the owned athlete', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [athleteRow()] });

    const response = await request(app)
      .get(`/api/v1/athletes/${ATHLETE_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: athleteBody() });
  });

  it('hides a foreign athlete with the generic error before the detail query', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get(`/api/v1/athletes/${ATHLETE_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('returns the generic error for a malformed id without an ownership query', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/athletes/not-a-uuid')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
    expect(query).toHaveBeenCalledOnce();
  });
});

describe('PUT /api/v1/athletes/:id', () => {
  it('replaces an owned athlete without clearing the archived state', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [athleteRow({ name: 'Ari Two', gender: 'f' })] });

    const response = await request(app)
      .put(`/api/v1/athletes/${ATHLETE_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({ name: 'Ari Two', gender: 'f' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: athleteBody({ name: 'Ari Two', gender: 'f' }) });
    const [sql] = query.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain('UPDATE athletes');
    expect(sql).not.toContain('archived_at =');
  });

  it('rejects an invalid replacement payload', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .put(`/api/v1/athletes/${ATHLETE_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'name', code: 'required' })],
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('hides replacement of a foreign athlete', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .put(`/api/v1/athletes/${ATHLETE_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({ name: 'Ari Two' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
  });
});

describe('DELETE /api/v1/athletes/:id', () => {
  it('archives an owned athlete via an update, never a delete', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [athleteRow({ archived_at: new Date('2026-08-03T10:00:00.000Z') })] });

    const response = await request(app)
      .delete(`/api/v1/athletes/${ATHLETE_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data.archivedAt).toBe('2026-08-03T10:00:00.000Z');
    const [sql] = query.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain('archived_at = now()');
    expect(sql).not.toContain('DELETE FROM');
  });

  it('hides a foreign athlete from archival', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete(`/api/v1/athletes/${ATHLETE_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
  });
});

describe('POST /api/v1/athletes/:id/unarchive', () => {
  it('restores an archived athlete', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [athleteRow({ archived_at: null })] });

    const response = await request(app)
      .post(`/api/v1/athletes/${ATHLETE_ID}/unarchive`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data.archivedAt).toBeNull();
    const [sql] = query.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain('archived_at = NULL');
  });

  it('hides a foreign athlete from unarchival', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post(`/api/v1/athletes/${ATHLETE_ID}/unarchive`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
  });
});
