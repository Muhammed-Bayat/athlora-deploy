import { Router } from 'express';
import * as timeline from '../controllers/timeline.js';
import {
  requireEventAthleteOwnership,
  requireEventLoggingOpen,
  requireEventOwnership,
  requireTimelineEntryOwnership,
} from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import { requireTimelineWriteAccess } from '../middleware/capabilities.js';
import {
  parseTimelineEntryCreatePayload,
  parseTimelineEntryDeletePayload,
  parseTimelineEntryPatchPayload,
} from '../validation/payloads.js';

const router = Router({ mergeParams: true });

router.get(
  '/:eventId/entries',
  requireEventOwnership('eventId'),
  timeline.listTimelineEntries,
);

router.post(
  '/:eventId/entries',
  validateBody(parseTimelineEntryCreatePayload),
  requireTimelineWriteAccess,
  requireEventAthleteOwnership,
  requireEventLoggingOpen,
  timeline.createTimelineEntry,
);
router.patch(
  '/:eventId/entries/:entryId',
  requireTimelineEntryOwnership,
  requireTimelineWriteAccess,
  validateBody(parseTimelineEntryPatchPayload),
  requireEventLoggingOpen,
  timeline.updateTimelineEntry,
);
router.delete(
  '/:eventId/entries/:entryId',
  requireTimelineEntryOwnership,
  requireTimelineWriteAccess,
  validateBody(parseTimelineEntryDeletePayload),
  timeline.removeTimelineEntry,
);

export default router;
