import type { RequestHandler } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

// Extended Thinking previously failed before emitting client tool calls. Keep
// it available for explicit opt-in while that intermittent provider behavior is
// investigated separately from the standard Live default.
export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.8-live';
export const FALLBACK_GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const EXTENDED_THINKING_GEMINI_LIVE_MODEL = 'gemini-3.8-live-extended-thinking';

function configuredGeminiLiveModel(): string {
  const configured = process.env.GEMINI_LIVE_MODEL?.trim();

  if (configured === 'extended-thinking') {
    return EXTENDED_THINKING_GEMINI_LIVE_MODEL;
  }

  if (configured === 'rollback') {
    return FALLBACK_GEMINI_LIVE_MODEL;
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
      // Ephemeral Live tokens are created through the v1alpha surface. The
      // browser already connects with this version.
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const expireTime = new Date(
      Date.now() + 30 * 60 * 1000,
    ).toISOString();
    const model = configuredGeminiLiveModel();
    const liveConfig = model === DEFAULT_GEMINI_LIVE_MODEL
      ? {}
      : {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM,
          },
        };

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        // Standard Gemini 3.8 Live does not support thinkingConfig. The 3.1
        // fallback and Extended Thinking require it in the constrained setup.
        liveConnectConstraints: {
          model,
          config: liveConfig,
        },
        // Lock the provider-approved model configuration only. The browser
        // must still submit its Live tools, audio configuration, and system
        // instruction with this one-time token.
        lockAdditionalFields: [],
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
