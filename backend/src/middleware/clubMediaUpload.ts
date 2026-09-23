import multer from 'multer';
import type { RequestHandler } from 'express';
import { ApiError } from './errors.js';
import { MAX_MEDIA_BYTES } from '../services/mediaStorage.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_BYTES, files: 1 },
});

export const uploadClubMedia: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (!error) {
      if (!req.file) {
        next(new ApiError(400, 'CLUB_MEDIA_REQUIRED', 'An image file is required'));
        return;
      }
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new ApiError(413, 'CLUB_MEDIA_TOO_LARGE', 'Image must be 5 MB or smaller'));
      return;
    }
    next(error instanceof Error ? error : new ApiError(400, 'CLUB_MEDIA_UPLOAD_FAILED', 'Image upload failed'));
  });
};
