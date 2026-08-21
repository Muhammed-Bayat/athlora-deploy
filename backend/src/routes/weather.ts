import { Router } from 'express';
import * as weather from '../controllers/weather.js';

const router = Router();

router.get('/current', weather.getCurrentWeather);

export default router;