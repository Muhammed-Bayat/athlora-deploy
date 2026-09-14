import { Router } from 'express';
import * as dashboard from '../controllers/dashboard.js';

const router = Router();

router.get('/summary', dashboard.getDashboardSummary);

export default router;
