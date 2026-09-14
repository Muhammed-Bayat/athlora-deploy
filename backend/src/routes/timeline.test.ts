import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { createApp } from '../app.js';

const timelineService = vi.hoisted(() => ({
  createTimelineEntry: vi.fn(),
  listTimelineEntries: vi.fn(),
  updateTimelineEntry: vi.fn(),
  removeTimelineEntry: vi.fn(),
}));

vi.mock('../services/timeline.js', () => timelineService);
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));
vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
  pool: null,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();
const app = createApp();

const entry = {
  id: ENTRY_ID,
  eventId: EVENT_ID,
  athleteId: ATHLETE_ID,
  discipline: '100m',
  entryType: 'attempt',
  value: 11.2,
  unit: 'seconds',
  isFoul: false,
  incidentType: null,
  noteText: null,
  recordedBy: USER_ID,
  version: 1,
  deviceId: null,
  createdAt: '2026-08-16T10:00:00.000Z',
  updatedAt: '2026-08-16T10:00:00.000Z',
  deletedAt: null,
} as const;

function userRow() {
  return { rows: [{ user_id: USER_ID, auth0_id: 'auth0|coach-1', role: 'coach' }] };
}

function eventRow(status: 'scheduled' | 'in_progress' = 'in_progress') {
  return {
    rows: [{
      id: EVENT_ID,
      created_by: USER_ID,
      type: 'competition',
      discipline: '100m',
      title: 'City Sprint',
      date: '2026-09-01',
      time: null,
      location_name: null,
      latitude: null,
      longitude: null,
      status,
      created_at: new Date('2026-08-16T10:00:00.000Z'),
      updated_at: new Date('2026-08-16T10:00:00.000Z'),
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|coach-1' } } as never);
  timelineService.createTimelineEntry.mockResolvedValue(entry);
  timelineService.listTimelineEntries.mockResolvedValue([entry]);
  timelineService.updateTimelineEntry.mockResolvedValue({ ...entry, value: 11.1, version: 2 });
  timelineService.removeTimelineEntry.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_AUDIENCE;
});

function authorized(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
  return request(app)[method](path).set('Authorization', 'Bearer valid');
}

describe('timeline routes', () => {
  it('lists active entries with the standard count envelope', async () => {
    query.mockResolvedValueOnce(userRow()).mockResolvedValueOnce(eventRow());
    const response = await authorized('get', `/api/v1/events/${EVENT_ID}/entries`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [entry], meta: { count: 1 } });
    expect(timelineService.listTimelineEntries).toHaveBeenCalledWith(USER_ID, EVENT_ID);
  });

  it('creates a normalized timeline entry and returns 201', async () => {
    query.mockResolvedValueOnce(userRow()).mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce(eventRow());
    const response = await authorized('post', `/api/v1/events/${EVENT_ID}/entries`).send({
      athleteId: ATHLETE_ID,
      entryType: 'attempt',
      value: 11.2,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: entry });
    expect(timelineService.createTimelineEntry).toHaveBeenCalledWith(USER_ID, EVENT_ID, {
      athleteId: ATHLETE_ID,
      discipline: '100m',
      entryType: 'attempt',
      value: 11.2,
      unit: 'seconds',
      isFoul: false,
      incidentType: null,
      noteText: null,
      deviceId: null,
    }, undefined, USER_ID);
  });

  it('patches through the sparse parsed payload', async () => {
    query.mockResolvedValueOnce(userRow()).mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce(eventRow());
    const response = await authorized('patch', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`)
      .send({ expectedVersion: 1, value: 11.1 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ value: 11.1, version: 2 });
    expect(timelineService.updateTimelineEntry).toHaveBeenCalledWith(USER_ID, EVENT_ID, ENTRY_ID, {
      expectedVersion: 1,
      value: 11.1,
    });
  });

  it('soft-deletes through the service and returns 204', async () => {
    query.mockResolvedValueOnce(userRow()).mockResolvedValueOnce({ rows: [{}] });
    const response = await authorized('delete', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`)
      .send({ expectedVersion: 1 });

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(timelineService.removeTimelineEntry).toHaveBeenCalledWith(USER_ID, EVENT_ID, ENTRY_ID, {
      expectedVersion: 1,
    });
  });

  it('validates create before ownership and patch after entry ownership', async () => {
    query.mockResolvedValueOnce(userRow());
    const invalidCreate = await authorized('post', `/api/v1/events/${EVENT_ID}/entries`).send({});
    expect(invalidCreate.status).toBe(400);
    expect(invalidCreate.body.error.code).toBe('VALIDATION_ERROR');
    expect(query).toHaveBeenCalledOnce();

    query.mockResolvedValueOnce(userRow()).mockResolvedValueOnce({ rows: [{}] });
    const invalidPatch = await authorized('patch', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`).send({});
    expect(invalidPatch.status).toBe(400);
    expect(invalidPatch.body.error.details.issues).toEqual([
      expect.objectContaining({ path: '$', code: 'empty_payload' }),
      expect.objectContaining({ path: 'expectedVersion', code: 'required' }),
    ]);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('does not reveal a foreign entry through patch or delete validation', async () => {
    query.mockResolvedValueOnce(userRow()).mockResolvedValueOnce({ rows: [] });
    const patch = await authorized('patch', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`).send({});

    query.mockResolvedValueOnce(userRow()).mockResolvedValueOnce({ rows: [] });
    const deletion = await authorized('delete', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`).send({});

    expect([patch.status, deletion.status]).toEqual([404, 404]);
    expect([patch.body, deletion.body]).toEqual([
      { error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} } },
      { error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} } },
    ]);
  });

  it('keeps foreign resources behind the generic not-found response', async () => {
    query.mockResolvedValueOnce(userRow()).mockResolvedValueOnce({ rows: [] });
    const response = await authorized('patch', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`)
      .send({ expectedVersion: 1, value: 11.1 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} },
    });
    expect(timelineService.updateTimelineEntry).not.toHaveBeenCalled();
  });

  it('rejects logging when the owned event is not in progress', async () => {
    query.mockResolvedValueOnce(userRow()).mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce(eventRow('scheduled'));
    const response = await authorized('patch', `/api/v1/events/${EVENT_ID}/entries/${ENTRY_ID}`)
      .send({ expectedVersion: 1, value: 11.1 });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'EVENT_NOT_IN_PROGRESS',
      message: 'Logging is only open while the event is in progress',
      details: { status: 'scheduled' },
    });
    expect(timelineService.updateTimelineEntry).not.toHaveBeenCalled();
  });
});
