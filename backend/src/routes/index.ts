import { Router } from 'express';
import * as athletes from '../controllers/athletes.js';
import * as events from '../controllers/events.js';
import timelineRouter from './timeline.js';
import resultsRouter from './results.js';
import authRouter from './auth.js';
import { resolveApplicationUser, verifyAuth0Token } from '../middleware/auth.js';
import { requireAthleteOwnership, requireEventOwnership } from '../middleware/ownership.js';

const router = Router();

const athletesRouter = Router();
athletesRouter.get('/', athletes.listAthletes);
athletesRouter.post('/', athletes.createAthlete);
athletesRouter.get('/:id', requireAthleteOwnership, athletes.getAthlete);
athletesRouter.put('/:id', requireAthleteOwnership, athletes.updateAthlete);
athletesRouter.delete('/:id', requireAthleteOwnership, athletes.deleteAthlete);

const eventsRouter = Router();
eventsRouter.get('/', events.listEvents);
eventsRouter.post('/', events.createEvent);
eventsRouter.get('/:id', requireEventOwnership(), events.getEvent);
eventsRouter.put('/:id', requireEventOwnership(), events.updateEvent);
eventsRouter.delete('/:id', requireEventOwnership(), events.deleteEvent);
eventsRouter.get('/:id/weather', requireEventOwnership(), events.getWeather);

router.use('/auth', authRouter);
router.use('/athletes', verifyAuth0Token, resolveApplicationUser, athletesRouter);
router.use(
  '/events',
  verifyAuth0Token,
  resolveApplicationUser,
  eventsRouter,
  timelineRouter,
  resultsRouter,
);

export default router;
