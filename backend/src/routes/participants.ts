import { Router } from 'express';
import * as participants from '../controllers/participants.js';
import {
  requireEventAthleteOwnership,
  requireEventOwnership,
  requireParticipantOwnership,
} from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import {
  parseEventParticipantCreatePayload,
  parseEventParticipantReplacementPayload,
} from '../validation/payloads.js';

const router = Router();

router.get(
  '/:eventId/participants',
  requireEventOwnership('eventId'),
  participants.listEventParticipants,
);
router.post(
  '/:eventId/participants',
  validateBody(parseEventParticipantCreatePayload),
  requireEventAthleteOwnership,
  participants.addEventParticipant,
);
router.put(
  '/:eventId/participants/:athleteId',
  validateBody(parseEventParticipantReplacementPayload),
  requireParticipantOwnership,
  participants.updateEventParticipant,
);
router.delete(
  '/:eventId/participants/:athleteId',
  requireParticipantOwnership,
  participants.removeEventParticipant,
);

export default router;
