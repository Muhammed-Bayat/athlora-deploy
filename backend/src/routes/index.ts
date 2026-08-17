import { Router } from 'express';
import * as athletes from '../controllers/athletes.js';
import * as events from '../controllers/events.js';
import timelineRouter from './timeline.js';
import resultsRouter from './results.js';
import participantsRouter from './participants.js';
import authRouter from './auth.js';
import { resolveApplicationUser, verifyAuth0Token } from '../middleware/auth.js';
import { requireAthleteOwnership, requireEventOwnership } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import {
  parseAthleteCreatePayload,
  parseAthleteReplacementPayload,
  parseEventCreatePayload,
  parseEventReplacementPayload,
} from '../validation/payloads.js';

const router = Router();

const athletesRouter = Router();
athletesRouter.get('/', athletes.listAthletes);
athletesRouter.post('/', validateBody(parseAthleteCreatePayload), athletes.createAthlete);
athletesRouter.get('/:id', requireAthleteOwnership, athletes.getAthlete);
athletesRouter.put(
  '/:id',
  validateBody(parseAthleteReplacementPayload),
  requireAthleteOwnership,
  athletes.updateAthlete,
);
athletesRouter.delete('/:id', requireAthleteOwnership, athletes.deleteAthlete);
athletesRouter.post('/:id/unarchive', requireAthleteOwnership, athletes.unarchiveAthlete);

const eventsRouter = Router();
eventsRouter.get('/', events.listEvents);
eventsRouter.post('/', validateBody(parseEventCreatePayload), events.createEvent);
eventsRouter.get('/:id', requireEventOwnership(), events.getEvent);
eventsRouter.put(
  '/:id',
  validateBody(parseEventReplacementPayload),
  requireEventOwnership(),
  events.updateEvent,
);
eventsRouter.delete('/:id', requireEventOwnership(), events.deleteEvent);
eventsRouter.get('/:id/weather', requireEventOwnership(), events.getWeather);

router.use('/auth', authRouter);
router.use('/athletes', verifyAuth0Token, resolveApplicationUser, athletesRouter);
router.use(
  '/events',
  verifyAuth0Token,
  resolveApplicationUser,
  participantsRouter,
  timelineRouter,
  resultsRouter,
  eventsRouter,
);

export default router;
