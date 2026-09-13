import { Router } from 'express';
import * as comparison from '../controllers/comparison.js';

const router = Router();

router.get('/comparison', comparison.getComparison);
router.get('/comparison/multi', comparison.getMultiComparison);

export default router;
