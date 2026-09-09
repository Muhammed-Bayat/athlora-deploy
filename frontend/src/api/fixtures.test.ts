import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fixtures from './fixtures';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

describe('fixture API', () => {
  it('uses the expected host and guest collection paths', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ data: [], meta: { count: 0 } }))
      .mockResolvedValueOnce(response({ data: [], meta: { count: 0 } }))
      .mockResolvedValueOnce(response({ data: [], meta: { count: 0 } }))
      .mockResolvedValueOnce(response({ data: [], meta: { count: 0 } }))
      .mockResolvedValueOnce(response({ data: [], meta: { count: 0 } }))
      .mockResolvedValueOnce(response({ data: [], meta: { count: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    await fixtures.listFixtureInvitations(EVENT_ID);
    await fixtures.listFixtureRosters(EVENT_ID);
    await fixtures.listGuestFixtures();
    await fixtures.listGuestFixtureParticipants(EVENT_ID);
    await fixtures.listHostedFixtureEntries(EVENT_ID);
    await fixtures.listGuestFixtureResults(EVENT_ID);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      expect.stringContaining(`/api/v1/events/${EVENT_ID}/fixture-invitations`),
      expect.stringContaining(`/api/v1/events/${EVENT_ID}/fixture-rosters`),
      expect.stringContaining('/api/v1/fixtures'),
      expect.stringContaining(`/api/v1/fixtures/${EVENT_ID}/participants`),
      expect.stringContaining(`/api/v1/events/${EVENT_ID}/fixture-entries`),
      expect.stringContaining(`/api/v1/fixtures/${EVENT_ID}/results`),
    ]));
  });

  it('sends host and guest mutation contracts unchanged', async () => {
    const result = { eventId: EVENT_ID, athleteId: ATHLETE_ID };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ data: { id: 'invite' } }, 201))
      .mockResolvedValueOnce(response({ data: { id: 'invite' } }))
      .mockResolvedValueOnce(response(undefined, 204))
      .mockResolvedValueOnce(response({ data: { id: ATHLETE_ID } }, 201))
      .mockResolvedValueOnce(response({ data: { id: ATHLETE_ID } }))
      .mockResolvedValueOnce(response(undefined, 204))
      .mockResolvedValueOnce(response({ data: result }))
      .mockResolvedValueOnce(response({ data: result }));
    vi.stubGlobal('fetch', fetchMock);

    await fixtures.createFixtureInvitation(EVENT_ID, { targetClubId: ATHLETE_ID, expiresInDays: 3 });
    await fixtures.respondToIncomingFixtureInvitation('invite', 'accepted', 'Ready');
    await fixtures.withdrawGuestFixture(EVENT_ID);
    await fixtures.addGuestFixtureParticipant(EVENT_ID, ATHLETE_ID);
    await fixtures.updateGuestFixtureParticipant(EVENT_ID, ATHLETE_ID, 'yes');
    await fixtures.removeGuestFixtureParticipant(EVENT_ID, ATHLETE_ID);
    await fixtures.overrideHostFixtureResult(EVENT_ID, ATHLETE_ID, { manualOverride: 11.2, overrideReason: 'Photo finish' });
    await fixtures.overrideGuestFixtureResult(EVENT_ID, ATHLETE_ID, { manualOverride: null, overrideReason: null });

    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'POST', 'POST', 'POST', 'PUT', 'DELETE', 'PUT', 'PUT']);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ targetClubId: ATHLETE_ID, expiresInDays: 3 }));
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ response: 'accepted', message: 'Ready' }));
  });

  it('dispatches a refresh event after notification mutations', () => {
    const listener = vi.fn();
    window.addEventListener('fixture-notifications-changed', listener);
    fixtures.refreshFixtureNotifications();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('fixture-notifications-changed', listener);
  });
});
