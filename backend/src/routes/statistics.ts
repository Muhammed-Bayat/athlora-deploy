import { Router } from 'express';
import * as statistics from '../controllers/statistics.js';
import { requireAthleteOwnership } from '../middleware/ownership.js';
import { getApplicationUserContext } from '../middleware/auth.js';
import { getPool } from '../db/client.js';
import { athleteRelayHistory } from '../services/relayHistory.js';

const router = Router({ mergeParams: true });

router.get('/:id/statistics', requireAthleteOwnership, statistics.getAthleteStatistics);
router.get('/:id/statistics/vertical', requireAthleteOwnership, statistics.getVerticalStatistics);
router.get('/:id/statistics/relays', requireAthleteOwnership, async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    res.json({ data: await athleteRelayHistory(workspaceId, String(req.params.id), getPool()) });
  } catch (error) { next(error); }
});
router.get('/:id/progression', requireAthleteOwnership, statistics.getAthleteProgression);

export default router;
