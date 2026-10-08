import type { RequestHandler } from 'express';
import { GoogleGenAI } from '@google/genai';

export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.8-live-extended-thinking';
export const ROLLBACK_GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

function configuredGeminiLiveModel(): string {
  const configured = process.env.GEMINI_LIVE_MODEL?.trim();

  if (configured === 'rollback') {
    return ROLLBACK_GEMINI_LIVE_MODEL;
  }

  return configured || DEFAULT_GEMINI_LIVE_MODEL;
}

export const createGeminiToken: RequestHandler = async (_req, res, next) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const client = new GoogleGenAI({
      apiKey,
    });

    const expireTime = new Date(
      Date.now() + 30 * 60 * 1000,
    ).toISOString();
    const model = configuredGeminiLiveModel();

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        // The browser receives a one-use token for this model only.
        liveConnectConstraints: { model },
      },
    });

    res.json({
      data: {
        token: token.name,
        model,
      },
    });
  } catch (error) {
    next(error);
  }
};
