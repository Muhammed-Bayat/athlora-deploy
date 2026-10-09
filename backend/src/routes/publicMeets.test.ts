import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import publicMeetsRouter from './publicMeets.js';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ENTRANT_ID = '33333333-3333-4333-8333-333333333333';

const services = vi.hoisted(() => ({
  resolvePublicMeetActor: vi.fn(),
  listDisciplines: vi.fn(), listEntrants: vi.fn(), listRegistrations: vi.fn(), listSessions: vi.fn(), listSafeRelayMembers: vi.fn(),
  assertPublicSessionEntryContent: vi.fn(), createSessionEntry: vi.fn(), listSessionEntries: vi.fn(), listSessionResults: vi.fn(), mutateSessionEntry: vi.fn(),
  notifySessionInvalidated: vi.fn(),
}));

vi.mock('../services/publicLoggers.js', () => ({ resolvePublicMeetActor: services.resolvePublicMeetActor }));
vi.mock('../services/meets.js', () => ({
  listDisciplines: services.listDisciplines, listEntrants: services.listEntrants, listRegistrations: services.listRegistrations,
  listSessions: services.listSessions, listSafeRelayMembers: services.listSafeRelayMembers,
}));
vi.mock('../services/sessionPerformances.js', () => ({
  assertPublicSessionEntryContent: services.assertPublicSessionEntryContent,
  createSessionEntry: services.createSessionEntry,
  listSessionEntries: services.listSessionEntries,
  listSessionResults: services.listSessionResults,
  mutateSessionEntry: services.mutateSessionEntry,
}));
vi.mock('../realtime/index.js', () => ({ notifySessionInvalidated: services.notifySessionInvalidated }));

const app = express();
app.use(express.json());
app.use('/api/v1/public/logger', publicMeetsRouter);

describe('public meet routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.resolvePublicMeetActor.mockResolvedValue({ publicLoggerSessionId: 'public-session-id', publicLoggerLinkId: 'public-link-id', publicLoggerName: 'Official', publicLoggerClub: 'Club' });
    services.listDisciplines.mockResolvedValue([]);
    services.listEntrants.mockResolvedValue([{ id: ENTRANT_ID, name: 'North Stars', kind: 'relay' }]);
    services.listSafeRelayMembers.mockResolvedValue([{ relayMemberId: '99999999-9999-4999-8999-999999999999', leg: 1, name: 'Ari Runner', isGuest: false }]);
    services.listSessions.mockResolvedValue([{ id: SESSION_ID, label: '4x100m Final', disciplineDefinitionId: '44444444-4444-4444-8444-444444444444', status: 'in_progress', resultState: 'provisional', version: 1, verticalConfig: null }]);
    services.listSessionResults.mockResolvedValue([]);
    services.listRegistrations.mockResolvedValue([{ entrantId: ENTRANT_ID, withdrawnAt: null }]);
    services.listSessionEntries.mockResolvedValue([]);
    services.createSessionEntry.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555', eventId: EVENT_ID, disciplineSessionId: SESSION_ID, entrantId: ENTRANT_ID, relayMemberId: null,
      workspaceId: 'private-workspace', entryType: 'attempt', value: 61.2, unit: 'seconds', isFoul: false, incidentType: null,
      noteText: null, recordedBy: null, publicLoggerSessionId: 'public-session-id', deviceId: null, version: 1,
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null,
    });
  });

  it('returns only the active link meet sessions and safe relay members', async () => {
    const response = await request(app)
      .get(`/api/v1/public/logger/events/${EVENT_ID}/discipline-sessions`)
      .set('X-Public-Logger-Session', 'public-session');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      disciplines: [],
      entrants: [{ id: ENTRANT_ID, name: 'North Stars', kind: 'relay', workspaceName: null, clubName: null, attending: true, members: [{ relayMemberId: '99999999-9999-4999-8999-999999999999', leg: 1, name: 'Ari Runner', isGuest: false }] }],
      sessions: [{ id: SESSION_ID, label: '4x100m Final', disciplineDefinitionId: '44444444-4444-4444-8444-444444444444', status: 'in_progress', resultState: 'provisional', version: 1, verticalConfig: null, results: [], entrantIds: [ENTRANT_ID], entries: [] }],
    });
    expect(services.resolvePublicMeetActor).toHaveBeenCalledWith('public-session', EVENT_ID);
  });

  it('returns just one discipline session for targeted logger refreshes', async () => {
    const response = await request(app)
      .get(`/api/v1/public/logger/events/${EVENT_ID}/discipline-sessions/${SESSION_ID}`)
      .set('X-Public-Logger-Session', 'public-session');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: SESSION_ID, entrantIds: [ENTRANT_ID], entries: [], results: [] });
    expect(services.listDisciplines).not.toHaveBeenCalled();
    expect(services.listEntrants).not.toHaveBeenCalled();
  });

  it('normalizes direct public session writes and keeps their target scoped to the selected entrant', async () => {
    const response = await request(app)
      .post(`/api/v1/public/logger/events/${EVENT_ID}/discipline-sessions/${SESSION_ID}/entrants/${ENTRANT_ID}/entries`)
      .set('X-Public-Logger-Session', 'public-session')
      .send({ entryType: 'attempt', value: 61.2, unit: 'seconds', isFoul: false, incidentType: null, noteText: null, deviceId: 'untrusted-device' });

    expect(response.status).toBe(201);
    expect(services.createSessionEntry).toHaveBeenCalledWith(
      { publicLoggerSessionId: 'public-session-id', publicLoggerLinkId: 'public-link-id', publicLoggerName: 'Official', publicLoggerClub: 'Club' }, EVENT_ID,
      { disciplineSessionId: SESSION_ID, entrantId: ENTRANT_ID },
      expect.objectContaining({ value: 61.2, deviceId: null }),
    );
    expect(response.body.data).not.toHaveProperty('workspaceId');
    expect(response.body.data).not.toHaveProperty('publicLoggerSessionId');
  });

  it('scopes public relay writes to one athlete and returns split identity with official legs', async () => {
    const relayMemberId = '66666666-6666-4666-8666-666666666666';
    const entryId = '77777777-7777-4777-8777-777777777777';
    services.createSessionEntry.mockResolvedValueOnce({ id: entryId, eventId: EVENT_ID, disciplineSessionId: SESSION_ID, entrantId: ENTRANT_ID, relayMemberId, entryType: 'attempt', value: 13.4, unit: 'seconds', isFoul: false, incidentType: null, noteText: null, recordedBy: null, publicLoggerSessionId: 'public-session-id', deviceId: null, version: 1, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null } as never);
    services.listSessionEntries.mockResolvedValue([{ id: entryId, eventId: EVENT_ID, disciplineSessionId: SESSION_ID, entrantId: ENTRANT_ID, relayMemberId, entryType: 'attempt', value: 13.4, unit: 'seconds', isFoul: false, incidentType: null, version: 1, createdAt: '2026-09-01T00:00:00.000Z', canEdit: true, canUndo: true }]);
    services.listSessionResults.mockResolvedValue([{ entrantId: ENTRANT_ID, effectiveResult: null, effectiveOutcome: 'no_result', placing: null, selectedEntryId: null, relayLegs: [{ relayMemberId, leg: 1, name: 'Ari Runner', value: 13.4, outcome: 'valid', selectedEntryId: entryId }] } as never]);

    const snapshot = await request(app)
      .get(`/api/v1/public/logger/events/${EVENT_ID}/discipline-sessions`)
      .set('X-Public-Logger-Session', 'public-session');
    expect(snapshot.body.data.sessions[0].entries[0]).toMatchObject({ relayMemberId, value: 13.4 });
    expect(snapshot.body.data.sessions[0].results[0].relayLegs[0]).toMatchObject({ leg: 1, value: 13.4 });

    const write = await request(app)
      .post(`/api/v1/public/logger/events/${EVENT_ID}/discipline-sessions/${SESSION_ID}/entrants/${ENTRANT_ID}/entries`)
      .set('X-Public-Logger-Session', 'public-session')
      .send({ entryType: 'attempt', value: 13.4, unit: 'seconds', isFoul: false, incidentType: null, relayMemberId });
    expect(write.status).toBe(201);
    expect(services.createSessionEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({ publicLoggerSessionId: 'public-session-id' }), EVENT_ID,
      { disciplineSessionId: SESSION_ID, entrantId: ENTRANT_ID },
      expect.objectContaining({ relayMemberId, value: 13.4 }),
    );
    expect(write.body.data).toMatchObject({ relayMemberId });
  });
});
