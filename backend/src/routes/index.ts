import { Router } from 'express';
import * as athletes from '../controllers/athletes.js';
import * as events from '../controllers/events.js';
import * as squads from '../controllers/squads.js';
import timelineRouter from './timeline.js';
import resultsRouter from './results.js';
import participantsRouter from './participants.js';
import authRouter from './auth.js';
import dashboardRouter from './dashboard.js';
import statisticsRouter from './statistics.js';
import weatherRouter from './weather.js';
import workspacesRouter from './workspaces.js';
import venuesRouter from './venues.js';
import fixturesRouter, { fixtureHostRouter } from './fixtures.js';
import injuriesRouter from './injuries.js';
import { acceptWorkspaceInvitation } from '../controllers/workspaces.js';
import { resolveApplicationUser, verifyAuth0Token } from '../middleware/auth.js';
import { requireAthleteOwnership, requireEventOwnership } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import { requireCoach } from '../middleware/capabilities.js';
import {
  parseAthleteCreatePayload,
  parseAthleteReplacementPayload,
  parseAthleteStatusPayload,
  parseEventCreatePayload,
  parseEventReplacementPayload,
  parseSquadPayload,
} from '../validation/payloads.js';

const router = Router();

const athletesRouter = Router();
athletesRouter.get('/', athletes.listAthletes);
athletesRouter.get('/injury-summaries', athletes.listAthleteInjurySummaries);
athletesRouter.post('/', requireCoach(), validateBody(parseAthleteCreatePayload), athletes.createAthlete);
athletesRouter.get('/:id', requireAthleteOwnership, athletes.getAthlete);
athletesRouter.put(
  '/:id',
  requireCoach(), validateBody(parseAthleteReplacementPayload),
  requireAthleteOwnership,
  athletes.updateAthlete,
);
athletesRouter.delete('/:id', requireCoach(), requireAthleteOwnership, athletes.deleteAthlete);
athletesRouter.post('/:id/unarchive', requireCoach(), requireAthleteOwnership, athletes.unarchiveAthlete);
athletesRouter.post(
  '/:id/status',
  requireCoach(), validateBody(parseAthleteStatusPayload),
  requireAthleteOwnership,
  athletes.updateAthleteStatus,
);
athletesRouter.use('/:id/injuries', injuriesRouter);

const eventsRouter = Router();
eventsRouter.get('/', events.listEvents);
eventsRouter.post('/', requireCoach(), validateBody(parseEventCreatePayload), events.createEvent);
eventsRouter.get('/:id', requireEventOwnership(), events.getEvent);
eventsRouter.put(
  '/:id',
  requireCoach(), validateBody(parseEventReplacementPayload),
  requireEventOwnership(),
  events.updateEvent,
);
eventsRouter.delete('/:id', requireCoach(), requireEventOwnership(), events.deleteEvent);
eventsRouter.get('/:id/weather', requireEventOwnership(), events.getWeather);

const squadsRouter = Router();
squadsRouter.get('/', squads.list);
squadsRouter.post('/', requireCoach(), validateBody(parseSquadPayload), squads.create);
squadsRouter.put('/:id', requireCoach(), validateBody(parseSquadPayload), squads.update);
squadsRouter.delete('/:id', requireCoach(), squads.archive);
squadsRouter.post('/:id/unarchive', requireCoach(), squads.unarchive);

router.use('/auth', authRouter);
// Acceptance cannot require an existing workspace membership.
router.post('/workspaces/invitations/:token/accept', verifyAuth0Token, acceptWorkspaceInvitation);
router.use('/workspaces', verifyAuth0Token, resolveApplicationUser, workspacesRouter);
router.use(
  '/athletes',
  verifyAuth0Token,
  resolveApplicationUser,
  statisticsRouter,
  athletesRouter,
);
router.use('/dashboard', verifyAuth0Token, resolveApplicationUser, dashboardRouter);
router.use('/squads', verifyAuth0Token, resolveApplicationUser, squadsRouter);
router.use('/weather', verifyAuth0Token, resolveApplicationUser, weatherRouter);
router.use('/venues', verifyAuth0Token, resolveApplicationUser, venuesRouter);
router.use(
  '/events',
  verifyAuth0Token,
  resolveApplicationUser,
  fixtureHostRouter,
  participantsRouter,
  timelineRouter,
  resultsRouter,
  eventsRouter,
);
router.use('/fixtures', verifyAuth0Token, resolveApplicationUser, fixturesRouter);

export default router;
