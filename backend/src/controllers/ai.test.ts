import type { NextFunction, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createToken = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({ authTokens: { create: createToken } })),
  ThinkingLevel: { MEDIUM: 'MEDIUM' },
}));

import {
  createGeminiToken,
  DEFAULT_GEMINI_LIVE_MODEL,
  EXTENDED_THINKING_GEMINI_LIVE_MODEL,
  FALLBACK_GEMINI_LIVE_MODEL,
} from './ai.js';

const json = vi.fn();
const next = vi.fn() as unknown as NextFunction;

describe('createGeminiToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_LIVE_MODEL;
    createToken.mockResolvedValue({ name: 'auth_tokens/test' });
  });

  it('uses Gemini 3.8 Live without thinking in the constrained default setup', async () => {
    await createGeminiToken(
      {} as Request,
      { json } as unknown as Response,
      next,
    );

    expect(createToken).toHaveBeenCalledWith({
      config: expect.objectContaining({
        uses: 1,
        lockAdditionalFields: [],
        liveConnectConstraints: {
          model: DEFAULT_GEMINI_LIVE_MODEL,
          config: {},
        },
      }),
    });
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-key',
      httpOptions: { apiVersion: 'v1alpha' },
    });
    expect(DEFAULT_GEMINI_LIVE_MODEL).toBe('gemini-3.8-live');
    expect(json).toHaveBeenCalledWith({
      data: {
        token: 'auth_tokens/test',
        model: DEFAULT_GEMINI_LIVE_MODEL,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows an operator to explicitly opt into the extended-thinking model', async () => {
    process.env.GEMINI_LIVE_MODEL = 'extended-thinking';

    await createGeminiToken(
      {} as Request,
      { json } as unknown as Response,
      next,
    );

    expect(createToken).toHaveBeenCalledWith({
      config: expect.objectContaining({
        liveConnectConstraints: expect.objectContaining({
          model: EXTENDED_THINKING_GEMINI_LIVE_MODEL,
          config: {
            thinkingConfig: {
              thinkingLevel: 'MEDIUM',
            },
          },
        }),
      }),
    });
  });

  it('keeps Gemini 3.1 available through the rollback alias', async () => {
    process.env.GEMINI_LIVE_MODEL = 'rollback';

    await createGeminiToken(
      {} as Request,
      { json } as unknown as Response,
      next,
    );

    expect(createToken).toHaveBeenCalledWith({
      config: expect.objectContaining({
        liveConnectConstraints: {
          model: FALLBACK_GEMINI_LIVE_MODEL,
          config: {
            thinkingConfig: {
              thinkingLevel: 'MEDIUM',
            },
          },
        },
      }),
    });
    expect(FALLBACK_GEMINI_LIVE_MODEL).toBe('gemini-3.1-flash-live-preview');
  });
});
