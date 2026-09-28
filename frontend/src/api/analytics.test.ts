import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAthleteDisciplineAnalysis, getWorkspaceDisciplineAnalysis } from './analytics';

afterEach(() => vi.unstubAllGlobals());

describe('analytics API', () => {
  it('loads selected-athlete discipline analysis from the protected endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { athleteId: 'athlete-1' } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAthleteDisciplineAnalysis('athlete-1', '100m', '2026')).resolves.toEqual({ athleteId: 'athlete-1' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/analytics/athletes/athlete-1/disciplines/100m?year=2026`);
  });

  it('loads workspace rankings from the protected discipline endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { athletes: [] } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getWorkspaceDisciplineAnalysis('long_jump')).resolves.toEqual({ athletes: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/analytics/disciplines/long_jump/athletes`);
  });
});
