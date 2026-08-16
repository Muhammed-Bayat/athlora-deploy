import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';
import {
  requireEventAthleteOwnership,
  requireEventLoggingOpen,
  requireTimelineEntryOwnership,
} from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import {
  parseTimelineEntryCreatePayload,
  parseTimelineEntryPatchPayload,
} from '../validation/payloads.js';

const router = Router();

router.post(
  '/:eventId/entries',
  validateBody(parseTimelineEntryCreatePayload),
  requireEventAthleteOwnership,
  requireEventLoggingOpen,
  notImplemented,
);
router.patch(
  '/:eventId/entries/:entryId',
  validateBody(parseTimelineEntryPatchPayload),
  requireTimelineEntryOwnership,
  requireEventLoggingOpen,
  notImplemented,
);
router.delete(
  '/:eventId/entries/:entryId',
  requireTimelineEntryOwnership,
  requireEventLoggingOpen,
  notImplemented,
);

export default router;
