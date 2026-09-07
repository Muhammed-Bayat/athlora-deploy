import { Router } from 'express';
import * as publicLoggers from '../controllers/publicLoggers.js';
import { requireOperationalAccess } from '../middleware/capabilities.js';
import { requireEventOwnership } from '../middleware/ownership.js';
import { validateBody } from '../middleware/validation.js';
import {
  parsePublicLoggerEntryPayload,
  parsePublicLoggerSessionPayload,
  parseTimelineEntryDeletePayload,
  parseTimelineEntryPatchPayload,
} from '../validation/payloads.js';

export const publicLoggerOwnerRouter = Router({ mergeParams: true });
publicLoggerOwnerRouter.post('/:eventId/public-loggers', requireOperationalAccess(), requireEventOwnership('eventId'), publicLoggers.createLink);
publicLoggerOwnerRouter.get('/:eventId/public-loggers', requireOperationalAccess(), requireEventOwnership('eventId'), publicLoggers.listLinks);
publicLoggerOwnerRouter.delete('/:eventId/public-loggers/:linkId', requireOperationalAccess(), requireEventOwnership('eventId'), publicLoggers.revokeLink);

const publicLoggerRouter = Router();
publicLoggerRouter.post('/sessions', validateBody(parsePublicLoggerSessionPayload), publicLoggers.startSession);
publicLoggerRouter.get('/events/:eventId', publicLoggers.getSnapshot);
publicLoggerRouter.post('/events/:eventId/entries', validateBody(parsePublicLoggerEntryPayload), publicLoggers.createEntry);
publicLoggerRouter.patch('/events/:eventId/entries/:entryId', validateBody(parseTimelineEntryPatchPayload), publicLoggers.updateEntry);
publicLoggerRouter.delete('/events/:eventId/entries/:entryId', validateBody(parseTimelineEntryDeletePayload), publicLoggers.removeEntry);

export default publicLoggerRouter;
