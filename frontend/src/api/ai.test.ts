import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiToken } from './ai';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

describe('ai API', () => {
  it('creates a Gemini token via POST', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: { token: 'gemini-token-abc' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const token = await createGeminiToken();

    expect(token).toBe('gemini-token-abc');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/ai/gemini-token'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
