import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMultiAthleteComparison, getTwoAthleteComparison } from './comparison';

afterEach(() => vi.unstubAllGlobals());

describe('comparison API', () => {
  it('sends the optional cross-club scope', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { athletes: [] } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getTwoAthleteComparison('athlete-1', 'athlete-2', 'cross-club');

    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      'athletes/comparison?athlete1Id=athlete-1&athlete2Id=athlete-2&scope=cross-club',
    );
  });

  it('sends repeated athlete IDs for multi-comparisons', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { athletes: [] } })));
    vi.stubGlobal('fetch', fetchMock);

    await getMultiAthleteComparison(['athlete-1', 'athlete-2'], 'cross-club');

    expect(fetchMock.mock.calls[0]?.[0]).toContain('athletes/comparison/multi?athleteId=athlete-1&athleteId=athlete-2&scope=cross-club');
  });

  it('serializes an explicit season for two-athlete and multi-athlete comparisons', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => (
      new Response(JSON.stringify({ data: { athletes: [] } }))
    ));
    vi.stubGlobal('fetch', fetchMock);

    await getTwoAthleteComparison('athlete-1', 'athlete-2', undefined, '2024');
    await getMultiAthleteComparison(['athlete-1', 'athlete-2'], undefined, 'all');

    expect(fetchMock.mock.calls[0]?.[0]).toContain('athlete1Id=athlete-1&athlete2Id=athlete-2&year=2024');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('athleteId=athlete-1&athleteId=athlete-2&year=all');
  });
});
