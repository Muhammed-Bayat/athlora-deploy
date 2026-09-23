import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from './client';
import { createEntrant, createSessionEntry, overrideSessionResult, sessionStatistics } from './meets';

vi.mock('./client', () => ({ request: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(request).mockResolvedValue({ data: { id: 'result' } }); });
describe('session API identifiers', () => {
  it('uses additive nested routes and preserves measured units without altering legacy DTOs', async () => {
    const target = { disciplineSessionId: 'session', entrantId: 'entrant' };
    const body = { entryType: 'attempt' as const, value: 6.1, unit: 'metres' as const, isFoul: false, incidentType: null, noteText: null, deviceId: null };
    await createSessionEntry('event', target, body);
    expect(request).toHaveBeenCalledWith('/api/v1/events/event/sessions/session/entrants/entrant/entries', { method: 'POST', body: JSON.stringify(body) });
    await overrideSessionResult('event', target, { manualOverride: null, overrideReason: null, expectedVersion: 3 });
    expect(request).toHaveBeenLastCalledWith('/api/v1/events/event/sessions/session/results/entrant', expect.objectContaining({ method: 'PUT' }));
  });
  it('represents guest identities and scopes statistics by entrant', async () => {
    await createEntrant('event', { kind: 'guest', name: 'Guest' });
    expect(request).toHaveBeenCalledWith('/api/v1/events/event/entrants', { method: 'POST', body: '{"kind":"guest","name":"Guest"}' });
    await sessionStatistics('event', 'session', 'entrant');
    expect(request).toHaveBeenLastCalledWith('/api/v1/events/event/sessions/session/statistics?entrantId=entrant');
  });
});
