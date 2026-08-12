import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

router.post('/:eventId/entries', notImplemented);
router.patch('/:eventId/entries/:entryId', notImplemented);
router.delete('/:eventId/entries/:entryId', notImplemented);

export default router;