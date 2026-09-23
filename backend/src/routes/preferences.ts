import { Router } from 'express';
import * as preferences from '../controllers/preferences.js';
import { validateBody } from '../middleware/validation.js';
import { parseUserPreferencesPayload } from '../validation/payloads.js';

const router = Router();
router.get('/', preferences.getPreferences);
router.put('/', validateBody(parseUserPreferencesPayload), preferences.putPreferences);

export default router;
