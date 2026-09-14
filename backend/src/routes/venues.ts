import { Router } from 'express';
import * as venues from '../controllers/venues.js';

const router = Router();
router.get('/search', venues.search);
export default router;
