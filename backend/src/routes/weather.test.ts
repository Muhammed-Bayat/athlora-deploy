import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { createApp } from '../app.js';

const weatherService = vi.hoisted(() => ({ getCurrentWeather: vi.fn() }));

vi.mock('../services/weather.js', () => weatherService);

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
  pool: null,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const query = vi.fn();
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
  weatherService.getCurrentWeather.mockResolvedValue({
    timezone: 'Africa/Johannesburg',
    temperatureC: 24.8,
    apparentTemperatureC: 25.1,
    humidityPercent: 62,
    isDay: true,
    precipitationMm: 0,
    weatherCode: 2,
    windSpeedKmh: 12.4,
  });
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

describe('GET /api/v1/weather/current', () => {
  it('returns current conditions for validated coordinates through the stable API envelope', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/weather/current?latitude=-26.2041&longitude=28.0473')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      timezone: 'Africa/Johannesburg',
      temperatureC: 24.8,
      apparentTemperatureC: 25.1,
      humidityPercent: 62,
      isDay: true,
      precipitationMm: 0,
      weatherCode: 2,
      windSpeedKmh: 12.4,
    });
    expect(weatherService.getCurrentWeather).toHaveBeenCalledWith(-26.2041, 28.0473);
  });

  it('rejects out-of-range coordinates with a validation envelope', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/weather/current?latitude=91&longitude=28.0473')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'latitude', code: 'out_of_range' })],
      },
    });
    expect(weatherService.getCurrentWeather).not.toHaveBeenCalled();
  });

  it('rejects non-numeric coordinates', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/weather/current?latitude=abc&longitude=28.0473')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'latitude', code: 'invalid_format' })],
      },
    });
  });

  it('rejects an unknown query field', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/weather/current?latitude=-26.2&longitude=28.05&city=JHB')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'city', code: 'unknown_field' })],
      },
    });
    expect(weatherService.getCurrentWeather).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/weather/current?latitude=-26.2&longitude=28.05');

    expect(response.status).toBe(401);
    expect(weatherService.getCurrentWeather).not.toHaveBeenCalled();
  });
});