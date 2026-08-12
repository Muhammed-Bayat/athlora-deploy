import type { RequestHandler } from 'express';
import { ApiError } from '../middleware/errors.js';

export const notImplemented: RequestHandler = (_req, _res, next) => {
  next(new ApiError(501, 'NOT_IMPLEMENTED', 'Endpoint scaffolding only'));
};