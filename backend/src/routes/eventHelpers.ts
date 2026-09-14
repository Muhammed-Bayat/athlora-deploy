import { Router } from 'express';
import { resolveApplicationUser, verifyAuth0Token } from '../middleware/auth.js';
import { requireOperationalAccess } from '../middleware/capabilities.js';
import { requireEventOwnership } from '../middleware/ownership.js';
import {
  handleCreateInvitation,
  handleRotateInvitation,
  handleUpdateInvitationStatus,
  handleRevokeGrant,
  handleRedeemInvitation,
  handleListInvitations,
  rateLimitRedemption,
} from '../controllers/eventHelpers.js';

const router = Router();

const managementAccess = [verifyAuth0Token, resolveApplicationUser, requireOperationalAccess(), requireEventOwnership('eventId')];

router.post('/events/:eventId/helpers/invitations', ...managementAccess, handleCreateInvitation);
router.get('/events/:eventId/helpers/invitations', ...managementAccess, handleListInvitations);
router.post('/events/:eventId/helpers/invitations/:invitationId/rotate', ...managementAccess, handleRotateInvitation);
router.patch('/events/:eventId/helpers/invitations/:invitationId', ...managementAccess, handleUpdateInvitationStatus);
router.delete('/events/:eventId/helpers/grants/:grantId', ...managementAccess, handleRevokeGrant);

// Helper redemption route (rate limited)
router.post('/events/helpers/redeem', verifyAuth0Token, rateLimitRedemption, handleRedeemInvitation);

export default router;
