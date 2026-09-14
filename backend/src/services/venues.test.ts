import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearVenueSearchCache, searchVenues } from './venues.js';

afterEach(() => clearVenueSearchCache());

describe('Nominatim venue provider boundary', () => {
  it('maps only the stable venue contract, sends an identifiable agent, and caches a query', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{
      display_name: 'Central Stadium, Johannesburg', lat: '-26.2041', lon: '28.0473', extratags: { ignored: true },
    }])));
    process.env.NOMINATIM_USER_AGENT = 'Athlora test (test@example.com)';

    await expect(searchVenues('Central Stadium', fetcher)).resolves.toEqual([{
      displayName: 'Central Stadium, Johannesburg', latitude: -26.2041, longitude: 28.0473,
    }]);
    await searchVenues('central stadium', fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'Central Stadium', format: 'jsonv2', limit: '5', addressdetails: '0' });
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'Athlora test (test@example.com)' }), signal: expect.any(AbortSignal) }));
  });

  it('maps provider failures and malformed coordinates without exposing provider details', async () => {
    await expect(searchVenues('x', vi.fn<typeof fetch>().mockResolvedValue(new Response('secret', { status: 429 })))).rejects.toMatchObject({ status: 502, code: 'VENUE_SERVICE_UNAVAILABLE' });
    await expect(searchVenues('y', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ display_name: 'Bad', lat: '91', lon: '0' }]))))).rejects.toMatchObject({ status: 502, code: 'VENUE_SERVICE_INVALID_RESPONSE' });
  });
});
