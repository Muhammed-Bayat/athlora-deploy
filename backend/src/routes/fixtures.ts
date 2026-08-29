import { Router } from 'express';
import * as fixtures from '../controllers/fixtures.js';
import { requireCoach } from '../middleware/capabilities.js';
import { requireEventOwnership } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import {
  parseEventParticipantCreatePayload,
  parseEventParticipantReplacementPayload,
  parseFixtureInvitationCreatePayload,
  parseFixtureInvitationResponsePayload,
  parseResultOverridePayload,
  parseTimelineEntryCreatePayload,
  parseTimelineEntryDeletePayload,
  parseTimelineEntryPatchPayload,
} from '../validation/payloads.js';

export const fixtureHostRouter = Router();
fixtureHostRouter.get('/:eventId/fixture-invitations', requireCoach(), requireEventOwnership('eventId'), fixtures.listInvitations);
fixtureHostRouter.post('/:eventId/fixture-invitations', requireCoach(), requireEventOwnership('eventId'), validateBody(parseFixtureInvitationCreatePayload), fixtures.createInvitation);
fixtureHostRouter.post('/:eventId/fixture-invitations/:invitationId/resend', requireCoach(), requireEventOwnership('eventId'), fixtures.resendInvitation);
fixtureHostRouter.delete('/:eventId/fixture-invitations/:invitationId', requireCoach(), requireEventOwnership('eventId'), fixtures.revokeInvitation);
fixtureHostRouter.get('/:eventId/fixture-rosters', requireCoach(), requireEventOwnership('eventId'), fixtures.hostedRosters);
fixtureHostRouter.post('/:eventId/fixture-workspaces/:workspaceId/withdrawal', requireCoach(), requireEventOwnership('eventId'), fixtures.hostWithdrawal);

const fixtureGuestRouter = Router();
fixtureGuestRouter.post('/invitations/:token/respond', requireCoach(), validateBody(parseFixtureInvitationResponsePayload), fixtures.respond);
fixtureGuestRouter.get('/', fixtures.listGuest);
fixtureGuestRouter.get('/:eventId', fixtures.getGuest);
fixtureGuestRouter.get('/:eventId/participants', fixtures.listGuestParticipants);
fixtureGuestRouter.post('/:eventId/participants', requireCoach(), validateBody(parseEventParticipantCreatePayload), fixtures.addGuestParticipant);
fixtureGuestRouter.put('/:eventId/participants/:athleteId', requireCoach(), validateBody(parseEventParticipantReplacementPayload), fixtures.updateGuestParticipant);
fixtureGuestRouter.delete('/:eventId/participants/:athleteId', requireCoach(), fixtures.removeGuestParticipant);
fixtureGuestRouter.post('/:eventId/withdrawal', requireCoach(), fixtures.guestWithdrawal);
fixtureGuestRouter.get('/:eventId/entries', fixtures.listGuestEntries);
fixtureGuestRouter.post('/:eventId/entries', requireCoach(), validateBody(parseTimelineEntryCreatePayload), fixtures.createGuestEntry);
fixtureGuestRouter.patch('/:eventId/entries/:entryId', requireCoach(), validateBody(parseTimelineEntryPatchPayload), fixtures.updateGuestEntry);
fixtureGuestRouter.delete('/:eventId/entries/:entryId', requireCoach(), validateBody(parseTimelineEntryDeletePayload), fixtures.removeGuestEntry);
fixtureGuestRouter.get('/:eventId/results', fixtures.listGuestResults);
fixtureGuestRouter.put('/:eventId/results/:athleteId', requireCoach(), validateBody(parseResultOverridePayload), fixtures.overrideGuestResult);

export default fixtureGuestRouter;
