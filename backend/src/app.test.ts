import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const app = createApp();

afterEach(() => {
  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_AUDIENCE;
});

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
