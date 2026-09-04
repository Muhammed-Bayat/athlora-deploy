import { Router } from 'express';
import * as injuries from '../controllers/injuries.js';
import { requireOperationalAccess } from '../middleware/capabilities.js';
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
  requireOperationalAccess(),
  requireAthleteOwnership,
  validateBody(parseInjuryCreatePayload),
  injuries.createAthleteInjury,
);
router.put(
  '/:injuryId',
  requireOperationalAccess(),
  requireAthleteOwnership,
  validateBody(parseInjuryUpdatePayload),
  injuries.updateAthleteInjury,
);
router.post(
  '/:injuryId/resolve',
  requireOperationalAccess(),
  requireAthleteOwnership,
  validateBody(parseInjuryResolvePayload),
  injuries.resolveAthleteInjury,
);
router.post(
  '/:injuryId/reopen',
  requireOperationalAccess(),
  requireAthleteOwnership,
  injuries.reopenAthleteInjury,
);
router.delete(
  '/:injuryId',
  requireOperationalAccess(),
  requireAthleteOwnership,
  injuries.deleteAthleteInjury,
);

export default router;
