import { Router } from 'express';
import { resolveApplicationUser, verifyAuth0Token, getApplicationUserContext } from '../middleware/auth.js';
import { requireOperationalAccess } from '../middleware/capabilities.js';
import { requireEventOwnership } from '../middleware/ownership.js';
import { processSyncBatch, designateOfflineLogger, revokeOfflineLoggerDesignation, transferOfflineLoggerDesignation } from '../services/sync.js';
import type { SyncActionInput } from '../services/sync.js';

const router = Router();

const syncAccess = [verifyAuth0Token, resolveApplicationUser, requireOperationalAccess(), requireEventOwnership('eventId')];

router.post('/sync/batch', ...syncAccess, async (req, res, next) => {
  try {
    const { deviceId, eventId, actions } = req.body as {
      deviceId: string;
      eventId: string;
      actions: SyncActionInput[];
    };

    if (!deviceId || !eventId || !Array.isArray(actions)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'deviceId, eventId, and actions array are required',
        },
      });
      return;
    }

    const { userId } = getApplicationUserContext(req);
    const result = await processSyncBatch(eventId, userId, deviceId, actions);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:eventId/helpers/grants/:grantId/designate-offline-logger', ...syncAccess, async (req, res, next) => {
  try {
    const grantId = String(req.params.grantId);
    const eventId = String(req.params.eventId);
    const { deviceId } = req.body as { deviceId: string };

    if (!deviceId) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'deviceId is required',
        },
      });
      return;
    }

    await designateOfflineLogger(grantId, eventId, deviceId);
    res.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

router.delete('/events/:eventId/helpers/grants/:grantId/designate-offline-logger', ...syncAccess, async (req, res, next) => {
  try {
    const grantId = String(req.params.grantId);
    const eventId = String(req.params.eventId);
    await revokeOfflineLoggerDesignation(grantId, eventId);
    res.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:eventId/helpers/transfer-offline-logger', ...syncAccess, async (req, res, next) => {
  try {
    const eventId = String(req.params.eventId);
    const { fromGrantId, toGrantId } = req.body as { fromGrantId: string; toGrantId: string };

    if (!fromGrantId || !toGrantId) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'fromGrantId and toGrantId are required',
        },
      });
      return;
    }

    await transferOfflineLoggerDesignation(fromGrantId, toGrantId, eventId);
    res.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

export default router;
