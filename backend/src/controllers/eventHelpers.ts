import type { Request, Response, NextFunction } from 'express';
import {
  createEventInvitation,
  rotateEventInvitation,
  updateInvitationStatus,
  revokeIndividualGrant,
  redeemInvitation,
  listEventInvitations,
  listEventGrants,
} from '../services/eventHelpers.js';
import { disconnectHelperFromEvent, notifyEventInvalidated } from '../realtime/index.js';

const redemptionAttempts = new Map<string, { count: number; resetTime: number }>();

export function rateLimitRedemption(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxAttempts = 10;

  let record = redemptionAttempts.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    redemptionAttempts.set(ip, record);
  } else {
    record.count++;
    if (record.count > maxAttempts) {
      res.status(429).json({ error: 'Too many redemption attempts. Please try again later.' });
      return;
    }
  }
  next();
}

export async function handleCreateInvitation(req: Request, res: Response): Promise<void> {
  try {
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : req.params.eventId[0];
    const actorSub = req.auth?.auth0Id || req.auth?.userId || 'system';
    const maxCap = req.body.maxCap ? parseInt(req.body.maxCap, 10) : 10;

    const result = await createEventInvitation(eventId, actorSub, maxCap);
    res.status(201).json({
      invitation: result.invitation,
      rawSecret: result.rawSecret,
      humanCode: result.humanCode,
      shareLink: `/events/${eventId}/redeem?secret=${result.rawSecret}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create invitation';
    res.status(400).json({ error: msg });
  }
}

export async function handleRotateInvitation(req: Request, res: Response): Promise<void> {
  try {
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : req.params.eventId[0];
    const invitationId = typeof req.params.invitationId === 'string' ? req.params.invitationId : req.params.invitationId[0];
    const actorSub = req.auth?.auth0Id || req.auth?.userId || 'system';

    const result = await rotateEventInvitation(eventId, invitationId, actorSub);
    res.status(200).json({
      invitation: result.invitation,
      rawSecret: result.rawSecret,
      humanCode: result.humanCode,
      shareLink: `/events/${eventId}/redeem?secret=${result.rawSecret}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to rotate invitation';
    res.status(400).json({ error: msg });
  }
}

export async function handleUpdateInvitationStatus(req: Request, res: Response): Promise<void> {
  try {
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : req.params.eventId[0];
    const invitationId = typeof req.params.invitationId === 'string' ? req.params.invitationId : req.params.invitationId[0];
    const { status } = req.body;
    const actorSub = req.auth?.auth0Id || req.auth?.userId || 'system';

    if (!['active', 'closed', 'revoked'].includes(status)) {
      res.status(400).json({ error: 'Invalid invitation status' });
      return;
    }

    const invitation = await updateInvitationStatus(eventId, invitationId, status, actorSub);
    res.status(200).json({ invitation });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to update invitation status';
    res.status(400).json({ error: msg });
  }
}

export async function handleRevokeGrant(req: Request, res: Response): Promise<void> {
  try {
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : req.params.eventId[0];
    const grantId = typeof req.params.grantId === 'string' ? req.params.grantId : req.params.grantId[0];
    const actorSub = req.auth?.auth0Id || req.auth?.userId || 'system';

    const grant = await revokeIndividualGrant(eventId, grantId, actorSub);
    disconnectHelperFromEvent(grant.auth0Sub, eventId);
    notifyEventInvalidated(eventId, 'event');
    res.status(200).json({ grant });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to revoke grant';
    res.status(400).json({ error: msg });
  }
}

export async function handleRedeemInvitation(req: Request, res: Response): Promise<void> {
  try {
    const auth0Sub = req.auth?.auth0Id || req.auth?.userId;
    if (!auth0Sub) {
      res.status(401).json({ error: 'Authentication required for redemption' });
      return;
    }

    const { secret, humanCode } = req.body;
    const result = await redeemInvitation({ secret, humanCode }, auth0Sub);
    res.status(200).json({ success: true, eventId: result.eventId, grant: result.grant });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to redeem invitation';
    res.status(400).json({ error: msg });
  }
}

export async function handleListInvitations(req: Request, res: Response): Promise<void> {
  try {
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : req.params.eventId[0];
    const invitations = await listEventInvitations(eventId);
    const grants = await listEventGrants(eventId);
    res.status(200).json({ invitations, grants });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to list invitations';
    res.status(400).json({ error: msg });
  }
}
