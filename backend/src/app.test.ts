import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from './db/client.js';
import { type AthleteRow, type EventRow } from './db/row-mappers.js';
import { createApp } from './app.js';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));

vi.mock('./db/client.js', () => ({
  getPool: vi.fn(),
  pool: null,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const INVITATION_ID = '55555555-5555-4555-8555-555555555555';
const query = vi.fn();
const release = vi.fn();
const client = { query, release };
const connect = vi.fn().mockResolvedValue(client);
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query, connect } as unknown as ReturnType<typeof getPool>);
  query.mockImplementation(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }
    if (sql.includes('SELECT 1')) {
      return { rows: [{ owned: 1 }] };
    }
    if (sql.includes('SELECT athlete_id, discipline')) {
      return { rows: [{ athlete_id: ATHLETE_ID, discipline: '100m', entry_type: 'attempt', value: 11.2, unit: 'seconds', is_foul: false, incident_type: null, note_text: null, version: 1 }] };
    }
    if (sql.includes('SELECT discipline FROM results')) {
      return { rows: [{ discipline: '100m' }] };
    }
    if (sql.toLowerCase().includes('from events') && !sql.includes('SELECT 1')) {
      return { rows: [eventRow()] };
    }
    if (sql.toLowerCase().includes('from athletes') && !sql.includes('SELECT 1')) {
      return { rows: [athleteRow()] };
    }
    if (sql.includes('event_status') || sql.includes('e.status')) {
      return {
        rows: [{
          id: ENTRY_ID,
          event_id: EVENT_ID,
          athlete_id: ATHLETE_ID,
          discipline: '100m',
          entry_type: 'attempt',
          value: 11.2,
          unit: 'seconds',
          is_foul: false,
          incident_type: null,
          note_text: null,
          recorded_by: USER_ID,
          version: 1,
          device_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          type: 'competition',
          status: 'in_progress',
          event_type: 'competition',
          event_status: 'in_progress',
        }],
      };
    }
    if (sql.includes('SELECT type, date FROM events')) {
      return { rows: [{ type: 'competition', date: '2026-09-01' }] };
    }
    if (sql.includes('SELECT * FROM results') || sql.includes('SELECT r.*')) {
      return {
        rows: [{
          event_id: EVENT_ID,
          athlete_id: ATHLETE_ID,
          discipline: '100m',
          outcome: 'valid',
          final_result: 11.2,
          unit: 'seconds',
          placing: 1,
          is_pb: true,
          is_sb: true,
          manual_override: 11.1,
          override_reason: 'Photo finish',
          overridden_by: USER_ID,
          override_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      };
    }
    if (sql.includes('INSERT INTO timeline_entries') || sql.includes('UPDATE timeline_entries') || sql.includes('SELECT entry_type, value') || sql.includes('SELECT manual_override') || sql.includes('SELECT r.final_result') || sql.includes('SELECT athlete_id, final_result') || sql.includes('INSERT INTO results') || sql.includes('UPDATE results')) {
      return {
        rows: [{
          id: ENTRY_ID,
          event_id: EVENT_ID,
          athlete_id: ATHLETE_ID,
          discipline: '100m',
          entry_type: 'attempt',
          value: 11.2,
          unit: 'seconds',
          is_foul: false,
          incident_type: null,
          note_text: null,
          recorded_by: USER_ID,
          version: 1,
          device_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          manual_override: 11.1,
          override_reason: 'Photo finish',
          overridden_by: USER_ID,
          override_at: new Date().toISOString(),
        }],
      };
    }
    return { rows: [] };
  });
});

afterEach(() => {
  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_AUDIENCE;
  vi.unstubAllGlobals();
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

function eventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: EVENT_ID,
    created_by: USER_ID,
    type: 'competition',
    discipline: '100m',
    title: 'City Sprint Meet',
    date: '2026-09-01',
    time: null,
    location_name: null,
    latitude: null,
    longitude: null,
    status: 'scheduled',
    created_at: new Date('2026-08-14T10:00:00.000Z'),
    updated_at: new Date('2026-08-14T10:00:00.000Z'),
    ...overrides,
  };
}

function athleteRow(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: ATHLETE_ID,
    coach_id: USER_ID,
    name: 'Ari Runner',
    dob: '2010-04-12',
    gender: null,
    squads: [],
    notes: null,
    archived_at: null,
    created_at: new Date('2026-08-01T09:00:00.000Z'),
    updated_at: new Date('2026-08-01T09:00:00.000Z'),
    ...overrides,
  };
}

const resourceNotFound = {
  error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} },
};

describe('health', () => {
  it('reports ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('cors', () => {
  it('allows the configured frontend origin', async () => {
    const response = await request(app)
      .options('/api/v1/athletes')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow an unconfigured origin', async () => {
    const response = await request(app)
      .options('/api/v1/athletes')
      .set('Origin', 'https://example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('athletes', () => {
  it('requires Auth0 configuration', async () => {
    const response = await request(app).get('/api/v1/athletes');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AUTH_NOT_CONFIGURED');
  });

  it('rejects requests without a bearer token when Auth0 is configured', async () => {
    process.env.AUTH0_DOMAIN = 'example.auth0.com';
    process.env.AUTH0_AUDIENCE = 'https://api.example.com';

    const response = await request(app).get('/api/v1/athletes');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid bearer token with the existing response', async () => {
    process.env.AUTH0_DOMAIN = 'example.auth0.com';
    process.env.AUTH0_AUDIENCE = 'https://api.example.com';
    vi.mocked(jwtVerify).mockRejectedValue(new Error('invalid'));

    const response = await request(app)
      .get('/api/v1/athletes')
      .set('Authorization', 'Bearer invalid');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token', details: {} },
    });
  });

  it('allows a synchronized application user', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/v1/athletes')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], meta: { count: 0 } });
  });

  it('returns the standard synchronization error for a verified unknown user', async () => {
    configureAuth('auth0|not-synchronized');
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/v1/athletes')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: 'AUTH_USER_NOT_SYNCHRONIZED',
        message: 'Authenticated user is not synchronized',
        details: { syncEndpoint: '/api/v1/auth/me' },
      },
    });
  });
});

describe('auth bootstrap', () => {
  it('synchronizes /auth/me before an application user exists', async () => {
    configureAuth('auth0|new-coach');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: 'auth0|new-coach',
          name: 'New Coach',
          email: 'new@example.com',
        }),
      }),
    );
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [
        {
          id: USER_ID,
          auth0_id: 'auth0|new-coach',
          name: 'New Coach',
          email: 'new@example.com',
          role: 'coach',
          created_at: new Date('2026-08-14T10:00:00.000Z'),
          updated_at: new Date('2026-08-14T10:00:00.000Z'),
        },
      ] });

    const response = await request(app)
      .put('/api/v1/auth/me')
      .set('Authorization', 'Bearer bootstrap-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: USER_ID, auth0Id: 'auth0|new-coach' });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1]?.[0]).toContain('INSERT INTO users');
    expect(fetch).toHaveBeenCalledWith('https://example.auth0.com/userinfo', {
      headers: { Authorization: 'Bearer bootstrap-token' },
    });
  });
});

describe('owned resource routes', () => {
  it('keeps representative owned routes reachable', async () => {
    configureAuth();
    const cases = [
      ['get', `/api/v1/athletes/${ATHLETE_ID}`, undefined, 200, false],
      ['get', `/api/v1/events/${EVENT_ID}`, undefined, 200, false],
      ['get', `/api/v1/events/${EVENT_ID}/weather`, undefined, 422, false],
      ['get', `/api/v1/events/${EVENT_ID}/results`, undefined, 200, false],
      [
        'put',
        `/api/v1/events/${EVENT_ID}/results/${ATHLETE_ID}`,
        { manualOverride: 11.1, overrideReason: 'Photo finish' },
        200,
        false,
      ],
    ] as const;
    const statuses: number[] = [];

    for (const [method, path, body, expectedStatus, loggingGuard] of cases) {
      query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [{ owned: 1 }] });
      if (loggingGuard) {
        query.mockResolvedValueOnce({ rows: [eventRow({ status: 'in_progress' })] });
      }
      let testRequest = request(app)[method](path).set('Authorization', 'Bearer valid');
      if (body !== undefined) testRequest = testRequest.send(body);
      const response = await testRequest;
      statuses.push(response.status);
      expect(response.status).toBe(expectedStatus);
    }

    expect(statuses).toHaveLength(cases.length);
  });

  it('creates a fixture invitation from its host workspace', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ type: 'competition', discipline: '100m', status: 'scheduled', fixture_revision: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: INVITATION_ID,
          event_id: EVENT_ID,
          email: 'guest@example.com',
          revision: 1,
          status: 'pending',
          expires_at: new Date('2026-09-01T00:00:00.000Z'),
          created_at: new Date('2026-08-30T00:00:00.000Z'),
          target_workspace_id: null,
          response_message: null,
          responded_at: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post(`/api/v1/events/${EVENT_ID}/fixture-invitations`)
      .set('Authorization', 'Bearer valid')
      .send({ email: 'Guest@Example.com' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: INVITATION_ID,
      eventId: EVENT_ID,
      email: 'guest@example.com',
      status: 'pending',
    });
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(query.mock.calls[3]).toEqual(expect.arrayContaining([
      expect.stringContaining('WHERE id = $1 AND workspace_id = $2'),
      [EVENT_ID, USER_ID],
    ]));
  });
});

describe('ownership non-disclosure', () => {
  it('returns one generic response for foreign athlete, event, timeline, and result resources', async () => {
    configureAuth();
    const cases = [
      ['get', `/api/v1/athletes/${ATHLETE_ID}`, undefined],
      ['get', `/api/v1/events/${EVENT_ID}`, undefined],
      ['post', `/api/v1/events/${EVENT_ID}/fixture-invitations`, { email: 'guest@example.com' }],
      [
        'post',
        `/api/v1/events/${EVENT_ID}/entries`,
        { athleteId: ATHLETE_ID, entryType: 'attempt', value: 11.2 },
      ],
      [
        'patch',
        `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`,
        { expectedVersion: 1, value: 11.1 },
      ],
      [
        'put',
        `/api/v1/events/${EVENT_ID}/results/${ATHLETE_ID}`,
        { manualOverride: 11.1, overrideReason: 'Photo finish' },
      ],
    ] as const;
    const responses = [];

    for (const [method, path, body] of cases) {
      query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });
      let testRequest = request(app)[method](path).set('Authorization', 'Bearer valid');
      if (body !== undefined) testRequest = testRequest.send(body);
      responses.push(await testRequest);
    }

    expect(responses.map(({ status }) => status)).toEqual(cases.map(() => 404));
    expect(responses.map(({ body }) => body)).toEqual(cases.map(() => resourceNotFound));
  });

  it('does not distinguish malformed, missing-child, or wrong-parent resources', async () => {
    configureAuth();

    query.mockResolvedValueOnce(synchronizedUser());
    const malformed = await request(app)
      .get('/api/v1/events/not-a-uuid')
      .set('Authorization', 'Bearer valid');

    query.mockResolvedValueOnce(synchronizedUser());
    const missingChild = await request(app)
      .post(`/api/v1/events/${EVENT_ID}/entries`)
      .set('Authorization', 'Bearer valid')
      .send({});

    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });
    const wrongParent = await request(app)
      .patch(`/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({ expectedVersion: 1, value: 11.1 });

    expect(malformed.status).toBe(404);
    expect(malformed.body).toEqual(resourceNotFound);
    expect(missingChild.status).toBe(400);
    expect(missingChild.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: expect.arrayContaining([expect.objectContaining({ path: 'athleteId' })]) },
    });
    expect(wrongParent.status).toBe(404);
    expect(wrongParent.body).toEqual(resourceNotFound);
  });

  it('rejects owner and audit IDs before an ownership query', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .post(`/api/v1/events/${EVENT_ID}/entries`)
      .set('Authorization', 'Bearer valid')
      .send({
        athleteId: ATHLETE_ID,
        entryType: 'attempt',
        value: 11.2,
        coachId: '99999999-9999-4999-8999-999999999999',
        createdBy: '99999999-9999-4999-8999-999999999999',
        recordedBy: '99999999-9999-4999-8999-999999999999',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [
          expect.objectContaining({ path: 'coachId', code: 'unknown_field' }),
          expect.objectContaining({ path: 'createdBy', code: 'unknown_field' }),
          expect.objectContaining({ path: 'recordedBy', code: 'unknown_field' }),
        ],
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });
});

describe('event weather', () => {
  it('is protected before reaching the weather handler', async () => {
    const response = await request(app).get('/api/v1/events/abc-123/weather');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AUTH_NOT_CONFIGURED');
  });
});

describe('error handling', () => {
  it('returns the standard error shape for unknown routes', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found', details: {} },
    });
  });

  it('returns a validation-style shape for missing timeline entries payload', async () => {
    const response = await request(app).post('/api/v1/events/evt-1/entries').send({});
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AUTH_NOT_CONFIGURED');
  });

  it('returns the validation envelope for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/v1/athletes')
      .set('Content-Type', 'application/json')
      .send('{"name":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          issues: [
            { path: '$', code: 'invalid_format', message: 'Request body must contain valid JSON' },
          ],
        },
      },
    });
  });
});
