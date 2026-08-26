import { Router } from 'express';
import { inviteWorkspaceMember, listAccessibleWorkspaces, listWorkspaceInvitations, listWorkspaceMembers, removeWorkspaceMember, resendWorkspaceInvitation, revokeWorkspaceInvitation, updateWorkspaceMemberRole } from '../controllers/workspaces.js';
import { requireCoach, requireCurrentWorkspace } from '../middleware/capabilities.js';

const router = Router();
router.get('/', listAccessibleWorkspaces);
router.get('/:workspaceId/members', requireCurrentWorkspace, requireCoach(), listWorkspaceMembers);
router.patch('/:workspaceId/members/:userId', requireCurrentWorkspace, requireCoach(), updateWorkspaceMemberRole);
router.get('/:workspaceId/invitations', requireCurrentWorkspace, requireCoach(), listWorkspaceInvitations);
router.post('/:workspaceId/invitations', requireCurrentWorkspace, requireCoach(), inviteWorkspaceMember);
router.post('/:workspaceId/invitations/:invitationId/resend', requireCurrentWorkspace, requireCoach(), resendWorkspaceInvitation);
router.delete('/:workspaceId/invitations/:invitationId', requireCurrentWorkspace, requireCoach(), revokeWorkspaceInvitation);
router.delete('/:workspaceId/members/:userId', requireCurrentWorkspace, requireCoach(), removeWorkspaceMember);
export default router;
