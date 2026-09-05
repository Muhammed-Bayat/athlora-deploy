import type { RequestHandler } from 'express';
import { GoogleGenAI, Modality } from '@google/genai';

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
      Date.now() + 30 * 60 * 1000
    ).toISOString();

    const token = await client.authTokens.create({
      config: {
        uses: 1,

        expireTime,

        liveConnectConstraints: {
          model: 'gemini-3.1-flash-live-preview',

          config: {
            sessionResumption: {},

            responseModalities: [Modality.AUDIO],
          },
        },
      },
    });

    res.json({
      data: {
        token: token.name,
      },
    });
  } catch (error) {
    next(error);
  }
};