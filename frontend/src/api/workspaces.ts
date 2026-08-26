import { request } from './client';
import type { Workspace, WorkspaceInvitation, WorkspaceMember } from '../types';

export interface WorkspaceListResponse {
  data: Workspace[];
  meta: { count: number; activeWorkspaceId: string };
}

export async function listWorkspaces(): Promise<WorkspaceListResponse> {
  return request<WorkspaceListResponse>('/api/v1/workspaces');
}

export async function listWorkspaceMembers(workspaceId: string): Promise<{ data: WorkspaceMember[]; meta: { count: number } }> {
  return request(`/api/v1/workspaces/${workspaceId}/members`);
}

export async function listWorkspaceInvitations(workspaceId: string): Promise<{ data: WorkspaceInvitation[]; meta: { count: number } }> {
  return request(`/api/v1/workspaces/${workspaceId}/invitations`);
}

export async function inviteWorkspaceMember(workspaceId: string, invitation: { email: string; role: 'coach' | 'assistant'; expiresInDays?: number }): Promise<WorkspaceInvitation> {
  const response = await request<{ data: WorkspaceInvitation }>(`/api/v1/workspaces/${workspaceId}/invitations`, {
    method: 'POST', body: JSON.stringify(invitation),
  });
  return response.data;
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  await request<void>(`/api/v1/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' });
}

export async function updateWorkspaceMemberRole(workspaceId: string, userId: string, role: 'coach' | 'assistant'): Promise<void> {
  await request<void>(`/api/v1/workspaces/${workspaceId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
}

export async function revokeWorkspaceInvitation(workspaceId: string, invitationId: string): Promise<void> {
  await request<void>(`/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`, { method: 'DELETE' });
}

export async function resendWorkspaceInvitation(workspaceId: string, invitationId: string): Promise<WorkspaceInvitation> {
  const response = await request<{ data: WorkspaceInvitation }>(`/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/resend`, { method: 'POST' });
  return response.data;
}

export async function acceptWorkspaceInvitation(token: string): Promise<Workspace> {
  const response = await request<{ data: Workspace }>(`/api/v1/workspaces/invitations/${token}/accept`, { method: 'POST' });
  return response.data;
}
