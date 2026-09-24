import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import router from './meets.js';
import { errorHandler } from '../middleware/errors.js';
import * as meets from '../services/meets.js';
import * as performances from '../services/sessionPerformances.js';

const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const entrantId = '55555555-5555-4555-8555-555555555555';
let role: 'coach' | 'assistant' = 'coach';
vi.mock('../middleware/auth.js', () => ({ getApplicationUserContext: () => ({ userId, workspaceId, workspaceRole: role }) }));
vi.mock('../services/meets.js', () => ({ createSession: vi.fn(), createEntrant: vi.fn(), listSessions: vi.fn() }));
vi.mock('../services/sessionPerformances.js', () => ({ createSessionEntry: vi.fn(), mutateSessionEntry: vi.fn() }));
vi.mock('../realtime/index.js', () => ({ notifySessionInvalidated: vi.fn(), notifyEventInvalidated: vi.fn() }));
const app = express();
app.use(express.json());
app.use('/events', router);
app.use(errorHandler);
beforeEach(() => { vi.clearAllMocks(); role = 'coach'; });

describe('additive meet API', () => {
  it('accepts vertical configuration and explicit height states while rejecting invalid configuration', async () => {
    vi.mocked(meets.createSession).mockResolvedValue({ id: sessionId } as never);
    const verticalConfig = { startingHeight: 1.5, heightIncrement: 0.05, failureLimit: 3, round: 'final' };
    expect((await request(app).post(`/events/${eventId}/sessions`).send({ disciplineDefinitionId: sessionId, label: 'High Jump', verticalConfig })).status).toBe(201);
    expect((await request(app).post(`/events/${eventId}/sessions`).send({ disciplineDefinitionId: sessionId, label: 'High Jump', verticalConfig: { ...verticalConfig, failureLimit: 0 } })).status).toBe(400);
    vi.mocked(performances.createSessionEntry).mockResolvedValue({ id: entrantId } as never);
    for (const verticalState of ['clearance', 'failure', 'pass', 'void']) {
      expect((await request(app).post(`/events/${eventId}/sessions/${sessionId}/entrants/${entrantId}/entries`).send({ entryType: 'attempt', value: 1.5, unit: 'metres', verticalState })).status).toBe(201);
      expect(performances.createSessionEntry).toHaveBeenLastCalledWith({ userId, workspaceId, role: 'coach' }, eventId, { disciplineSessionId: sessionId, entrantId }, expect.objectContaining({ verticalState, value: 1.5 }));
    }
  });
  it('returns existing envelopes and passes authenticated workspace/actor separately from payload', async () => {
    vi.mocked(meets.createSession).mockResolvedValue({ id: sessionId } as never);
    const response = await request(app).post(`/events/${eventId}/sessions`).send({ disciplineDefinitionId: sessionId, label: 'Heat 1' });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { id: sessionId } });
    expect(meets.createSession).toHaveBeenCalledWith({ userId, workspaceId, role: 'coach' }, eventId, { disciplineDefinitionId: sessionId, label: 'Heat 1' });
  });
  it('requires coach capability for entrant registration and correction', async () => {
    role = 'assistant';
    expect((await request(app).post(`/events/${eventId}/entrants`).send({ kind: 'guest', name: 'Guest' })).status).toBe(403);
    expect((await request(app).delete(`/events/${eventId}/sessions/${sessionId}/entrants/${entrantId}/entries/${entrantId}`).send({ expectedVersion: 1 })).status).toBe(403);
    expect(performances.mutateSessionEntry).not.toHaveBeenCalled();
  });
  it('rejects malformed parent IDs and server-owned fields before calling services', async () => {
    expect((await request(app).post('/events/not-a-uuid/sessions').send({ disciplineDefinitionId: sessionId, label: 'Heat' })).status).toBe(404);
    expect((await request(app).post(`/events/${eventId}/sessions`).send({ disciplineDefinitionId: sessionId, label: 'Heat', workspaceId })).status).toBe(400);
    expect(meets.createSession).not.toHaveBeenCalled();
  });
  it('addresses exactly the nested session/entrant when recording a measured attempt', async () => {
    vi.mocked(performances.createSessionEntry).mockResolvedValue({ id: entrantId } as never);
    const response = await request(app).post(`/events/${eventId}/sessions/${sessionId}/entrants/${entrantId}/entries`).send({ entryType: 'attempt', value: 6.1, unit: 'metres' });
    expect(response.status).toBe(201);
    expect(performances.createSessionEntry).toHaveBeenCalledWith({ userId, workspaceId, role: 'coach' }, eventId,
      { disciplineSessionId: sessionId, entrantId }, expect.objectContaining({ value: 6.1, unit: 'metres' }));
  });
});
