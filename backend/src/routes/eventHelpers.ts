import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
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

// Coach invitation management routes
router.post('/events/:eventId/helpers/invitations', requireAuth, handleCreateInvitation);
router.get('/events/:eventId/helpers/invitations', requireAuth, handleListInvitations);
router.post('/events/:eventId/helpers/invitations/:invitationId/rotate', requireAuth, handleRotateInvitation);
router.patch('/events/:eventId/helpers/invitations/:invitationId', requireAuth, handleUpdateInvitationStatus);
router.delete('/events/:eventId/helpers/grants/:grantId', requireAuth, handleRevokeGrant);

// Helper redemption route (rate limited)
router.post('/events/helpers/redeem', requireAuth, rateLimitRedemption, handleRedeemInvitation);

export default router;
