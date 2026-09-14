import { afterEach, describe, expect, it, vi } from 'vitest';
import * as statistics from './statistics';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

describe('statistics API', () => {
  it('gets athlete statistics with optional year', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: { athleteId: 'a-1', events: [] } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await statistics.getAthleteStatistics('a-1', '2025');

    expect(result).toEqual({ athleteId: 'a-1', events: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('athletes/a-1/statistics?year=2025');
  });

  it('gets athlete statistics without year', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: { athleteId: 'a-1', events: [] } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await statistics.getAthleteStatistics('a-1');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('athletes/a-1/statistics');
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('?year=');
  });

  it('gets athlete progression with all optional params', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: { athleteId: 'a-1', entries: [] } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await statistics.getAthleteProgression('a-1', {
      cursor: 'cur-1',
      limit: 20,
      type: 'season_best',
      year: '2024',
    });

    expect(result).toEqual({ athleteId: 'a-1', entries: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      'athletes/a-1/progression?cursor=cur-1&limit=20&type=season_best&year=2024',
    );
  });

  it('gets athlete progression without params', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: { athleteId: 'a-1', entries: [] } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await statistics.getAthleteProgression('a-1');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('athletes/a-1/progression');
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('?');
  });
});
