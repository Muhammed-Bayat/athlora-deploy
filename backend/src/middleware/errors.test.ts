import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, errorHandler } from './errors.js';

const json = vi.fn();
const status = vi.fn(() => ({ json }));
const next = vi.fn() as unknown as NextFunction;

function request(): Request {
  return {
    method: 'PUT',
    originalUrl: '/api/v1/auth/me',
    headers: { authorization: 'Bearer must-not-be-logged' },
  } as unknown as Request;
}

function response(): Response {
  return { status, json } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('errorHandler', () => {
  it('returns known API errors without logging them as unexpected', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(new ApiError(409, 'CONFLICT', 'Conflict'), request(), response(), next);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'CONFLICT', message: 'Conflict', details: {} },
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('correlates unexpected errors without logging request credentials', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('database unavailable');

    errorHandler(error, request(), response(), next);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: { requestId: expect.any(String) },
      },
    });
    const requestId = json.mock.calls[0][0].error.details.requestId as string;
    expect(log).toHaveBeenCalledWith(
      'Unhandled API error',
      { requestId, method: 'PUT', path: '/api/v1/auth/me' },
      error,
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('must-not-be-logged');
  });
});
