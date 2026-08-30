import { Router } from 'express';
import * as statistics from '../controllers/statistics.js';
import { requireAthleteOwnership } from '../middleware/ownership.js';

const router = Router({ mergeParams: true });

router.get('/:id/statistics', requireAthleteOwnership, statistics.getAthleteStatistics);
router.get('/:id/progression', requireAthleteOwnership, statistics.getAthleteProgression);

export default router;
