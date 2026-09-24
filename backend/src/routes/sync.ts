import { Router } from 'express';
import { resolveApplicationUser, verifyAuth0Token, getApplicationUserContext } from '../middleware/auth.js';
import { requireOperationalAccess } from '../middleware/capabilities.js';
import { requireBodyEventLoggingOpen, requireBodyEventOwnership, requireEventOwnership } from '../middleware/ownership.js';
import { ApiError } from '../middleware/errors.js';
import { processSyncBatch, designateOfflineLogger, getOfflineLoggerDesignation, revokeOfflineLoggerDesignation, transferOfflineLoggerDesignation } from '../services/sync.js';
import type { SyncActionInput } from '../services/sync.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { processSessionSyncBatch } from '../services/sessionSync.js';

const router = Router();

const baseAccess = [verifyAuth0Token, resolveApplicationUser, requireOperationalAccess()];
const syncAccess = [...baseAccess, requireEventOwnership('eventId')];
const batchAccess = [requireBodyEventOwnership, requireBodyEventLoggingOpen];

const MAX_BATCH_ACTIONS = 50;
const ACTION_TYPES = new Set(['create_entry', 'edit_entry', 'undo_entry']);

function validationError(message: string): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', message);
}

// Explicit session targets take the new scoped service; legacy batches retain their middleware/contract.
router.post('/sync/batch', ...baseAccess, async (req, res, next) => {
  if (!Array.isArray(req.body?.actions) || !req.body.actions.some((action: unknown) => action && typeof action === 'object' && 'target' in action)) return next();
  try {
    const { userId, workspaceId, workspaceRole } = getApplicationUserContext(req);
    const result = await processSessionSyncBatch({ userId, workspaceId, role: workspaceRole }, req.body.eventId, req.body.deviceId, req.body.actions);
    res.json({ data: result });
  } catch (error) { next(error); }
});

router.post('/sync/batch', ...batchAccess, async (req, res, next) => {
  try {
    const body = req.body as Partial<{
      deviceId: unknown;
      eventId: unknown;
      actions: unknown;
    }> | null;

    if (!body || typeof body.deviceId !== 'string' || body.deviceId.trim() === '') {
      throw validationError('deviceId is required');
    }
    if (typeof body.eventId !== 'string' || !isCanonicalUuid(body.eventId)) {
      throw validationError('eventId must be a canonical UUID');
    }
    if (!Array.isArray(body.actions) || body.actions.length === 0) {
      throw validationError('actions must be a non-empty array');
    }
    if (body.actions.length > MAX_BATCH_ACTIONS) {
      throw validationError(`Maximum ${MAX_BATCH_ACTIONS} actions per batch`);
    }

    const actions: SyncActionInput[] = body.actions.map((raw, index) => {
      const action = raw as Partial<SyncActionInput> | null;
      if (!action || typeof action !== 'object') {
        throw validationError(`actions[${index}] must be an object`);
      }
      if (typeof action.actionId !== 'string' || !isCanonicalUuid(action.actionId)) {
        throw validationError(`actions[${index}].actionId must be a canonical UUID`);
      }
      if (typeof action.actionType !== 'string' || !ACTION_TYPES.has(action.actionType)) {
        throw validationError(`actions[${index}].actionType must be create_entry, edit_entry, or undo_entry`);
      }
      if (!action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) {
        throw validationError(`actions[${index}].payload must be an object`);
      }
      if (typeof action.clientTimestamp !== 'string' || Number.isNaN(Date.parse(action.clientTimestamp))) {
        throw validationError(`actions[${index}].clientTimestamp must be a valid ISO timestamp`);
      }
      if (
        action.expectedVersion !== undefined
        && (typeof action.expectedVersion !== 'number' || !Number.isInteger(action.expectedVersion))
      ) {
        throw validationError(`actions[${index}].expectedVersion must be an integer when provided`);
      }
      return {
        actionId: action.actionId,
        actionType: action.actionType as SyncActionInput['actionType'],
        payload: action.payload as Record<string, unknown>,
        expectedVersion: action.expectedVersion,
        clientTimestamp: action.clientTimestamp,
      };
    });

    const { userId } = getApplicationUserContext(req);
    const result = await processSyncBatch(body.eventId, userId, body.deviceId, actions);
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

router.get('/events/:eventId/helpers/offline-logger', ...syncAccess, async (req, res, next) => {
  try {
    const designation = await getOfflineLoggerDesignation(String(req.params.eventId));
    res.json({ data: designation });
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
