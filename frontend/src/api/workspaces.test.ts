import { afterEach, describe, expect, it, vi } from 'vitest';
import * as workspaces from './workspaces';
afterEach(() => vi.unstubAllGlobals());
function response(data: unknown, status = 200) { return new Response(status === 204 ? null : JSON.stringify(data), { status }); }
describe('workspace API', () => {
  it('covers membership and invitation lifecycle requests', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    for (let index = 0; index < 9; index += 1) fetchMock.mockResolvedValueOnce(response(index === 0 || index === 1 || index === 2 ? { data: [], meta: { count: 0, activeWorkspaceId: 'workspace-1' } } : { data: { id: 'resource-1' } }, index === 4 || index === 5 || index === 6 ? 204 : 200));
    vi.stubGlobal('fetch', fetchMock);
    await workspaces.listWorkspaces(); await workspaces.listWorkspaceMembers('workspace-1'); await workspaces.listWorkspaceInvitations('workspace-1'); await workspaces.inviteWorkspaceMember('workspace-1', { email: 'coach@example.com', role: 'assistant' }); await workspaces.removeWorkspaceMember('workspace-1', 'user-1'); await workspaces.updateWorkspaceMemberRole('workspace-1', 'user-1', 'coach'); await workspaces.revokeWorkspaceInvitation('workspace-1', 'invite-1'); await workspaces.resendWorkspaceInvitation('workspace-1', 'invite-1'); await workspaces.acceptWorkspaceInvitation('token');
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls[5]?.[1]).toEqual(expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'coach' }) }));
  });
});
