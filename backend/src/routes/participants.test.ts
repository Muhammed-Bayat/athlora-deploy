import request from 'supertest';
import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import type { EventParticipantSummaryRow } from '../db/row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import { createApp } from '../app.js';

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

const participantRow: EventParticipantSummaryRow = {
  event_id: EVENT_ID,
  athlete_id: ATHLETE_ID,
  rsvp_status: 'pending',
  athlete_name: 'Ari Runner',
  athlete_squad_names: [],
  athlete_archived_at: null,
};

const participantBody = {
  eventId: EVENT_ID,
  athleteId: ATHLETE_ID,
  rsvpStatus: 'pending',
  athlete: {
    id: ATHLETE_ID,
    name: 'Ari Runner',
    squadNames: [],
    archivedAt: null,
  },
  statusReviewRequired: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
  vi.mocked(withTransaction).mockImplementation(async (operation) =>
    operation({ query } as never),
  );
  process.env.AUTH0_DOMAIN = 'example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.example.com';
  vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|coach-1' } } as never);
  query.mockResolvedValueOnce({
    rows: [{ user_id: USER_ID, auth0_id: 'auth0|coach-1', role: 'coach' }],
  });
});

afterEach(() => {
  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_AUDIENCE;
});

function authorized(method: 'get' | 'post' | 'put' | 'delete', path: string) {
  return request(app)[method](path).set('Authorization', 'Bearer valid');
}

describe('event participant routes', () => {
  it('lists assigned athletes with summaries after ownership validation', async () => {
    query.mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [participantRow] });

    const response = await authorized('get', `/api/v1/events/${EVENT_ID}/participants`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [participantBody], meta: { count: 1 } });
  });

  it('does not disclose a missing or cross-coach event while listing', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await authorized('get', `/api/v1/events/${EVENT_ID}/participants`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} },
    });
  });

  it('assigns an active owned athlete', async () => {
    query
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ archived_at: null, already_assigned: false }] })
      .mockResolvedValueOnce({ rows: [{ event_id: EVENT_ID }] })
      .mockResolvedValueOnce({ rows: [participantRow] });

    const response = await authorized('post', `/api/v1/events/${EVENT_ID}/participants`).send({
      athleteId: ATHLETE_ID,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: participantBody });
  });

  it('rejects malformed and server-controlled assignment fields', async () => {
    const response = await authorized('post', `/api/v1/events/${EVENT_ID}/participants`).send({
      athleteId: 'invalid',
      eventId: EVENT_ID,
      rsvpStatus: 'yes',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({ path: 'athleteId', code: 'invalid_format' }),
          expect.objectContaining({ path: 'eventId', code: 'unknown_field' }),
          expect.objectContaining({ path: 'rsvpStatus', code: 'unknown_field' }),
        ]),
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('hides cross-coach event or athlete assignments behind generic not-found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await authorized('post', `/api/v1/events/${EVENT_ID}/participants`).send({
      athleteId: ATHLETE_ID,
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} },
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects archived athletes for new assignment', async () => {
    query
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({
        rows: [
          {
            archived_at: new Date('2026-08-16T12:00:00Z'),
            already_assigned: false,
          },
        ],
      });

    const response = await authorized('post', `/api/v1/events/${EVENT_ID}/participants`).send({
      athleteId: ATHLETE_ID,
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'ATHLETE_ARCHIVED',
        message: 'Archived athletes cannot be assigned to events',
        details: {},
      },
    });
  });

  it('rejects duplicate assignments', async () => {
    query
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ archived_at: null, already_assigned: true }] });

    const response = await authorized('post', `/api/v1/events/${EVENT_ID}/participants`).send({
      athleteId: ATHLETE_ID,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'PARTICIPANT_ALREADY_ASSIGNED' });
  });

  it('updates RSVP status idempotently', async () => {
    query
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ ...participantRow, rsvp_status: 'yes' }] });

    const response = await authorized(
      'put',
      `/api/v1/events/${EVENT_ID}/participants/${ATHLETE_ID}`,
    ).send({ rsvpStatus: 'yes' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ ...participantBody, rsvpStatus: 'yes' });
  });

  it('validates RSVP replacement before querying participant ownership', async () => {
    const response = await authorized(
      'put',
      `/api/v1/events/${EVENT_ID}/participants/${ATHLETE_ID}`,
    ).send({ rsvpStatus: 'maybe' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: {
        issues: [expect.objectContaining({ path: 'rsvpStatus', code: 'invalid_value' })],
      },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('removes an assignment without returning a body', async () => {
    query
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ event_id: EVENT_ID }] });

    const response = await authorized(
      'delete',
      `/api/v1/events/${EVENT_ID}/participants/${ATHLETE_ID}`,
    );

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('does not disclose a missing participant during removal', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await authorized(
      'delete',
      `/api/v1/events/${EVENT_ID}/participants/${ATHLETE_ID}`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found', details: {} },
    });
  });
});
