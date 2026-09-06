import type { RequestHandler } from 'express';
import { getApplicationUserContext, getLocalApplicationUserContext } from '../middleware/auth.js';
import { acceptInvitation, changeMemberRole, createInvitation, listInvitations, listMembers, listWorkspaces, removeMember, resendInvitation, revokeInvitation } from '../services/workspaces.js';
import { getVerifiedAuth0Context } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';

function parameter(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  return value;
}

export const listAccessibleWorkspaces: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getLocalApplicationUserContext(req);
    const workspaces = await listWorkspaces(userId);
    const requestedWorkspaceId = req.header('X-Workspace-Id');
    const activeWorkspaceId = workspaces.find((workspace) => workspace.id === requestedWorkspaceId)?.id
      ?? workspaces[0]?.id
      ?? '';
    res.json({ data: workspaces, meta: { count: workspaces.length, activeWorkspaceId } });
  } catch (error) {
    next(error);
  }
};

export const listWorkspaceMembers: RequestHandler = async (req, res, next) => { try { const members = await listMembers(parameter(req.params.workspaceId)); res.json({ data: members, meta: { count: members.length } }); } catch (error) { next(error); } };
export const listWorkspaceInvitations: RequestHandler = async (req, res, next) => { try { const invitations = await listInvitations(parameter(req.params.workspaceId)); res.json({ data: invitations, meta: { count: invitations.length } }); } catch (error) { next(error); } };
export const inviteWorkspaceMember: RequestHandler = async (req, res, next) => { try {
  const { userId } = getApplicationUserContext(req); const { email, role, expiresInDays } = req.body ?? {};
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || !['coach', 'assistant'].includes(role)) throw new ApiError(422, 'INVITATION_INVALID', 'Email and role are required');
  if (expiresInDays !== undefined && (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30)) throw new ApiError(422, 'INVITATION_INVALID', 'Expiry must be between 1 and 30 days');
  const invitation = await createInvitation(parameter(req.params.workspaceId), userId, email.trim(), role, expiresInDays); res.status(201).json({ data: invitation });
} catch (error) { next(error); } };
export const acceptWorkspaceInvitation: RequestHandler = async (req, res, next) => { try { const workspace = await acceptInvitation(parameter(req.params.token), getVerifiedAuth0Context(req).auth0Id); res.json({ data: workspace }); } catch (error) { next(error); } };
export const revokeWorkspaceInvitation: RequestHandler = async (req, res, next) => { try { const { userId } = getApplicationUserContext(req); await revokeInvitation(parameter(req.params.workspaceId), parameter(req.params.invitationId), userId); res.status(204).end(); } catch (error) { next(error); } };
export const resendWorkspaceInvitation: RequestHandler = async (req, res, next) => { try { const { userId } = getApplicationUserContext(req); const invitation = await resendInvitation(parameter(req.params.workspaceId), parameter(req.params.invitationId), userId); res.status(201).json({ data: invitation }); } catch (error) { next(error); } };
export const removeWorkspaceMember: RequestHandler = async (req, res, next) => { try { const { userId } = getApplicationUserContext(req); await removeMember(parameter(req.params.workspaceId), parameter(req.params.userId), userId); res.status(204).end(); } catch (error) { next(error); } };
export const updateWorkspaceMemberRole: RequestHandler = async (req, res, next) => { try { const { userId } = getApplicationUserContext(req); const role = req.body?.role; if (!['coach', 'assistant'].includes(role)) throw new ApiError(422, 'MEMBER_ROLE_INVALID', 'Role must be coach or assistant'); await changeMemberRole(parameter(req.params.workspaceId), parameter(req.params.userId), role, userId); res.status(204).end(); } catch (error) { next(error); } };
