import { afterEach, describe, expect, it, vi } from 'vitest';
import * as clubs from './clubs';
afterEach(() => vi.unstubAllGlobals());
function response(data: unknown, status = 200) { return new Response(status === 204 ? null : JSON.stringify(data), { status }); }
describe('club API', () => {
  it('serializes selected club calendars with repeated IDs and an optional season', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [], meta: { count: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    await clubs.listClubCalendarEvents(['club one', 'club&two'], '2025');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clubs/calendar?clubId=club+one&clubId=club%26two&year=2025'),
      expect.any(Object),
    );
  });

  it('covers discovery, membership, and review requests', async () => {
    const data = { id: 'id-1' };
    const fetchMock = vi.fn<typeof fetch>();
    for (let index = 0; index < 12; index += 1) fetchMock.mockResolvedValueOnce(response(index === 0 || index === 3 || index === 5 || index === 8 ? { data: [], meta: { count: 0 } } : { data }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await clubs.listClubs(' Fast Club '); await clubs.createClub('Fast Club'); await clubs.requestToJoinClub('club-1'); await clubs.listMyClubJoinRequests(); await clubs.withdrawClubJoinRequest('request-1'); await clubs.listClubJoinRequests('club-1'); await clubs.approveClubJoinRequest('club-1', 'request-1', 'assistant'); await clubs.rejectClubJoinRequest('club-1', 'request-1'); await clubs.listClubComparisonAthletes('club-1', ' Ari & Bea ', controller.signal); await clubs.getClubStatistics('club-1'); await clubs.getClubComparison('club-1', 'club-2'); await clubs.getClubMultiComparison(['club-1', 'club-2']);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('clubs?q=Fast%20Club');
    expect(fetchMock.mock.calls[6]?.[1]).toEqual(expect.objectContaining({ method: 'POST', body: JSON.stringify({ role: 'assistant' }) }));
    expect(fetchMock.mock.calls[8]?.[0]).toContain('clubs/club-1/athletes?q=Ari%20%26%20Bea');
    expect(fetchMock.mock.calls[8]?.[1]).toEqual(expect.objectContaining({ signal: controller.signal }));
    expect(fetchMock.mock.calls[9]?.[0]).toContain('clubs/club-1/statistics');
    expect(fetchMock.mock.calls[10]?.[0]).toContain('clubs/comparison?club1Id=club-1&club2Id=club-2');
    expect(fetchMock.mock.calls[11]?.[0]).toContain('clubs/comparison/multi?clubId=club-1&clubId=club-2');
  });

  it('sends both publication flags on update', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { publicResultsEnabled: true, publicScheduleEnabled: false } }));
    vi.stubGlobal('fetch', fetchMock);

    await clubs.updateClubPublication(true, false);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/clubs/publication'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ publicResultsEnabled: true, publicScheduleEnabled: false }),
      }),
    );
  });
});
