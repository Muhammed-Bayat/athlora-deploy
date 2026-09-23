import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));
vi.mock('../db/transaction.js', () => ({
  withTransaction: vi.fn(async (operation: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
    const query = vi.fn();
    return operation({ query } as never);
  }),
}));

import { getPool } from '../db/client.js';
import {
  assertActiveClubWorkspace,
  createClub,
  createJoinRequest,
  getClubComparison,
  getClubMultiComparison,
  getClubPublication,
  getClubStatistics,
  listClubComparisonAthletes,
  listClubCalendarEvents,
  listClubJoinRequests,
  listClubs,
  listMyJoinRequests,
  reviewJoinRequest,
  updateClubPublication,
  withdrawJoinRequest,
} from './clubs.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CLUB_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-5555-8555-555555555555';
const EVENT_ID = '66666666-6666-4666-8666-666666666666';
const query = vi.fn();

function poolRow(rows: unknown[] = []) {
  return { rows, rowCount: rows.length } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as never);
});

describe('listClubs', () => {
  it('returns mapped club rows for a search', async () => {
    query.mockResolvedValue(poolRow([{ id: CLUB_ID, workspace_id: WORKSPACE_ID, name: 'Sprinters', created_at: new Date(), updated_at: new Date() }]));

    const clubs = await listClubs('Sprinters');

    expect(clubs).toHaveLength(1);
    expect(clubs[0]).toMatchObject({ id: CLUB_ID, name: 'Sprinters', workspaceId: WORKSPACE_ID });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('ILIKE');
    expect(query.mock.calls[0][1]).toEqual(['Sprinters']);
  });

  it('returns all clubs when search is null', async () => {
    query.mockResolvedValue(poolRow([]));
    await listClubs(null);
    expect(query.mock.calls[0][1]).toEqual([null]);
  });
});

describe('listClubCalendarEvents', () => {
  it('returns selected clubs upcoming events in the requested season and preserves club attribution', async () => {
    query.mockResolvedValue(poolRow([{
      ...{
        id: EVENT_ID, created_by: USER_ID, type: 'competition', discipline: '100m', title: 'Rival Relay',
        date: '2026-08-22', time: null, location_name: null, latitude: null, longitude: null,
        status: 'scheduled', created_at: new Date('2026-08-14T10:00:00.000Z'), updated_at: new Date('2026-08-14T10:00:00.000Z'),
      },
      club_id: CLUB_ID,
      club_name: 'Sprinters',
    }]));

    const calendar = await listClubCalendarEvents([CLUB_ID], undefined, {
      selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01',
    });

    expect(calendar).toMatchObject([{ club: { id: CLUB_ID, name: 'Sprinters' }, event: { id: EVENT_ID, title: 'Rival Relay' } }]);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('c.id = ANY($1::uuid[])');
    expect(sql).toContain('e.date >= CURRENT_DATE');
    expect(sql).toContain('e.date >= $2::date AND e.date < $3::date');
    expect(parameters).toEqual([[CLUB_ID], '2026-01-01', '2027-01-01']);
  });

  it('rejects an empty or malformed club selection before querying', async () => {
    await expect(listClubCalendarEvents([])).rejects.toMatchObject({
      status: 422,
      code: 'CLUB_CALENDAR_SELECTION_INVALID',
    });
    await expect(listClubCalendarEvents(['not-a-uuid'])).rejects.toMatchObject({
      status: 422,
      code: 'CLUB_CALENDAR_SELECTION_INVALID',
    });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('club comparison data', () => {
  it('builds multi-club comparisons from the existing statistics aggregate', async () => {
    query.mockImplementation((sql: string, parameters: unknown[]) => {
      if (sql.includes('FROM clubs WHERE id')) {
        const clubId = parameters[0];
        return Promise.resolve(poolRow([clubId === CLUB_ID
          ? { id: CLUB_ID, workspace_id: WORKSPACE_ID, name: 'Sprinters' }
          : { id: REQUEST_ID, workspace_id: USER_ID, name: 'Rivals' }]));
      }
      return Promise.resolve(poolRow([{
        active_count: 0, inactive_count: 0, archived_count: 0, total_count: 0,
        distinct_athletes_with_valid_results: 0, total_100m_result_count: 0,
        valid_100m_result_count: 0, fastest_valid_time: null, latest_valid_time: null,
        average_valid_time: null, median_valid_time: null, population_standard_deviation: null,
      }]));
    });

    await expect(getClubMultiComparison([CLUB_ID, REQUEST_ID])).resolves.toMatchObject({
      clubs: [{ club: { id: CLUB_ID } }, { club: { id: REQUEST_ID } }],
    });
    await expect(getClubMultiComparison([CLUB_ID])).rejects.toMatchObject({ code: 'CLUB_IDS_INVALID' });
  });

  it('lists only non-archived safe athlete lookup fields', async () => {
    query
      .mockResolvedValueOnce(poolRow([{ id: CLUB_ID, workspace_id: WORKSPACE_ID, name: 'Sprinters' }]))
      .mockResolvedValueOnce(poolRow([
        { id: USER_ID, name: 'Ari Runner', lifecycle_status: 'active' },
        { id: ACTOR_ID, name: 'Bea Runner', lifecycle_status: 'inactive' },
      ]));

    const athletes = await listClubComparisonAthletes(CLUB_ID, 'Runner');

    expect(athletes).toEqual([
      { id: USER_ID, name: 'Ari Runner', status: 'active' },
      { id: ACTOR_ID, name: 'Bea Runner', status: 'inactive' },
    ]);
    const [sql, parameters] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain("a.lifecycle_status <> 'archived'");
    expect(sql).toContain('ILIKE');
    expect(parameters).toEqual([WORKSPACE_ID, 'Runner']);
  });

  it('derives all-time club statistics from effective valid results', async () => {
    query
      .mockResolvedValueOnce(poolRow([{ id: CLUB_ID, workspace_id: WORKSPACE_ID, name: 'Sprinters' }]))
      .mockResolvedValueOnce(poolRow([{
        active_count: '2', inactive_count: '1', archived_count: '1', total_count: '4',
        distinct_athletes_with_valid_results: '2', total_100m_result_count: '5',
        valid_100m_result_count: '3', fastest_valid_time: '10.90', latest_valid_time: '11.20',
        average_valid_time: '11.10', median_valid_time: '11.20', population_standard_deviation: '0.12',
      }]));

    const statistics = await getClubStatistics(CLUB_ID);

    expect(statistics).toEqual({
      club: { id: CLUB_ID, name: 'Sprinters' },
      roster: { active: 2, inactive: 1, archived: 1, total: 4 },
      distinctAthletesWithValidResults: 2,
      total100mResultCount: 5,
      valid100mResultCount: 3,
      fastestValidTime: 10.9,
      latestValidTime: 11.2,
      averageValidTime: 11.1,
      medianValidTime: 11.2,
      populationStandardDeviation: 0.12,
    });
    const [sql, parameters] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain("e.status <> 'cancelled'");
    expect(sql).toContain("fw.role = 'guest'");
    expect(sql).toContain("fw.status = 'accepted'");
    expect(sql).toContain('stddev_pop');
    expect(parameters).toEqual([WORKSPACE_ID, '100m', '2026-01-01', '2027-01-01']);
  });

  it('returns null population standard deviation for fewer than two valid results', async () => {
    query
      .mockResolvedValueOnce(poolRow([{ id: CLUB_ID, workspace_id: WORKSPACE_ID, name: 'Sprinters' }]))
      .mockResolvedValueOnce(poolRow([{
        active_count: '1', inactive_count: '0', archived_count: '0', total_count: '1',
        distinct_athletes_with_valid_results: '1', total_100m_result_count: '1',
        valid_100m_result_count: '1', fastest_valid_time: '11.20', latest_valid_time: '11.20',
        average_valid_time: '11.20', median_valid_time: '11.20', population_standard_deviation: null,
      }]));

    await expect(getClubStatistics(CLUB_ID)).resolves.toMatchObject({
      populationStandardDeviation: null,
    });
  });

  it('returns side-by-side statistics for two distinct clubs', async () => {
    const otherClubId = '66666666-6666-4666-8666-666666666666';
    const otherWorkspaceId = '77777777-7777-4777-8777-777777777777';
    const statisticsRow = {
      active_count: '0', inactive_count: '0', archived_count: '0', total_count: '0',
      distinct_athletes_with_valid_results: '0', total_100m_result_count: '0',
      valid_100m_result_count: '0', fastest_valid_time: null, latest_valid_time: null,
      average_valid_time: null, median_valid_time: null, population_standard_deviation: null,
    };
    query
      .mockResolvedValueOnce(poolRow([{ id: CLUB_ID, workspace_id: WORKSPACE_ID, name: 'Sprinters' }]))
      .mockResolvedValueOnce(poolRow([statisticsRow]))
      .mockResolvedValueOnce(poolRow([{ id: otherClubId, workspace_id: otherWorkspaceId, name: 'Harriers' }]))
      .mockResolvedValueOnce(poolRow([statisticsRow]));

    await expect(getClubComparison(CLUB_ID, otherClubId)).resolves.toMatchObject({
      clubs: [
        { club: { id: CLUB_ID, name: 'Sprinters' } },
        { club: { id: otherClubId, name: 'Harriers' } },
      ],
    });
  });

  it('rejects duplicate and absent club IDs', async () => {
    await expect(getClubComparison(CLUB_ID, CLUB_ID)).rejects.toMatchObject({
      status: 400,
      code: 'DUPLICATE_CLUB_ID',
    });

    query.mockResolvedValueOnce(poolRow([]));
    await expect(getClubComparison(CLUB_ID, '66666666-6666-4666-8666-666666666666')).rejects.toMatchObject({
      status: 404,
      code: 'CLUB_NOT_FOUND',
    });
  });
});

describe('createClub', () => {
  it('creates a workspace, club, and membership in a transaction', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;
    let transactionQuery: ReturnType<typeof vi.fn>;

    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      transactionQuery = vi.fn();
      transactionQuery.mockResolvedValueOnce({ rows: [] });
      transactionQuery.mockResolvedValueOnce({ rows: [{ id: WORKSPACE_ID }] });
      transactionQuery.mockResolvedValueOnce({ rows: [{ id: CLUB_ID, workspace_id: WORKSPACE_ID, name: 'Fast Club', created_at: new Date(), updated_at: new Date() }] });
      transactionQuery.mockResolvedValueOnce({ rows: [] });
      return operation({ query: transactionQuery } as never);
    });

    const club = await createClub(USER_ID, 'Fast Club');
    expect(club).toMatchObject({ id: CLUB_ID, name: 'Fast Club' });
  });

  it('rejects a user already in a workspace', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;

    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
      return operation({ query: tq } as never);
    });

    await expect(createClub(USER_ID, 'Club')).rejects.toMatchObject({
      status: 409,
      code: 'USER_ALREADY_IN_WORKSPACE',
    });
  });
});

describe('createJoinRequest', () => {
  it('rejects a user already in a workspace', async () => {
    query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
    await expect(createJoinRequest(CLUB_ID, USER_ID)).rejects.toMatchObject({
      status: 409,
      code: 'USER_ALREADY_IN_WORKSPACE',
    });
  });

  it('rejects a nonexistent club', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });
    await expect(createJoinRequest(CLUB_ID, USER_ID)).rejects.toMatchObject({
      status: 404,
      code: 'CLUB_NOT_FOUND',
    });
  });

  it('creates a join request successfully', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: REQUEST_ID, club_id: CLUB_ID, user_id: USER_ID, status: 'pending', reviewed_by: null, reviewed_at: null, created_at: new Date(), updated_at: new Date() }] });

    const request = await createJoinRequest(CLUB_ID, USER_ID);
    expect(request).toMatchObject({ id: REQUEST_ID, clubId: CLUB_ID, status: 'pending' });
  });

  it('rejects duplicate join requests', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    await expect(createJoinRequest(CLUB_ID, USER_ID)).rejects.toMatchObject({
      status: 409,
      code: 'CLUB_JOIN_REQUEST_EXISTS',
    });
  });
});

describe('listMyJoinRequests', () => {
  it('returns mapped join requests for a user', async () => {
    query.mockResolvedValue(poolRow([{
      id: REQUEST_ID, club_id: CLUB_ID, user_id: USER_ID, status: 'pending',
      reviewed_by: null, reviewed_at: null, created_at: new Date(), updated_at: new Date(),
    }]));

    const requests = await listMyJoinRequests(USER_ID);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ id: REQUEST_ID, clubId: CLUB_ID });
  });
});

describe('withdrawJoinRequest', () => {
  it('withdraws a pending join request', async () => {
    query.mockResolvedValue(poolRow([{ id: REQUEST_ID }]));
    await expect(withdrawJoinRequest(REQUEST_ID, USER_ID)).resolves.toBeUndefined();
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'withdrawn'");
  });

  it('rejects a nonexistent or non-pending join request', async () => {
    query.mockResolvedValue(poolRow([]));
    await expect(withdrawJoinRequest(REQUEST_ID, USER_ID)).rejects.toMatchObject({
      status: 404,
      code: 'CLUB_JOIN_REQUEST_NOT_FOUND',
    });
  });
});

describe('listClubJoinRequests', () => {
  it('returns pending join requests for a club', async () => {
    query.mockResolvedValue(poolRow([{
      id: REQUEST_ID, club_id: CLUB_ID, user_id: USER_ID, status: 'pending',
      reviewed_by: null, reviewed_at: null, created_at: new Date(), updated_at: new Date(),
      user_name: 'Alice', user_email: 'alice@test.com',
    }]));

    const requests = await listClubJoinRequests(CLUB_ID);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ clubId: CLUB_ID, userName: 'Alice', userEmail: 'alice@test.com' });
  });
});

describe('reviewJoinRequest', () => {
  it('approves a join request and adds workspace membership', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;

    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [{ id: REQUEST_ID, club_id: CLUB_ID, user_id: USER_ID, status: 'pending', reviewed_by: null, reviewed_at: null, created_at: new Date(), updated_at: new Date(), workspace_id: WORKSPACE_ID }] });
      tq.mockResolvedValueOnce({ rows: [] });
      tq.mockResolvedValueOnce({ rows: [] });
      tq.mockResolvedValueOnce({ rows: [{ id: REQUEST_ID, club_id: CLUB_ID, user_id: USER_ID, status: 'approved', reviewed_by: ACTOR_ID, reviewed_at: new Date(), created_at: new Date(), updated_at: new Date() }] });
      return operation({ query: tq } as never);
    });

    const result = await reviewJoinRequest(CLUB_ID, REQUEST_ID, ACTOR_ID, 'approved', 'coach');
    expect(result).toMatchObject({ id: REQUEST_ID, status: 'approved' });
  });

  it('rejects approval when user is already in a workspace', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;

    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [{ id: REQUEST_ID, club_id: CLUB_ID, user_id: USER_ID, status: 'pending', reviewed_by: null, reviewed_at: null, created_at: new Date(), updated_at: new Date(), workspace_id: WORKSPACE_ID }] });
      tq.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
      return operation({ query: tq } as never);
    });

    await expect(reviewJoinRequest(CLUB_ID, REQUEST_ID, ACTOR_ID, 'approved')).rejects.toMatchObject({
      status: 409,
      code: 'USER_ALREADY_IN_WORKSPACE',
    });
  });

  it('rejects a nonexistent join request', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;

    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [] });
      return operation({ query: tq } as never);
    });

    await expect(reviewJoinRequest(CLUB_ID, REQUEST_ID, ACTOR_ID, 'rejected')).rejects.toMatchObject({
      status: 404,
      code: 'CLUB_JOIN_REQUEST_NOT_FOUND',
    });
  });

  it('rejects a user already in a workspace on unique constraint violation', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;

    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [{ id: REQUEST_ID, club_id: CLUB_ID, user_id: USER_ID, status: 'pending', reviewed_by: null, reviewed_at: null, created_at: new Date(), updated_at: new Date(), workspace_id: WORKSPACE_ID }] });
      tq.mockResolvedValueOnce({ rows: [] });
      tq.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
      return operation({ query: tq } as never);
    });

    await expect(reviewJoinRequest(CLUB_ID, REQUEST_ID, ACTOR_ID, 'approved')).rejects.toMatchObject({
      status: 409,
      code: 'USER_ALREADY_IN_WORKSPACE',
    });
  });
});

describe('club publication', () => {
  it('reads both independent publication flags', async () => {
    query.mockResolvedValue(poolRow([{ public_results_enabled: true, public_schedule_enabled: false }]));

    await expect(getClubPublication(WORKSPACE_ID)).resolves.toEqual({
      publicResultsEnabled: true,
      publicScheduleEnabled: false,
    });
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('public_results_enabled');
    expect(sql).toContain('public_schedule_enabled');
    expect(parameters).toEqual([WORKSPACE_ID]);
  });

  it('writes both flags in one full-replacement update', async () => {
    query.mockResolvedValue(poolRow([{ public_results_enabled: false, public_schedule_enabled: true }]));

    await expect(updateClubPublication(WORKSPACE_ID, false, true)).resolves.toEqual({
      publicResultsEnabled: false,
      publicScheduleEnabled: true,
    });
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('public_results_enabled = $2');
    expect(sql).toContain('public_schedule_enabled = $3');
    expect(parameters).toEqual([WORKSPACE_ID, false, true]);
  });

  it('throws CLUB_NOT_FOUND when the workspace has no club row', async () => {
    query.mockResolvedValue(poolRow([]));
    await expect(getClubPublication(WORKSPACE_ID)).rejects.toMatchObject({ status: 404, code: 'CLUB_NOT_FOUND' });
    await expect(updateClubPublication(WORKSPACE_ID, true, true)).rejects.toMatchObject({ status: 404, code: 'CLUB_NOT_FOUND' });
  });
});

describe('assertActiveClubWorkspace', () => {
  it('rejects when club is not found', async () => {
    query.mockResolvedValue(poolRow([]));
    await expect(assertActiveClubWorkspace(CLUB_ID, WORKSPACE_ID)).rejects.toMatchObject({
      status: 404,
      code: 'CLUB_NOT_FOUND',
    });
  });

  it('resolves when the club belongs to the workspace', async () => {
    query.mockResolvedValue(poolRow([{ id: CLUB_ID }]));
    await expect(assertActiveClubWorkspace(CLUB_ID, WORKSPACE_ID)).resolves.toBeUndefined();
  });
});
