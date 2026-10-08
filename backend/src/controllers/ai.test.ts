import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createToken = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({ authTokens: { create: createToken } })),
  ThinkingLevel: { MEDIUM: 'MEDIUM' },
}));

import {
  createGeminiToken,
  DEFAULT_GEMINI_LIVE_MODEL,
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

  it('puts the required thinking level in the constrained Live setup', async () => {
    await createGeminiToken(
      {} as Request,
      { json } as unknown as Response,
      next,
    );

    expect(createToken).toHaveBeenCalledWith({
      config: expect.objectContaining({
        uses: 1,
        liveConnectConstraints: {
          model: DEFAULT_GEMINI_LIVE_MODEL,
          config: {
            thinkingConfig: {
              thinkingLevel: 'MEDIUM',
            },
          },
        },
      }),
    });
    expect(json).toHaveBeenCalledWith({
      data: {
        token: 'auth_tokens/test',
        model: DEFAULT_GEMINI_LIVE_MODEL,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
