import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';
import { requireEventOwnership, requireResultOwnership } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import { parseResultOverridePayload } from '../validation/payloads.js';

const router = Router();

router.get('/:eventId/results', requireEventOwnership('eventId'), notImplemented);
router.put(
  '/:eventId/results/:athleteId',
  validateBody(parseResultOverridePayload),
  requireResultOwnership,
  notImplemented,
);

export default router;
