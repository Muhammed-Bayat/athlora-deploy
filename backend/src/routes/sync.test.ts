import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { createApp } from '../app.js';

const syncService = vi.hoisted(() => ({
  processSyncBatch: vi.fn(),
  designateOfflineLogger: vi.fn(),
  revokeOfflineLoggerDesignation: vi.fn(),
  transferOfflineLoggerDesignation: vi.fn(),
}));

vi.mock('../services/sync.js', () => syncService);
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));
vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
  pool: null,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const ACTION_ID = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();
const app = createApp();

function synchronizedUser(): { rows: Array<Record<string, unknown>> } {
  return {
    rows: [{
      user_id: USER_ID,
      auth0_id: 'auth0|coach-1',
      role: 'coach',
      deletion_status: null,
      workspace_id: WORKSPACE_ID,
      workspace_role: 'coach',
    }],
  };
}

function ownedEvent(): { rows: Array<Record<string, unknown>> } {
  return { rows: [{ owned: 1 }] };
}

function openEvent(): { rows: Array<Record<string, unknown>> } {
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
      status: 'in_progress',
      created_at: new Date('2026-08-16T10:00:00.000Z'),
      updated_at: new Date('2026-08-16T10:00:00.000Z'),
    }],
  };
}

function validAction(overrides: Record<string, unknown> = {}) {
  return {
    actionId: ACTION_ID,
    actionType: 'create_entry',
    payload: {
      athleteId: '55555555-5555-4555-8555-555555555555',
      discipline: '100m',
      entryType: 'attempt',
      value: 11.2,
      unit: 'seconds',
    },
    clientTimestamp: '2026-09-05T10:00:00.000Z',
    ...overrides,
  };
}

function queueOwnershipQueries(mode: 'ok' | 'foreign' | 'closed' = 'ok') {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('AS user_id')) return synchronizedUser();
    if (sql.includes('SELECT 1 FROM events e')) {
      return mode === 'foreign' ? { rows: [] } : ownedEvent();
    }
    if (sql.includes('FROM events e') && sql.includes('status')) {
      const rows = openEvent().rows.map((row) => ({
        ...row,
        status: mode === 'closed' ? 'completed' : 'in_progress',
      }));
      return { rows };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|coach-1' } } as never);
  syncService.processSyncBatch.mockResolvedValue({
    receipts: [{ actionId: ACTION_ID, status: 'accepted', entryId: ACTION_ID, serverVersion: 1 }],
    recomputedResults: true,
  });
});

afterEach(() => {
  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_AUDIENCE;
});

describe('POST /api/v1/sync/batch', () => {
  it('processes an owned in-progress event batch without a path param ownership check', async () => {
    queueOwnershipQueries('ok');

    const response = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer valid')
      .send({ deviceId: 'device-1', eventId: EVENT_ID, actions: [validAction()] });

    expect(response.status).toBe(200);
    expect(response.body.data.receipts[0].status).toBe('accepted');
    expect(syncService.processSyncBatch).toHaveBeenCalledWith(
      EVENT_ID,
      USER_ID,
      'device-1',
      [expect.objectContaining({ actionId: ACTION_ID, actionType: 'create_entry' })],
    );
  });

  it('rejects a foreign workspace event with the generic not-found envelope', async () => {
    queueOwnershipQueries('foreign');

    const response = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer valid')
      .send({ deviceId: 'device-1', eventId: EVENT_ID, actions: [validAction()] });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(syncService.processSyncBatch).not.toHaveBeenCalled();
  });

  it('rejects writes when the event is not in progress', async () => {
    queueOwnershipQueries('closed');

    const response = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer valid')
      .send({ deviceId: 'device-1', eventId: EVENT_ID, actions: [validAction()] });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EVENT_NOT_IN_PROGRESS');
    expect(syncService.processSyncBatch).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing actions array', async () => {
    queueOwnershipQueries('ok');

    const response = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer valid')
      .send({ deviceId: 'device-1', eventId: EVENT_ID });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(syncService.processSyncBatch).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-canonical actionId without reaching the service', async () => {
    queueOwnershipQueries('ok');

    const response = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer valid')
      .send({
        deviceId: 'device-1',
        eventId: EVENT_ID,
        actions: [validAction({ actionId: 'not-a-uuid' })],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(syncService.processSyncBatch).not.toHaveBeenCalled();
  });

  it('returns 400 when the batch exceeds 50 actions', async () => {
    queueOwnershipQueries('ok');

    const actions = Array.from({ length: 51 }, (_, i) =>
      validAction({
        actionId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      }),
    );

    const response = await request(app)
      .post('/api/v1/sync/batch')
      .set('Authorization', 'Bearer valid')
      .send({ deviceId: 'device-1', eventId: EVENT_ID, actions });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('50');
    expect(syncService.processSyncBatch).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .post('/api/v1/sync/batch')
      .send({ deviceId: 'device-1', eventId: EVENT_ID, actions: [validAction()] });

    expect(response.status).toBe(401);
    expect(syncService.processSyncBatch).not.toHaveBeenCalled();
  });
});
