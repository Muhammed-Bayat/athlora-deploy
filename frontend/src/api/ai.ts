import { request } from './client';

interface GeminiTokenResponse {
  data: {
    token: string;
  };
}

export async function createGeminiToken(): Promise<string> {
  const response = await request<GeminiTokenResponse>(
    '/api/v1/ai/gemini-token',
    {
      method: 'POST',
    },
  );

  return response.data.token;
}