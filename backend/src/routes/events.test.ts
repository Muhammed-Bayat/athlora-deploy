import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { type EventRow } from '../db/row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import type { AthleticsEvent } from '../types/domain.js';
import { createApp } from '../app.js';

const timelineService = vi.hoisted(() => ({
  createTimelineEntry: vi.fn(),
  updateTimelineEntry: vi.fn(),
  removeTimelineEntry: vi.fn(),
  recomputeEventResults: vi.fn(),
}));
const weatherService = vi.hoisted(() => ({ getEventWeatherForecast: vi.fn() }));

vi.mock('../services/timeline.js', () => timelineService);
vi.mock('../services/weather.js', () => weatherService);

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

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const query = vi.fn();
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
  vi.mocked(withTransaction).mockImplementation(async (operation) =>
    operation({ query } as never),
  );
  weatherService.getEventWeatherForecast.mockResolvedValue({
    date: '2026-09-01',
    timezone: 'Africa/Johannesburg',
    weatherCode: 2,
    temperatureMinC: 13.4,
    temperatureMaxC: 24.8,
    precipitationProbabilityMaxPercent: 20,
    windSpeedMaxKmh: 18.1,
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

const resourceNotFound = {
  error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} },
};

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

function eventBody(overrides: Partial<AthleticsEvent> = {}): AthleticsEvent {
  return {
    id: EVENT_ID,
    createdBy: USER_ID,
    type: 'competition',
    discipline: '100m',
    title: 'City Sprint Meet',
    date: '2026-09-01',
    time: null,
    locationName: null,
    latitude: null,
    longitude: null,
    status: 'scheduled',
    createdAt: '2026-08-14T10:00:00.000Z',
    updatedAt: '2026-08-14T10:00:00.000Z',
    ...overrides,
  };
}

describe('GET /api/v1/events', () => {
  it('lists the owned events with stable ordering', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [eventRow()] });

    const response = await request(app)
      .get('/api/v1/events')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [eventBody()], meta: { count: 1 } });
    const [sql, parameters] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/created_by = \$1/);
    expect(sql).toMatch(/ORDER BY date ASC, time ASC NULLS LAST, created_at ASC, id ASC/);
    expect(parameters).toEqual([USER_ID]);
  });

  it('applies type, status, and date range filters', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/v1/events?type=training&status=in_progress&dateFrom=2026-08-01&dateTo=2026-08-31')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    const [sql, parameters] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('type = $2');
    expect(sql).toContain('status = $3');
    expect(sql).toContain('date >= $4');
    expect(sql).toContain('date <= $5');
    expect(parameters).toEqual([USER_ID, 'training', 'in_progress', '2026-08-01', '2026-08-31']);
  });

  it('rejects an invalid filter value with the validation envelope', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/events?status=done')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'status', code: 'invalid_value' })],
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('rejects an inverted date range', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/events?dateFrom=2026-08-31&dateTo=2026-08-01')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'dateFrom', code: 'invalid_range' })],
      },
    });
  });

  it('rejects an unknown query field', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/events?page=1')
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

describe('POST /api/v1/events', () => {
  it('creates an event scoped to the requesting coach with discipline fixed to 100m', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [eventRow()] });

    const response = await request(app)
      .post('/api/v1/events')
      .set('Authorization', 'Bearer valid')
      .send({
        type: 'competition',
        discipline: null,
        title: 'City Sprint Meet',
        date: '2026-09-01',
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: eventBody() });
    const [sql, parameters] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO events');
    expect(parameters).toEqual([
      USER_ID,
      'competition',
      '100m',
      'City Sprint Meet',
      '2026-09-01',
      null,
      null,
      null,
      null,
      'scheduled',
    ]);
  });

  it('rejects an unsupported discipline value', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .post('/api/v1/events')
      .set('Authorization', 'Bearer valid')
      .send({ type: 'training', title: 'Starts', date: '2026-08-14', discipline: '200m' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'discipline', code: 'invalid_value' })],
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('rejects a malformed date', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .post('/api/v1/events')
      .set('Authorization', 'Bearer valid')
      .send({ type: 'training', title: 'Starts', date: '2026-02-29', time: '23:60' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [
          expect.objectContaining({ path: 'date', code: 'invalid_format' }),
          expect.objectContaining({ path: 'time', code: 'invalid_format' }),
        ],
      },
    });
  });

  it('rejects coach-supplied ownership ids before a write query', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .post('/api/v1/events')
      .set('Authorization', 'Bearer valid')
      .send({
        type: 'training',
        title: 'Starts',
        date: '2026-08-14',
        createdBy: USER_ID,
        id: EVENT_ID,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [
          expect.objectContaining({ path: 'createdBy', code: 'unknown_field' }),
          expect.objectContaining({ path: 'id', code: 'unknown_field' }),
        ],
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });
});

describe('GET /api/v1/events/:id', () => {
  it('returns the owned event', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow()] });

    const response = await request(app)
      .get(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: eventBody() });
  });

  it('hides a foreign event with the generic error before the detail query', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('returns the generic error for a malformed id without an ownership query', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser());

    const response = await request(app)
      .get('/api/v1/events/not-a-uuid')
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
    expect(query).toHaveBeenCalledOnce();
  });
});

describe('GET /api/v1/events/:id/weather', () => {
  it('returns the owned event forecast through the stable API envelope', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [{ owned: 1 }] });

    const response = await request(app)
      .get(`/api/v1/events/${EVENT_ID}/weather`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      date: '2026-09-01',
      weatherCode: 2,
      temperatureMaxC: 24.8,
    });
    expect(weatherService.getEventWeatherForecast).toHaveBeenCalledWith(USER_ID, EVENT_ID);
  });

  it('does not contact the weather service for a foreign event', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get(`/api/v1/events/${EVENT_ID}/weather`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
    expect(weatherService.getEventWeatherForecast).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/events/:id', () => {
  it('replaces an owned event through an allowed transition', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow()] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'in_progress' })] });

    const response = await request(app)
      .put(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({
        type: 'competition',
        title: 'City Sprint Meet',
        date: '2026-09-01',
        status: 'in_progress',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: eventBody({ status: 'in_progress' }) });
    const [lockSql] = query.mock.calls[2] as [string, unknown[]];
    expect(lockSql).toContain('FOR UPDATE');
    const [sql, parameters] = query.mock.calls[3] as [string, unknown[]];
    expect(sql).toContain('UPDATE events');
    expect(parameters[8]).toBe('in_progress');
  });

  it('rejects an invalid transition with 409 and the from/to details', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'cancelled' })] });

    const response = await request(app)
      .put(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({
        type: 'competition',
        title: 'City Sprint Meet',
        date: '2026-09-01',
        status: 'scheduled',
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_EVENT_TRANSITION',
        message: 'Cannot move an event from cancelled to scheduled',
        details: { from: 'cancelled', to: 'scheduled' },
      },
    });
    expect(withTransaction).toHaveBeenCalledOnce();
  });

  it('refuses to revert a completed event', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'completed' })] });

    const response = await request(app)
      .put(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({
        type: 'competition',
        title: 'City Sprint Meet',
        date: '2026-09-01',
        status: 'in_progress',
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'INVALID_EVENT_TRANSITION',
      message: 'Cannot move an event from completed to in_progress',
      details: { from: 'completed', to: 'in_progress' },
    });
  });

  it('cancels a scheduled event through a full replacement', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow()] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'cancelled' })] });

    const response = await request(app)
      .put(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({
        type: 'competition',
        title: 'City Sprint Meet',
        date: '2026-09-01',
        status: 'cancelled',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: eventBody({ status: 'cancelled' }) });
  });

  it('allows a no-op transition on the same status', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'in_progress' })] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'in_progress', title: 'Renamed' })] });

    const response = await request(app)
      .put(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({ type: 'training', title: 'Renamed', date: '2026-09-01', status: 'in_progress' });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Renamed');
  });

  it('hides replacement of a foreign event', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .put(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid')
      .send({
        type: 'competition',
        title: 'City Sprint Meet',
        date: '2026-09-01',
        status: 'scheduled',
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
    expect(withTransaction).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/events/:id', () => {
  it('cancels an owned event via an update, never a delete', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'in_progress' })] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'cancelled' })] });

    const response = await request(app)
      .delete(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('cancelled');
    const [sql, parameters] = query.mock.calls[3] as [string, unknown[]];
    expect(sql).toContain("status = 'cancelled'");
    expect(sql).not.toContain('DELETE FROM');
    expect(parameters).toEqual([EVENT_ID, USER_ID]);
  });

  it('hides a foreign event from cancellation', async () => {
    configureAuth();
    query.mockResolvedValueOnce(synchronizedUser()).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', 'Bearer valid');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(resourceNotFound);
  });
});

describe('timeline logging guard', () => {
  it('rejects logging against a cancelled event with 409', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'cancelled' })] });

    const response = await request(app)
      .post(`/api/v1/events/${EVENT_ID}/entries`)
      .set('Authorization', 'Bearer valid')
      .send({ athleteId: ATHLETE_ID, entryType: 'attempt', value: 11.2 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'EVENT_NOT_IN_PROGRESS',
        message: 'Logging is only open while the event is in progress',
        details: { status: 'cancelled' },
      },
    });
  });

  it('rejects patch logging against a scheduled event', async () => {
    configureAuth();
    query
      .mockResolvedValueOnce(synchronizedUser())
      .mockResolvedValueOnce({ rows: [{ owned: 1 }] })
      .mockResolvedValueOnce({ rows: [eventRow({ status: 'scheduled' })] });

    const patch = await request(app)
      .patch(`/api/v1/events/${EVENT_ID}/entries/44444444-4444-4444-8444-444444444444`)
      .set('Authorization', 'Bearer valid')
      .send({ expectedVersion: 1, value: 11.1 });

    expect(patch.status).toBe(409);
    expect(patch.body.error.details).toEqual({ status: 'scheduled' });
  });

});
