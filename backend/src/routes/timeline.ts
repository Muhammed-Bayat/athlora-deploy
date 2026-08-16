import { Router } from 'express';
import * as timeline from '../controllers/timeline.js';
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
  timeline.createTimelineEntry,
);
router.patch(
  '/:eventId/entries/:entryId',
  validateBody(parseTimelineEntryPatchPayload),
  requireTimelineEntryOwnership,
  requireEventLoggingOpen,
  timeline.updateTimelineEntry,
);
router.delete(
  '/:eventId/entries/:entryId',
  requireTimelineEntryOwnership,
  requireEventLoggingOpen,
  timeline.removeTimelineEntry,
);

export default router;
