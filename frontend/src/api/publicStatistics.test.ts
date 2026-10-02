import { afterEach, describe, expect, it, vi } from 'vitest';
import * as publicStatistics from './publicStatistics';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

describe('publicStatistics API', () => {
  it('lists public clubs with optional search query', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(response({ data: [{ id: 'club-1', name: 'Fast Club' }], meta: { count: 1 } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await publicStatistics.listPublicClubs(' Fast Club ');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('clubs?q=Fast%20Club');

    await publicStatistics.listPublicClubs();
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/v1/public/statistics/clubs');
    expect(fetchMock.mock.calls[1]?.[0]).not.toContain('?q=');
  });

  it('lists public seasons', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: [2025, 2024] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const seasons = await publicStatistics.listPublicSeasons();

    expect(seasons).toEqual([2025, 2024]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/public/statistics/seasons');
  });

  it('gets public club statistics with optional year and signal', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(response({ data: { clubId: 'club-1', totalAthletes: 10 } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const result = await publicStatistics.getPublicClubStatistics('club-1', controller.signal, '2025');

    expect(result).toEqual({ clubId: 'club-1', totalAthletes: 10 });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('clubs/club-1?year=2025');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: controller.signal }));

    await publicStatistics.getPublicClubStatistics('club-2');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('clubs/club-2');
    expect(fetchMock.mock.calls[1]?.[0]).not.toContain('?year=');
  });

  it('gets public athlete comparison with repeated IDs and optional year', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: { athletes: [] } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await publicStatistics.getPublicAthleteComparison(['a-1', 'a-2'], undefined, '2024');

    expect(result).toEqual({ athletes: [] });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('athleteId=a-1&athleteId=a-2&year=2024');
  });

  it('gets reportable published disciplines', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: [{ code: '100m', label: '100m' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(publicStatistics.listPublicStatisticsReportDisciplines()).resolves.toEqual([{ code: '100m', label: '100m' }]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/public/statistics/report/disciplines');
  });

  it('gets the public detailed report with only selected URL filters', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [], meta: { count: 0, generatedAt: '2026-09-25T00:00:00.000Z' } }));
    vi.stubGlobal('fetch', fetchMock);

    await publicStatistics.getPublicStatisticsReport({ discipline: '100m', season: '', gender: 'female', age: '20' });

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/public/statistics/report?discipline=100m&gender=female&age=20');
  });

  it('gets public fixture standings for the selected season', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(publicStatistics.getPublicClubStandings('2026')).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/public/statistics/standings?season=2026');
  });
});
