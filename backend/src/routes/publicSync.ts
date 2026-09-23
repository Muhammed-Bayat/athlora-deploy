import { Router, type Request, type Response } from 'express';
import { processPublicSyncBatch } from '../services/publicSync.js';
import type { PublicSyncActionInput } from '../services/publicSync.js';
import { processSessionSyncBatch } from '../services/sessionSync.js';
import { resolvePublicMeetActor } from '../services/publicLoggers.js';
import { ApiError } from '../middleware/errors.js';

const publicSyncRouter = Router();

publicSyncRouter.post('/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing public logger session token' });
      return;
    }

    const sessionToken = authHeader.slice(7);
    const { eventId, deviceId, actions } = req.body as {
      eventId: string;
      deviceId: string;
      actions: PublicSyncActionInput[];
    };

    if (!eventId || !deviceId || !Array.isArray(actions) || actions.length === 0) {
      res.status(400).json({ error: 'eventId, deviceId, and actions array are required' });
      return;
    }

    if (actions.length > 50) {
      res.status(400).json({ error: 'Maximum 50 actions per batch' });
      return;
    }

    const sessionTargeted = actions.some((action) => action && typeof action === 'object' && 'target' in action);
    const result = sessionTargeted
      ? await processSessionSyncBatch(await resolvePublicMeetActor(sessionToken, eventId), eventId, deviceId, actions)
      : await processPublicSyncBatch(sessionToken, eventId, deviceId, actions);

    res.json({
      receipts: result.receipts,
      recomputedResults: result.recomputedResults,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
      return;
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[publicSync] Error:', message, error);
    if (message.includes('Invalid or expired public logger session')) {
      res.status(401).json({ error: message });
    } else if (message.includes('Event is not in progress')) {
      res.status(400).json({ error: message });
    } else {
      res.status(500).json({ error: 'Internal server error', detail: message });
    }
  }
});

export default publicSyncRouter;
