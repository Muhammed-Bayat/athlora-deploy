import { Router, type Request, type Response } from 'express';
import { processPublicSyncBatch } from '../services/publicSync.js';
import type { PublicSyncActionInput } from '../services/publicSync.js';

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

    const result = await processPublicSyncBatch(sessionToken, eventId, deviceId, actions);

    res.json({
      receipts: result.receipts,
      recomputedResults: result.recomputedResults,
    });
  } catch (error) {
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
