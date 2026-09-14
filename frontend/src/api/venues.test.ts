import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchVenues } from './venues';

afterEach(() => vi.unstubAllGlobals());

describe('venue API', () => {
  it('uses the authenticated API boundary rather than Nominatim directly', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [], meta: { count: 0 } })));
    vi.stubGlobal('fetch', fetchMock);
    await searchVenues('Central & Track');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/venues/search?q=Central%20%26%20Track`);
  });
});
