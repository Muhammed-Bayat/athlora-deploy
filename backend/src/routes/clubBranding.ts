import { Router } from 'express';
import * as clubBranding from '../controllers/clubBranding.js';
import { resolveApplicationUser, verifyAuth0Token } from '../middleware/auth.js';
import { requireCoach } from '../middleware/capabilities.js';
import { uploadClubMedia } from '../middleware/clubMediaUpload.js';
import { validateBody } from '../middleware/validation.js';
import { parseClubBrandingPayload } from '../validation/payloads.js';

const router = Router();

router.get(
  '/',
  verifyAuth0Token,
  resolveApplicationUser,
  clubBranding.getBranding,
);
router.put(
  '/',
  verifyAuth0Token,
  resolveApplicationUser,
  requireCoach(),
  validateBody(parseClubBrandingPayload),
  clubBranding.updateBranding,
);
router.post(
  '/logo',
  verifyAuth0Token,
  resolveApplicationUser,
  requireCoach(),
  uploadClubMedia,
  clubBranding.uploadLogo,
);
router.delete(
  '/logo',
  verifyAuth0Token,
  resolveApplicationUser,
  requireCoach(),
  clubBranding.removeLogo,
);
router.post(
  '/cover',
  verifyAuth0Token,
  resolveApplicationUser,
  requireCoach(),
  uploadClubMedia,
  clubBranding.uploadCover,
);
router.delete(
  '/cover',
  verifyAuth0Token,
  resolveApplicationUser,
  requireCoach(),
  clubBranding.removeCover,
);

export default router;
