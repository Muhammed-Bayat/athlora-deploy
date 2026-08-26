import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));
vi.mock('../db/transaction.js', () => ({ withTransaction: vi.fn(async (operation) => operation({ query } as never)) }));

import { getPool } from '../db/client.js';
import { acceptInvitation, createInvitation, listWorkspaces, resendInvitation, resolveWorkspace } from './workspaces.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
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
    expect(query.mock.calls[3][0]).toContain('accepted_at = now()');
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
});
