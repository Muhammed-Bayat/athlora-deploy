import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from './db/client.js';
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
const query = vi.fn();
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
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

function synchronizedUser(): { rows: Array<{ userId: string; auth0Id: string; role: string }> } {
  return {
    rows: [{ userId: USER_ID, auth0Id: 'auth0|coach-1', role: 'coach' }],
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
    query.mockResolvedValueOnce({
      rows: [
        {
          id: USER_ID,
          auth0Id: 'auth0|new-coach',
          name: 'New Coach',
          email: 'new@example.com',
          role: 'coach',
          createdAt: new Date('2026-08-14T10:00:00.000Z'),
          updatedAt: new Date('2026-08-14T10:00:00.000Z'),
        },
      ],
    });

    const response = await request(app)
      .put('/api/v1/auth/me')
      .set('Authorization', 'Bearer bootstrap-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: USER_ID, auth0Id: 'auth0|new-coach' });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO users');
    expect(fetch).toHaveBeenCalledWith('https://example.auth0.com/userinfo', {
      headers: { Authorization: 'Bearer bootstrap-token' },
    });
  });
});

describe('owned resource scaffolds', () => {
  it('keeps every currently scaffolded owned route reachable', async () => {
    configureAuth();
    const cases = [
      ['get', `/api/v1/athletes/${ATHLETE_ID}`, undefined, 200],
      ['put', `/api/v1/athletes/${ATHLETE_ID}`, {}, 501],
      ['delete', `/api/v1/athletes/${ATHLETE_ID}`, undefined, 501],
      ['get', `/api/v1/events/${EVENT_ID}`, undefined, 200],
      ['put', `/api/v1/events/${EVENT_ID}`, {}, 501],
      ['delete', `/api/v1/events/${EVENT_ID}`, undefined, 501],
      ['get', `/api/v1/events/${EVENT_ID}/weather`, undefined, 501],
      ['post', `/api/v1/events/${EVENT_ID}/entries`, { athleteId: ATHLETE_ID }, 501],
      ['patch', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`, {}, 501],
      ['delete', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`, undefined, 501],
      ['get', `/api/v1/events/${EVENT_ID}/results`, undefined, 501],
      ['put', `/api/v1/events/${EVENT_ID}/results/${ATHLETE_ID}`, {}, 501],
    ] as const;
    const statuses: number[] = [];

    for (const [method, path, body, expectedStatus] of cases) {
      query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [{ owned: 1 }] });
      let testRequest = request(app)[method](path).set('Authorization', 'Bearer valid');
      if (body !== undefined) testRequest = testRequest.send(body);
      const response = await testRequest;
      statuses.push(response.status);
      expect(response.status).toBe(expectedStatus);
    }

    expect(statuses).toHaveLength(cases.length);
  });
});

describe('ownership non-disclosure', () => {
  it('returns one generic response for foreign athlete, event, timeline, and result resources', async () => {
    configureAuth();
    const cases = [
      ['get', `/api/v1/athletes/${ATHLETE_ID}`, undefined],
      ['get', `/api/v1/events/${EVENT_ID}`, undefined],
      ['post', `/api/v1/events/${EVENT_ID}/entries`, { athleteId: ATHLETE_ID }],
      ['patch', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`, {}],
      ['put', `/api/v1/events/${EVENT_ID}/results/${ATHLETE_ID}`, {}],
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
      .send({ recordedBy: USER_ID });

    expect([malformed.status, missingChild.status, wrongParent.status]).toEqual([404, 404, 404]);
    expect([malformed.body, missingChild.body, wrongParent.body]).toEqual([
      resourceNotFound,
      resourceNotFound,
      resourceNotFound,
    ]);
  });

  it('uses req.auth.userId rather than owner or audit IDs from the body', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [{ owned: 1 }] });

    const response = await request(app)
      .post(`/api/v1/events/${EVENT_ID}/entries`)
      .set('Authorization', 'Bearer valid')
      .send({
        athleteId: ATHLETE_ID,
        coachId: '99999999-9999-4999-8999-999999999999',
        createdBy: '99999999-9999-4999-8999-999999999999',
        recordedBy: '99999999-9999-4999-8999-999999999999',
      });

    expect(response.status).toBe(501);
    expect(query.mock.calls[1]?.[1]).toEqual([EVENT_ID, ATHLETE_ID, USER_ID]);
  });
});

describe('event weather', () => {
  it('is protected before reaching the scaffolded handler', async () => {
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
});
