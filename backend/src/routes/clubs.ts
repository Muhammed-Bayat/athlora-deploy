import { Router, type RequestHandler } from 'express';
import * as clubs from '../controllers/clubs.js';
import { getApplicationUserContext, resolveApplicationUser, resolveLocalApplicationUser, verifyAuth0Token } from '../middleware/auth.js';
import { requireCoach } from '../middleware/capabilities.js';
import { ApiError } from '../middleware/errors.js';
import { assertActiveClubWorkspace } from '../services/clubs.js';

const router = Router();

const requireActiveClubWorkspace: RequestHandler = async (req, _res, next) => {
  try {
    const clubId = req.params.clubId;
    if (typeof clubId !== 'string') throw new ApiError(404, 'CLUB_NOT_FOUND', 'Club not found');
    await assertActiveClubWorkspace(clubId, getApplicationUserContext(req).workspaceId);
    next();
  } catch (error) { next(error); }
};

router.get('/', verifyAuth0Token, resolveLocalApplicationUser, clubs.list);
router.post('/', verifyAuth0Token, resolveLocalApplicationUser, clubs.create);
router.get('/join-requests/me', verifyAuth0Token, resolveLocalApplicationUser, clubs.listMine);
router.post('/join-requests/:id/withdraw', verifyAuth0Token, resolveLocalApplicationUser, clubs.withdraw);
router.post('/:clubId/join-requests', verifyAuth0Token, resolveLocalApplicationUser, clubs.requestJoin);

router.get('/:clubId/join-requests', verifyAuth0Token, resolveApplicationUser, requireCoach(), requireActiveClubWorkspace, clubs.listJoinRequests);
router.post('/:clubId/join-requests/:id/approve', verifyAuth0Token, resolveApplicationUser, requireCoach(), requireActiveClubWorkspace, clubs.approve);
router.post('/:clubId/join-requests/:id/reject', verifyAuth0Token, resolveApplicationUser, requireCoach(), requireActiveClubWorkspace, clubs.reject);

export default router;
