import { Router } from 'express';
import * as dashboard from '../controllers/dashboard.js';
import { getDisciplineStatistics } from '../controllers/statistics.js';

const router = Router();

router.get('/summary', dashboard.getDashboardSummary);
router.get('/disciplines', getDisciplineStatistics);

export default router;
