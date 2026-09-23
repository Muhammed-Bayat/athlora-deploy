import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import {
  clearClubCover,
  clearClubLogo,
  getClubBranding,
  readBrandAsset,
  replaceClubCover,
  replaceClubLogo,
  updateClubBranding,
} from '../services/clubBranding.js';
import { sniffImageType } from '../services/mediaStorage.js';

export const getBranding: RequestHandler = async (req, res, next) => {
  try {
    const branding = await getClubBranding(getApplicationUserContext(req).workspaceId);
    res.json({ data: branding });
  } catch (error) { next(error); }
};

export const updateBranding: RequestHandler = async (req, res, next) => {
  try {
    const branding = await updateClubBranding(getApplicationUserContext(req).workspaceId, {
      description: req.body.description,
      primaryColor: req.body.primaryColor,
      accentColor: req.body.accentColor,
    });
    res.json({ data: branding });
  } catch (error) { next(error); }
};

function imageBuffer(req: { file?: Express.Multer.File }): Buffer {
  const file = req.file;
  if (!file) throw new ApiError(400, 'CLUB_MEDIA_REQUIRED', 'An image file is required');
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new ApiError(413, 'CLUB_MEDIA_TOO_LARGE', 'Image must be 5 MB or smaller');
  }
  if (!sniffImageType(file.buffer)) {
    throw new ApiError(415, 'CLUB_MEDIA_TYPE_UNSUPPORTED', 'Only PNG, JPEG, and WebP images are supported');
  }
  return file.buffer;
}

export const uploadLogo: RequestHandler = async (req, res, next) => {
  try {
    const branding = await replaceClubLogo(getApplicationUserContext(req).workspaceId, imageBuffer(req));
    res.status(201).json({ data: branding });
  } catch (error) { next(error); }
};

export const removeLogo: RequestHandler = async (req, res, next) => {
  try {
    const branding = await clearClubLogo(getApplicationUserContext(req).workspaceId);
    res.json({ data: branding });
  } catch (error) { next(error); }
};

export const uploadCover: RequestHandler = async (req, res, next) => {
  try {
    const branding = await replaceClubCover(getApplicationUserContext(req).workspaceId, imageBuffer(req));
    res.status(201).json({ data: branding });
  } catch (error) { next(error); }
};

export const removeCover: RequestHandler = async (req, res, next) => {
  try {
    const branding = await clearClubCover(getApplicationUserContext(req).workspaceId);
    res.json({ data: branding });
  } catch (error) { next(error); }
};

export const serveMedia: RequestHandler = async (req, res, next) => {
  try {
    const workspaceId = typeof req.params.workspaceId === 'string' ? req.params.workspaceId : '';
    const filename = typeof req.params.filename === 'string' ? req.params.filename : '';
    const asset = await readBrandAsset(workspaceId, filename);
    res.set({
      'Content-Type': asset.contentType,
      'Cache-Control': asset.cacheControl,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(asset.body);
  } catch (error) { next(error); }
};
