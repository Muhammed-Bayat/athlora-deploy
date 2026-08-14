import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';
import {
  requireEventAthleteOwnership,
  requireTimelineEntryOwnership,
} from '../middleware/ownership.js';

const router = Router();

router.post('/:eventId/entries', requireEventAthleteOwnership, notImplemented);
router.patch('/:eventId/entries/:entryId', requireTimelineEntryOwnership, notImplemented);
router.delete('/:eventId/entries/:entryId', requireTimelineEntryOwnership, notImplemented);

export default router;
