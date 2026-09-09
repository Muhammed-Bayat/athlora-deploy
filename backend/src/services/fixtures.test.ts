import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

const mockOverrideResultRecord = vi.fn();
vi.mock('../controllers/results.js', () => ({ overrideResultRecord: mockOverrideResultRecord }));

import { getPool } from '../db/client.js';
import { listFixtureInvitations, listIncomingFixtureInvitations, listGuestFixtures, assertFixtureReadyToStart, assertHostWorkspace, listHostedFixtureRosters, listHostedFixtureResults, listHostedFixtureEntries, overrideHostFixtureResult, updateGuestFixtureParticipant } from './fixtures.js';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const HOST_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';
const ATHLETE_ID = '55555555-5555-5555-8555-555555555555';
const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({
    query,
    connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
  } as unknown as ReturnType<typeof getPool>);
});

describe('fixtures', () => {
  it('fully qualifies event columns when listing guest fixtures', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(listGuestFixtures(WORKSPACE_ID)).resolves.toEqual([]);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('e.id, e.created_by, e.type');
    expect(sql).toContain('e.status, e.created_at, e.updated_at');
    expect(sql).toContain('fw.status AS fixture_status');
    expect(query).toHaveBeenCalledWith(expect.any(String), [WORKSPACE_ID]);
  });

  it('uses the event ID rather than the workspace ID for host invitations', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(listFixtureInvitations(WORKSPACE_ID, EVENT_ID)).resolves.toEqual([]);

    expect(query).toHaveBeenCalledWith(expect.any(String), [EVENT_ID, WORKSPACE_ID]);
  });

  it('includes the latest responder identity and workspace for the host', async () => {
    query.mockResolvedValue({ rows: [{
      id: '66666666-6666-4666-8666-666666666666', event_id: EVENT_ID, email: 'guest@example.com', revision: 1,
      status: 'change_requested', expires_at: new Date(), created_at: new Date(), target_workspace_id: null,
      response_message: 'Later start', responded_at: new Date(), responded_workspace_id: WORKSPACE_ID,
      responded_workspace_name: 'Guest Club', responded_by_name: 'Guest Coach',
    }] });

    await expect(listFixtureInvitations(HOST_WORKSPACE_ID, EVENT_ID)).resolves.toEqual([expect.objectContaining({
      respondedWorkspaceId: WORKSPACE_ID, respondedWorkspaceName: 'Guest Club', respondedByName: 'Guest Coach',
    })]);
  });

  it('limits targeted incoming invitations to coaches in the target workspace', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(listIncomingFixtureInvitations(ACTOR_ID)).resolves.toEqual([]);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("wm.role = 'coach'");
    expect(sql).toContain('target.name AS target_workspace_name');
  });
});

describe('assertHostWorkspace', () => {
  it('rejects a non-host workspace', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(assertHostWorkspace({ query } as never, EVENT_ID, WORKSPACE_ID))
      .rejects.toMatchObject({ code: 'FIXTURE_HOST_ONLY' });
  });

  it('allows the host workspace', async () => {
    query.mockResolvedValue({ rows: [{ '1': 1 }] });

    await expect(assertHostWorkspace({ query } as never, EVENT_ID, HOST_WORKSPACE_ID))
      .resolves.toBeUndefined();
  });
});

describe('assertFixtureReadyToStart', () => {
  it('rejects a fixture with an unanswered invitation', async () => {
    query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });

    await expect(assertFixtureReadyToStart({ query } as never, EVENT_ID))
      .rejects.toMatchObject({ code: 'FIXTURE_INVITATIONS_PENDING' });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status NOT IN ('accepted', 'declined', 'revoked')"),
      [EVENT_ID],
    );
  });

  it('allows a fixture when every invitation is final and teams accepted the current revision', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(assertFixtureReadyToStart({ query } as never, EVENT_ID)).resolves.toBeUndefined();
  });

  it('identifies teams with pending or maybe athlete RSVPs', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ workspace_name: 'Team B' }] });

    await expect(assertFixtureReadyToStart({ query } as never, EVENT_ID)).rejects.toMatchObject({
      code: 'FIXTURE_PARTICIPANT_RSVPS_PENDING',
      details: { teams: ['Team B'] },
    });

    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("ep.rsvp_status IN ('pending', 'maybe')"),
      [EVENT_ID],
    );
  });
});

describe('shared fixture results', () => {
  it('lists all results for the host workspace', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
      .mockResolvedValueOnce({
        rows: [{
          event_id: EVENT_ID, athlete_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          discipline: '100m', outcome: 'valid', final_result: 11.2, unit: 'seconds',
          placing: 1, is_pb: true, is_sb: false, manual_override: null, override_reason: null,
          overridden_by: null, override_at: null, updated_at: new Date().toISOString(),
        }],
      });

    const results = await listHostedFixtureResults(HOST_WORKSPACE_ID, EVENT_ID);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ athleteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', finalResult: 11.2 });
  });

  it('rejects a non-host workspace from listing shared results', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(listHostedFixtureResults(WORKSPACE_ID, EVENT_ID))
      .rejects.toMatchObject({ code: 'FIXTURE_HOST_ONLY' });
  });
});

describe('fixture rosters', () => {
  it('returns participants for every participating workspace grouped by team', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
      .mockResolvedValueOnce({ rows: [
        { workspace_id: HOST_WORKSPACE_ID, workspace_name: 'Host Team', status: 'accepted', accepted_revision: 1, withdrawn_at: null },
        { workspace_id: WORKSPACE_ID, workspace_name: 'Guest Team', status: 'accepted', accepted_revision: 1, withdrawn_at: null },
      ] })
      .mockResolvedValueOnce({ rows: [{
        event_id: EVENT_ID, athlete_id: ATHLETE_ID, rsvp_status: 'yes', participant_workspace_id: HOST_WORKSPACE_ID,
        athlete_name: 'Host Runner', athlete_squad_names: [], athlete_archived_at: null, athlete_lifecycle_status: 'active', status_review_required: false,
      }, {
        event_id: EVENT_ID, athlete_id: '66666666-6666-4666-8666-666666666666', rsvp_status: 'pending', participant_workspace_id: WORKSPACE_ID,
        athlete_name: 'Guest Runner', athlete_squad_names: [], athlete_archived_at: null, athlete_lifecycle_status: 'active', status_review_required: false,
      }] });

    const rosters = await listHostedFixtureRosters(HOST_WORKSPACE_ID, EVENT_ID);

    expect(rosters).toEqual([
      expect.objectContaining({ team: expect.objectContaining({ workspaceId: HOST_WORKSPACE_ID }), participants: [expect.objectContaining({ athleteId: ATHLETE_ID })] }),
      expect.objectContaining({ team: expect.objectContaining({ workspaceId: WORKSPACE_ID }), participants: [expect.objectContaining({ athlete: expect.objectContaining({ name: 'Guest Runner' }) })] }),
    ]);
    expect(query).toHaveBeenLastCalledWith(expect.not.stringContaining('ep.participant_workspace_id = $2'), [EVENT_ID]);
  });
});

describe('updateGuestFixtureParticipant', () => {
  it('updates attendance through the guest roster, records its audit entry, and returns the participant', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'scheduled', fixture_revision: 1, accepted_revision: 1, fixture_status: 'accepted' }] })
      .mockResolvedValueOnce({ rows: [{ rsvp_status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        event_id: EVENT_ID, athlete_id: ATHLETE_ID, rsvp_status: 'yes', athlete_name: 'Guest Runner',
        athlete_squad_names: [], athlete_archived_at: null, athlete_lifecycle_status: 'active', status_review_required: false,
      }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(updateGuestFixtureParticipant(WORKSPACE_ID, ACTOR_ID, EVENT_ID, ATHLETE_ID, 'yes'))
      .resolves.toMatchObject({ athleteId: ATHLETE_ID, rsvpStatus: 'yes', athlete: { name: 'Guest Runner' } });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO event_participant_rsvp_audit'),
      [EVENT_ID, ATHLETE_ID, 'pending', 'yes', ACTOR_ID],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('rsvp_updated_at'),
      ['yes', EVENT_ID, ATHLETE_ID, ACTOR_ID, WORKSPACE_ID],
    );
  });
});

describe('shared fixture entries', () => {
  it('lists all non-deleted entries for the host workspace', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const entries = await listHostedFixtureEntries(HOST_WORKSPACE_ID, EVENT_ID);

    expect(entries).toEqual([]);
  });

  it('rejects a non-host workspace from listing shared entries', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(listHostedFixtureEntries(WORKSPACE_ID, EVENT_ID))
      .rejects.toMatchObject({ code: 'FIXTURE_HOST_ONLY' });
  });
});

describe('overrideHostFixtureResult', () => {
  it('rejects a non-host workspace', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      overrideHostFixtureResult(WORKSPACE_ID, ACTOR_ID, EVENT_ID, ATHLETE_ID, { manualOverride: 10.5, overrideReason: 'Timing error' }),
    ).rejects.toMatchObject({ code: 'FIXTURE_HOST_ONLY' });
    expect(mockOverrideResultRecord).not.toHaveBeenCalled();
  });

  it('delegates to overrideResultRecord for the host workspace', async () => {
    const expectedResult = { athleteId: ATHLETE_ID, finalResult: 10.5 };
    query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
    mockOverrideResultRecord.mockResolvedValueOnce(expectedResult);

    const result = await overrideHostFixtureResult(
      HOST_WORKSPACE_ID, ACTOR_ID, EVENT_ID, ATHLETE_ID,
      { manualOverride: 10.5, overrideReason: 'Timing error' },
    );

    expect(result).toBe(expectedResult);
    expect(mockOverrideResultRecord).toHaveBeenCalledWith(ACTOR_ID, HOST_WORKSPACE_ID, EVENT_ID, ATHLETE_ID, { manualOverride: 10.5, overrideReason: 'Timing error' });
  });

  it('rejects a malformed event id', async () => {
    await expect(
      overrideHostFixtureResult(HOST_WORKSPACE_ID, ACTOR_ID, 'not-a-uuid', ATHLETE_ID, { manualOverride: 10.5, overrideReason: 'reason' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a malformed athlete id', async () => {
    await expect(
      overrideHostFixtureResult(HOST_WORKSPACE_ID, ACTOR_ID, EVENT_ID, 'not-a-uuid', { manualOverride: 10.5, overrideReason: 'reason' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
