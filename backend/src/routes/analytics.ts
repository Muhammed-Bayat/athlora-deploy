import { Router } from 'express';
import * as analytics from '../controllers/analytics.js';
import { requireAthleteOwnership } from '../middleware/ownership.js';

const router = Router();

router.get('/athletes/:id/disciplines/:discipline', requireAthleteOwnership, analytics.getAthleteDisciplineAnalysis);
router.get('/disciplines/:discipline/athletes', analytics.getWorkspaceDisciplineAnalysis);
router.get('/coach/performance', analytics.getCoachPerformanceAnalysis);
router.get('/coach/injuries', analytics.getCoachInjuryAnalysis);
router.get('/coach/rankings', analytics.getCoachRankingsAnalysis);

export default router;
