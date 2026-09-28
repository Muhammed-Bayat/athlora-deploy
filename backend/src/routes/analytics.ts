import { Router } from 'express';
import * as analytics from '../controllers/analytics.js';
import { requireAthleteOwnership } from '../middleware/ownership.js';

const router = Router();

router.get('/athletes/:id/disciplines/:discipline', requireAthleteOwnership, analytics.getAthleteDisciplineAnalysis);
router.get('/squads/:squadId/disciplines/:discipline', analytics.getSquadDisciplineAnalysis);
router.get('/disciplines/:discipline/athletes', analytics.getWorkspaceDisciplineAnalysis);

export default router;
