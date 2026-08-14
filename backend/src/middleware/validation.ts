import type { RequestHandler } from 'express';

export function validateBody<T>(parse: (body: unknown) => T): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
