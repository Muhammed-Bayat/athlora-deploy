import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

const mockOverrideResultRecord = vi.fn();
vi.mock('../controllers/results.js', () => ({ overrideResultRecord: mockOverrideResultRecord }));

import { getPool } from '../db/client.js';
import { listFixtureInvitations, listGuestFixtures, assertHostWorkspace, listHostedFixtureResults, listHostedFixtureEntries, overrideHostFixtureResult } from './fixtures.js';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const HOST_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';
const ATHLETE_ID = '55555555-5555-5555-8555-555555555555';
const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
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
