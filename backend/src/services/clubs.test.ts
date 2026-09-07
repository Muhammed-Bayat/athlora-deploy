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
  listClubJoinRequests,
  listClubs,
  listMyJoinRequests,
  reviewJoinRequest,
  withdrawJoinRequest,
} from './clubs.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CLUB_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-5555-8555-555555555555';
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
