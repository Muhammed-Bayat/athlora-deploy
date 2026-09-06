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
import aiRouter from './ai.js';
import venuesRouter from './venues.js';
import fixturesRouter, { fixtureHostRouter } from './fixtures.js';
import injuriesRouter from './injuries.js';
import comparisonRouter from './comparison.js';
import eventHelpersRouter from './eventHelpers.js';
import publicLoggerRouter, { publicLoggerOwnerRouter } from './publicLoggers.js';
import syncRouter from './sync.js';
import clubsRouter from './clubs.js';
import fixtureNotificationsRouter from './fixtureNotifications.js';
import { acceptWorkspaceInvitation } from '../controllers/workspaces.js';
import { resolveApplicationUser, resolveLocalApplicationUser, verifyAuth0Token } from '../middleware/auth.js';
import { listAccessibleWorkspaces } from '../controllers/workspaces.js';
import { requireAthleteOwnership, requireEventOwnership } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import { requireOperationalAccess } from '../middleware/capabilities.js';
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
athletesRouter.post('/', requireOperationalAccess(), validateBody(parseAthleteCreatePayload), athletes.createAthlete);
athletesRouter.get('/:id', requireAthleteOwnership, athletes.getAthlete);
athletesRouter.put(
  '/:id',
  requireOperationalAccess(), validateBody(parseAthleteReplacementPayload),
  requireAthleteOwnership,
  athletes.updateAthlete,
);
athletesRouter.delete('/:id', requireOperationalAccess(), requireAthleteOwnership, athletes.deleteAthlete);
athletesRouter.post('/:id/unarchive', requireOperationalAccess(), requireAthleteOwnership, athletes.unarchiveAthlete);
athletesRouter.post(
  '/:id/status',
  requireOperationalAccess(), validateBody(parseAthleteStatusPayload),
  requireAthleteOwnership,
  athletes.updateAthleteStatus,
);
athletesRouter.use('/:id/injuries', injuriesRouter);

const eventsRouter = Router();
eventsRouter.get('/', events.listEvents);
eventsRouter.post('/', requireOperationalAccess(), validateBody(parseEventCreatePayload), events.createEvent);
eventsRouter.get('/:id', requireEventOwnership(), events.getEvent);
eventsRouter.put(
  '/:id',
  requireOperationalAccess(), validateBody(parseEventReplacementPayload),
  requireEventOwnership(),
  events.updateEvent,
);
eventsRouter.delete('/:id', requireOperationalAccess(), requireEventOwnership(), events.deleteEvent);
eventsRouter.get('/:id/weather', requireEventOwnership(), events.getWeather);

const squadsRouter = Router();
squadsRouter.get('/', squads.list);
squadsRouter.post('/', requireOperationalAccess(), validateBody(parseSquadPayload), squads.create);
squadsRouter.put('/:id', requireOperationalAccess(), validateBody(parseSquadPayload), squads.update);
squadsRouter.delete('/:id', requireOperationalAccess(), squads.archive);
squadsRouter.post('/:id/unarchive', requireOperationalAccess(), squads.unarchive);

router.use('/auth', authRouter);
router.use('/public/logger', publicLoggerRouter);
// Acceptance cannot require an existing workspace membership.
router.post('/workspaces/invitations/:token/accept', verifyAuth0Token, acceptWorkspaceInvitation);
// Listing is used to decide whether a synchronized user needs Club onboarding.
router.get('/workspaces', verifyAuth0Token, resolveLocalApplicationUser, listAccessibleWorkspaces);
router.use('/workspaces', verifyAuth0Token, resolveApplicationUser, workspacesRouter);
router.use('/clubs', clubsRouter);
router.use('/', eventHelpersRouter);
router.use('/', syncRouter);
router.use(
  '/ai',
  verifyAuth0Token,
  resolveApplicationUser,
  aiRouter,
);
router.use(
  '/athletes',
  verifyAuth0Token,
  resolveApplicationUser,
  comparisonRouter,
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
   publicLoggerOwnerRouter,
  participantsRouter,
  timelineRouter,
  resultsRouter,
  eventsRouter,
);
router.use('/fixtures', verifyAuth0Token, resolveApplicationUser, fixturesRouter);
router.use('/notifications', verifyAuth0Token, resolveApplicationUser, fixtureNotificationsRouter);

export default router;
