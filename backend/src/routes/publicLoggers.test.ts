import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

const service = vi.hoisted(() => ({
  createPublicLoggerSession: vi.fn(),
  publicLoggerSnapshot: vi.fn(),
  createPublicLoggerEntry: vi.fn(),
  createPublicLoggerLink: vi.fn(),
  listPublicLoggerLinks: vi.fn(),
  revokePublicLoggerLink: vi.fn(),
}));

vi.mock('../services/publicLoggers.js', () => service);

const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const snapshot = {
  event: { id: EVENT_ID, title: 'City Sprint Meet', status: 'in_progress' },
  participants: [{ athleteId: '33333333-3333-4333-8333-333333333333', name: 'Nia Runner' }],
  timeline: [],
};

describe('public logger routes', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    service.createPublicLoggerSession.mockResolvedValue({ sessionToken: 'opaque-session', snapshot });
    service.publicLoggerSnapshot.mockResolvedValue(snapshot);
    service.createPublicLoggerEntry.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444', eventId: EVENT_ID,
    });
  });

  it('opens a public session without Auth0 and passes the unpersisted link token only to the session service', async () => {
    const response = await request(app).post('/api/v1/public/logger/sessions').send({
      linkToken: 'opaque-link-token', name: 'Timekeeper Sam', club: 'North Club',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.sessionToken).toBe('opaque-session');
    expect(service.createPublicLoggerSession).toHaveBeenCalledWith('opaque-link-token', 'Timekeeper Sam', 'North Club');
  });

  it('requires the public session header for event data and validates entry payloads before reaching the service', async () => {
    const missing = await request(app).get(`/api/v1/public/logger/events/${EVENT_ID}`);
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('PUBLIC_LOGGER_SESSION_INVALID');

    const response = await request(app)
      .post(`/api/v1/public/logger/events/${EVENT_ID}/entries`)
      .set('X-Public-Logger-Session', 'opaque-session')
      .send({ athleteId: snapshot.participants[0].athleteId, entryType: 'attempt', value: 11.42 });

    expect(response.status).toBe(201);
    expect(service.createPublicLoggerEntry).toHaveBeenCalledWith('opaque-session', EVENT_ID, expect.objectContaining({
      entryType: 'attempt', value: 11.42, discipline: '100m', unit: 'seconds',
    }));
  });
});
