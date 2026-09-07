import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));
vi.mock('../db/transaction.js', () => ({ withTransaction: vi.fn(async (operation) => operation({ query } as never)) }));

import { getPool } from '../db/client.js';
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  listInvitations,
  listMembers,
  listWorkspaces,
  removeMember,
  resendInvitation,
  resolveWorkspace,
  revokeInvitation,
} from './workspaces.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

describe('workspaces', () => {
  it('lists only the authenticated user memberships in stable order', async () => {
    query.mockResolvedValue({ rows: [{ id: WORKSPACE_ID, name: 'Sprinters', timezone: 'UTC', role: 'assistant' }] });

    await expect(listWorkspaces(USER_ID)).resolves.toEqual([
      { id: WORKSPACE_ID, name: 'Sprinters', timezone: 'UTC', role: 'assistant' },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE wm.user_id = $1'), [USER_ID]);
  });

  it('does not resolve a workspace without a membership', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(resolveWorkspace(USER_ID, WORKSPACE_ID)).rejects.toMatchObject({
      status: 403,
      code: 'WORKSPACE_ACCESS_DENIED',
    });
  });

  it('stores only a hash of a new invitation token and writes an audit record', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'invite', email: 'assistant@example.test', role: 'assistant', expiresAt: 'date', createdAt: 'date' }] }).mockResolvedValueOnce({ rows: [] });
    const invitation = await createInvitation(WORKSPACE_ID, USER_ID, 'assistant@example.test', 'assistant');
    expect(invitation.token).toBeTruthy();
    expect(query.mock.calls[0][0]).toContain('token_hash');
    expect(query.mock.calls[0][1][3]).not.toBe(invitation.token);
    expect(query.mock.calls[1][0]).toContain("'invited'");
  });

  it('accepts only an active invitation for the authenticated account email', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'invite', workspace_id: WORKSPACE_ID, email: 'assistant@example.test', role: 'assistant', name: 'Sprinters', timezone: 'UTC' }] })
      .mockResolvedValueOnce({ rows: [{ id: USER_ID, email: 'assistant@example.test' }] })
      .mockResolvedValue({ rows: [] });
    await expect(acceptInvitation('raw-token', 'auth0|assistant')).resolves.toMatchObject({ id: WORKSPACE_ID, role: 'assistant' });
    expect(query.mock.calls[0][0]).toContain('accepted_at IS NULL');
    expect(query.mock.calls[0][0]).toContain('revoked_at IS NULL');
    expect(query.mock.calls[0][0]).toContain('expires_at > now()');
    expect(query.mock.calls[2][0]).toContain('workspace_members');
    expect(query.mock.calls[3][0]).toContain('workspace_members');
    expect(query.mock.calls[4][0]).toContain('accepted_at = now()');
  });

  it('rejects accepting an invitation when the user already belongs to a club', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'invite', workspace_id: WORKSPACE_ID, email: 'assistant@example.test', role: 'assistant', name: 'Sprinters', timezone: 'UTC' }] })
      .mockResolvedValueOnce({ rows: [{ id: USER_ID, email: 'assistant@example.test' }] })
      .mockResolvedValueOnce({ rows: [{ '1': 1 }] });

    await expect(acceptInvitation('raw-token', 'auth0|assistant')).rejects.toMatchObject({
      status: 409,
      code: 'USER_ALREADY_IN_WORKSPACE',
    });
  });

  it('replaces an active invitation token when it is resent', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ email: 'assistant@example.test', role: 'assistant' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'replacement', email: 'assistant@example.test', role: 'assistant', expiresAt: 'date', createdAt: 'date' }] })
      .mockResolvedValueOnce({ rows: [] });
    const invitation = await resendInvitation(WORKSPACE_ID, 'invite', USER_ID);
    expect(invitation.token).toBeTruthy();
    expect(query.mock.calls[1][0]).toContain('revoked_at = now()');
    expect(query.mock.calls[2][1][3]).not.toBe(invitation.token);
    expect(query.mock.calls[3][0]).toContain("'resent'");
  });

  it('rejects resend when invitation is not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(resendInvitation(WORKSPACE_ID, 'missing', USER_ID)).rejects.toMatchObject({
      status: 404,
      code: 'INVITATION_NOT_FOUND',
    });
  });
});

describe('listMembers', () => {
  it('returns workspace members', async () => {
    query.mockResolvedValue({ rows: [{ userId: USER_ID, name: 'Coach', email: 'c@test.com', role: 'coach', createdAt: '2026-01-01' }] });
    const members = await listMembers(WORKSPACE_ID);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: USER_ID, role: 'coach' });
  });
});

describe('listInvitations', () => {
  it('returns pending invitations', async () => {
    query.mockResolvedValue({ rows: [{ id: 'inv', email: 'a@test.com', role: 'assistant', expiresAt: '2026-12-31', createdAt: '2026-01-01' }] });
    const invitations = await listInvitations(WORKSPACE_ID);
    expect(invitations).toHaveLength(1);
  });
});

describe('revokeInvitation', () => {
  it('revokes an active invitation', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'inv', role: 'assistant' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(revokeInvitation(WORKSPACE_ID, 'inv', USER_ID)).resolves.toBeUndefined();
    expect(query.mock.calls[0][0]).toContain('revoked_at = now()');
  });

  it('rejects when invitation is not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(revokeInvitation(WORKSPACE_ID, 'missing', USER_ID)).rejects.toMatchObject({
      status: 404,
      code: 'INVITATION_NOT_FOUND',
    });
  });
});

describe('removeMember', () => {
  it('removes a member successfully', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;
    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [{ role: 'assistant' }] });
      tq.mockResolvedValueOnce({ rows: [] });
      tq.mockResolvedValueOnce({ rows: [] });
      return operation({ query: tq } as never);
    });
    await expect(removeMember(WORKSPACE_ID, USER_ID, ACTOR_ID)).resolves.toBeUndefined();
  });

  it('rejects removing the last coach', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;
    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [{ role: 'coach' }] });
      tq.mockResolvedValueOnce({ rows: [{ user_id: USER_ID, role: 'coach' }] });
      return operation({ query: tq } as never);
    });
    await expect(removeMember(WORKSPACE_ID, USER_ID, ACTOR_ID)).rejects.toMatchObject({
      status: 409,
      code: 'LAST_COACH_REQUIRED',
    });
  });

  it('rejects removing a nonexistent member', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;
    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [] });
      return operation({ query: tq } as never);
    });
    await expect(removeMember(WORKSPACE_ID, USER_ID, ACTOR_ID)).rejects.toMatchObject({
      status: 404,
      code: 'MEMBER_NOT_FOUND',
    });
  });
});

describe('changeMemberRole', () => {
  it('changes role successfully', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;
    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [{ role: 'assistant' }] });
      tq.mockResolvedValueOnce({ rows: [] });
      tq.mockResolvedValueOnce({ rows: [] });
      return operation({ query: tq } as never);
    });
    await expect(changeMemberRole(WORKSPACE_ID, USER_ID, 'coach', ACTOR_ID)).resolves.toBeUndefined();
  });

  it('rejects demoting the last coach', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;
    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [{ role: 'coach' }] });
      tq.mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] });
      return operation({ query: tq } as never);
    });
    await expect(changeMemberRole(WORKSPACE_ID, USER_ID, 'assistant', ACTOR_ID)).rejects.toMatchObject({
      status: 409,
      code: 'LAST_COACH_REQUIRED',
    });
  });

  it('rejects changing role of a nonexistent member', async () => {
    const withTransaction = (await import('../db/transaction.js')).withTransaction;
    vi.mocked(withTransaction).mockImplementation(async (operation) => {
      const tq = vi.fn();
      tq.mockResolvedValueOnce({ rows: [] });
      return operation({ query: tq } as never);
    });
    await expect(changeMemberRole(WORKSPACE_ID, USER_ID, 'coach', ACTOR_ID)).rejects.toMatchObject({
      status: 404,
      code: 'MEMBER_NOT_FOUND',
    });
  });
});
