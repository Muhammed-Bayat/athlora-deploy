import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found', details: {} },
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  if (
    err instanceof SyntaxError &&
    typeof err === 'object' &&
    'status' in err &&
    err.status === 400 &&
    'type' in err &&
    err.type === 'entity.parse.failed'
  ) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          issues: [
            { path: '$', code: 'invalid_format', message: 'Request body must contain valid JSON' },
          ],
        },
      },
    });
    return;
  }

  const requestId = randomUUID();
  console.error(
    'Unhandled API error',
    { requestId, method: req.method, path: req.originalUrl },
    err,
  );
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: { requestId },
    },
  });
};
