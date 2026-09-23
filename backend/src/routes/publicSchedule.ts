import { Router } from 'express';
import * as publicSchedule from '../controllers/publicSchedule.js';

const router = Router();

router.get('/clubs', publicSchedule.listClubs);
router.get('/clubs/:clubId', publicSchedule.clubSchedule);

export default router;
