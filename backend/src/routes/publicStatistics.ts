import { Router } from 'express';
import * as publicStatistics from '../controllers/publicStatistics.js';

const router = Router();

router.get('/seasons', publicStatistics.listSeasons);
router.get('/clubs', publicStatistics.listClubs);
router.get('/comparison', publicStatistics.athleteComparison);
router.get('/clubs/:clubId', publicStatistics.clubStatistics);

export default router;
