import { Router } from 'express';
import * as publicStatistics from '../controllers/publicStatistics.js';

const router = Router();

router.get('/clubs', publicStatistics.listClubs);
router.get('/clubs/:clubId', publicStatistics.clubStatistics);

export default router;
