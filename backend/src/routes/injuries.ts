import { Router } from 'express';
import * as injuries from '../controllers/injuries.js';
import { requireCoach } from '../middleware/capabilities.js';
import { requireAthleteOwnership } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import {
  parseInjuryCreatePayload,
  parseInjuryUpdatePayload,
  parseInjuryResolvePayload,
} from '../validation/payloads.js';

const router = Router({ mergeParams: true });

router.get('/', requireAthleteOwnership, injuries.listAthleteInjuries);
router.post(
  '/',
  requireCoach(),
  requireAthleteOwnership,
  validateBody(parseInjuryCreatePayload),
  injuries.createAthleteInjury,
);
router.put(
  '/:injuryId',
  requireCoach(),
  requireAthleteOwnership,
  validateBody(parseInjuryUpdatePayload),
  injuries.updateAthleteInjury,
);
router.post(
  '/:injuryId/resolve',
  requireCoach(),
  requireAthleteOwnership,
  validateBody(parseInjuryResolvePayload),
  injuries.resolveAthleteInjury,
);
router.post(
  '/:injuryId/reopen',
  requireCoach(),
  requireAthleteOwnership,
  injuries.reopenAthleteInjury,
);
router.delete(
  '/:injuryId',
  requireCoach(),
  requireAthleteOwnership,
  injuries.deleteAthleteInjury,
);

export default router;
