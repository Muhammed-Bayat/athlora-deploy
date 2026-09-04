import { Router } from 'express';
import * as results from '../controllers/results.js';
import { requireEventOwnership, requireResultOwnership } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import { requireOperationalAccess } from '../middleware/capabilities.js';
import { parseResultOverridePayload } from '../validation/payloads.js';

const router = Router({ mergeParams: true });

router.get('/:eventId/results', requireEventOwnership('eventId'), results.getEventResults);
router.put(
  '/:eventId/results/:athleteId',
  validateBody(parseResultOverridePayload),
  requireOperationalAccess(),
  requireResultOwnership,
  results.overrideResult,
);

export default router;
