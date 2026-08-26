import { Router } from 'express';
import { listAccessibleWorkspaces } from '../controllers/workspaces.js';

const router = Router();
router.get('/', listAccessibleWorkspaces);
export default router;
