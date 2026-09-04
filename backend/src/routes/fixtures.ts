import { Router } from 'express';
import * as fixtures from '../controllers/fixtures.js';
import { requireCoach, requireOperationalAccess } from '../middleware/capabilities.js';
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
fixtureHostRouter.get('/:eventId/fixture-invitations', requireOperationalAccess(), requireEventOwnership('eventId'), fixtures.listInvitations);
fixtureHostRouter.post('/:eventId/fixture-invitations', requireOperationalAccess(), requireEventOwnership('eventId'), validateBody(parseFixtureInvitationCreatePayload), fixtures.createInvitation);
fixtureHostRouter.post('/:eventId/fixture-invitations/:invitationId/resend', requireOperationalAccess(), requireEventOwnership('eventId'), fixtures.resendInvitation);
fixtureHostRouter.delete('/:eventId/fixture-invitations/:invitationId', requireOperationalAccess(), requireEventOwnership('eventId'), fixtures.revokeInvitation);
fixtureHostRouter.get('/:eventId/fixture-rosters', requireOperationalAccess(), requireEventOwnership('eventId'), fixtures.hostedRosters);
fixtureHostRouter.post('/:eventId/fixture-workspaces/:workspaceId/withdrawal', requireCoach(), requireEventOwnership('eventId'), fixtures.hostWithdrawal);
fixtureHostRouter.get('/:eventId/fixture-entries', requireOperationalAccess(), requireEventOwnership('eventId'), fixtures.hostedEntries);
fixtureHostRouter.get('/:eventId/fixture-results', requireOperationalAccess(), requireEventOwnership('eventId'), fixtures.hostedResults);
fixtureHostRouter.put('/:eventId/fixture-results/:athleteId', requireOperationalAccess(), requireEventOwnership('eventId'), validateBody(parseResultOverridePayload), fixtures.overrideHostResult);

const fixtureGuestRouter = Router();
fixtureGuestRouter.get('/incoming', fixtures.listIncoming);
fixtureGuestRouter.post('/incoming/:invitationId/respond', requireOperationalAccess(), validateBody(parseFixtureInvitationResponsePayload), fixtures.respondIncoming);
fixtureGuestRouter.post('/invitations/:token/respond', requireOperationalAccess(), validateBody(parseFixtureInvitationResponsePayload), fixtures.respond);
fixtureGuestRouter.get('/', fixtures.listGuest);
fixtureGuestRouter.get('/:eventId', fixtures.getGuest);
fixtureGuestRouter.get('/:eventId/participants', fixtures.listGuestParticipants);
fixtureGuestRouter.post('/:eventId/participants', requireCoach(), validateBody(parseEventParticipantCreatePayload), fixtures.addGuestParticipant);
fixtureGuestRouter.put('/:eventId/participants/:athleteId', requireCoach(), validateBody(parseEventParticipantReplacementPayload), fixtures.updateGuestParticipant);
fixtureGuestRouter.delete('/:eventId/participants/:athleteId', requireCoach(), fixtures.removeGuestParticipant);
fixtureGuestRouter.post('/:eventId/withdrawal', requireCoach(), fixtures.guestWithdrawal);
fixtureGuestRouter.get('/:eventId/entries', fixtures.listGuestEntries);
fixtureGuestRouter.post('/:eventId/entries', requireOperationalAccess(), validateBody(parseTimelineEntryCreatePayload), fixtures.createGuestEntry);
fixtureGuestRouter.patch('/:eventId/entries/:entryId', requireOperationalAccess(), validateBody(parseTimelineEntryPatchPayload), fixtures.updateGuestEntry);
fixtureGuestRouter.delete('/:eventId/entries/:entryId', requireOperationalAccess(), validateBody(parseTimelineEntryDeletePayload), fixtures.removeGuestEntry);
fixtureGuestRouter.get('/:eventId/results', fixtures.listGuestResults);
fixtureGuestRouter.put('/:eventId/results/:athleteId', requireOperationalAccess(), validateBody(parseResultOverridePayload), fixtures.overrideGuestResult);

export default fixtureGuestRouter;
