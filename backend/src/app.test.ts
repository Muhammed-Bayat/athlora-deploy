import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const app = createApp();

describe('health', () => {
  it('reports ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('athletes', () => {
  it('returns an empty scaffolded list', async () => {
    const response = await request(app).get('/api/v1/athletes');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], meta: { count: 0 } });
  });
});

describe('event weather', () => {
  it('is scaffolded with the standard error shape', async () => {
    const response = await request(app).get('/api/v1/events/abc-123/weather');
    expect(response.status).toBe(501);
    expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
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
    expect(response.status).toBe(501);
    expect(response.body.error).toBeDefined();
  });
});