import { beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  addGuestFixtureParticipant: vi.fn(), createFixtureInvitation: vi.fn(), getGuestFixture: vi.fn(),
  listFixtureInvitations: vi.fn(), listIncomingFixtureInvitations: vi.fn(), listGuestFixtureParticipants: vi.fn(),
  listGuestFixtureResults: vi.fn(), listGuestFixtures: vi.fn(), listHostedFixtureEntries: vi.fn(),
  listHostedFixtureRosters: vi.fn(), listHostedFixtureResults: vi.fn(), overrideHostFixtureResult: vi.fn(),
  recordFixtureWithdrawal: vi.fn(), removeGuestFixtureParticipant: vi.fn(), respondToIncomingFixtureInvitation: vi.fn(),
  resendFixtureInvitation: vi.fn(), revokeFixtureInvitation: vi.fn(), updateGuestFixtureParticipant: vi.fn(), withdrawGuestFixture: vi.fn(),
}));
const timeline = vi.hoisted(() => ({ createTimelineEntry: vi.fn(), listTimelineEntries: vi.fn(), removeTimelineEntry: vi.fn(), updateTimelineEntry: vi.fn() }));
const results = vi.hoisted(() => ({ overrideResultRecord: vi.fn() }));
const auth = vi.hoisted(() => ({ getApplicationUserContext: vi.fn(() => ({ workspaceId: 'workspace-1', userId: 'user-1' })) }));
const realtime = vi.hoisted(() => ({ notifyEventInvalidated: vi.fn() }));

vi.mock('../services/fixtures.js', () => services);
vi.mock('../services/timeline.js', () => timeline);
vi.mock('./results.js', () => results);
vi.mock('../middleware/auth.js', () => auth);
vi.mock('../realtime/index.js', () => realtime);

import * as fixtures from './fixtures.js';

const ids = { eventId: 'event-1', invitationId: 'invite-1', workspaceId: 'workspace-2', athleteId: 'athlete-1', entryId: 'entry-1' };

function response() {
  const value = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  value.status.mockReturnValue(value);
  return value;
}

async function invoke(handler: typeof fixtures.createInvitation, params = ids, body: Record<string, unknown> = { athleteId: ids.athleteId, rsvpStatus: 'yes' }) {
  const res = response();
  const next = vi.fn();
  await handler({ params, body } as never, res as never, next);
  expect(next).not.toHaveBeenCalled();
  return res;
}

describe('fixture controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(services)) mock.mockResolvedValue({ id: 'resource-1' });
    for (const mock of Object.values(timeline)) mock.mockResolvedValue({ id: 'entry-1', eventId: ids.eventId });
    results.overrideResultRecord.mockResolvedValue({ athleteId: ids.athleteId });
  });

  it('delegates host fixture lifecycle and roster actions', async () => {
    await invoke(fixtures.createInvitation);
    await invoke(fixtures.listInvitations);
    await invoke(fixtures.resendInvitation);
    await invoke(fixtures.revokeInvitation);
    await invoke(fixtures.hostedRosters);
    await invoke(fixtures.hostWithdrawal);
    await invoke(fixtures.hostedEntries);
    await invoke(fixtures.hostedResults);
    await invoke(fixtures.overrideHostResult);

    expect(services.createFixtureInvitation).toHaveBeenCalledWith('workspace-1', 'user-1', ids.eventId, expect.any(Object));
    expect(services.overrideHostFixtureResult).toHaveBeenCalledWith('workspace-1', 'user-1', ids.eventId, ids.athleteId, expect.any(Object));
  });

  it('delegates guest fixture membership, timeline, and result actions', async () => {
    await invoke(fixtures.listIncoming);
    await invoke(fixtures.respondIncoming);
    await invoke(fixtures.listGuest);
    await invoke(fixtures.getGuest);
    await invoke(fixtures.listGuestParticipants);
    await invoke(fixtures.addGuestParticipant);
    await invoke(fixtures.updateGuestParticipant);
    await invoke(fixtures.removeGuestParticipant);
    await invoke(fixtures.guestWithdrawal);
    await invoke(fixtures.listGuestEntries);
    await invoke(fixtures.createGuestEntry);
    await invoke(fixtures.updateGuestEntry);
    await invoke(fixtures.removeGuestEntry);
    await invoke(fixtures.listGuestResults);
    await invoke(fixtures.overrideGuestResult);

    expect(timeline.createTimelineEntry).toHaveBeenCalledWith('user-1', ids.eventId, expect.any(Object), undefined, 'workspace-1', true);
    expect(results.overrideResultRecord).toHaveBeenCalledWith('user-1', 'workspace-1', ids.eventId, ids.athleteId, expect.any(Object), true);
    expect(realtime.notifyEventInvalidated).toHaveBeenCalled();
  });
});
