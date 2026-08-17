import { Router } from 'express';
import * as timeline from '../controllers/timeline.js';
import {
  requireEventAthleteOwnership,
  requireTimelineEntryOwnership,
} from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import {
  parseTimelineEntryCreatePayload,
  parseTimelineEntryPatchPayload,
} from '../validation/payloads.js';

const router = Router({ mergeParams: true });

router.post(
  '/:eventId/entries',
  validateBody(parseTimelineEntryCreatePayload),
  requireEventAthleteOwnership,
  timeline.createTimelineEntry,
);
router.patch(
  '/:eventId/entries/:entryId',
  validateBody(parseTimelineEntryPatchPayload),
  requireTimelineEntryOwnership,
  timeline.updateTimelineEntry,
);
router.delete('/:eventId/entries/:entryId', requireTimelineEntryOwnership, timeline.deleteTimelineEntry);

export default router;
