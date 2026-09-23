import { Router } from 'express';
import { serveMedia } from '../controllers/clubBranding.js';

const router = Router();

router.get('/clubs/:workspaceId/:filename', serveMedia);

export default router;
