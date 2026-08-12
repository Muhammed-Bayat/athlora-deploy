import { Router } from 'express';
import * as athletes from '../controllers/athletes.js';
import * as events from '../controllers/events.js';
import timelineRouter from './timeline.js';
import resultsRouter from './results.js';
import authRouter from './auth.js';

const router = Router();

const athletesRouter = Router();
athletesRouter.get('/', athletes.listAthletes);
athletesRouter.post('/', athletes.createAthlete);
athletesRouter.get('/:id', athletes.getAthlete);
athletesRouter.put('/:id', athletes.updateAthlete);
athletesRouter.delete('/:id', athletes.deleteAthlete);

const eventsRouter = Router();
eventsRouter.get('/', events.listEvents);
eventsRouter.post('/', events.createEvent);
eventsRouter.get('/:id', events.getEvent);
eventsRouter.put('/:id', events.updateEvent);
eventsRouter.delete('/:id', events.deleteEvent);
eventsRouter.get('/:id/weather', events.getWeather);

router.use('/athletes', athletesRouter);
router.use('/events', eventsRouter);
router.use('/events', timelineRouter);
router.use('/events', resultsRouter);
router.use('/auth', authRouter);

export default router;