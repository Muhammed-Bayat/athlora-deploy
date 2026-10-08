import { request } from './client';

interface GeminiTokenResponse {
  data: {
    token: string;
    model: string;
  };
}

export interface GeminiToken {
  token: string;
  model: string;
}

export async function createGeminiToken(): Promise<GeminiToken> {
  const response = await request<GeminiTokenResponse>(
    '/api/v1/ai/gemini-token',
    {
      method: 'POST',
    },
  );

  return response.data;
}
