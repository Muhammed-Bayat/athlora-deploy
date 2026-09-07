import { afterEach, describe, expect, it, vi } from 'vitest';
import * as clubs from './clubs';
afterEach(() => vi.unstubAllGlobals());
function response(data: unknown, status = 200) { return new Response(status === 204 ? null : JSON.stringify(data), { status }); }
describe('club API', () => {
  it('covers discovery, membership, and review requests', async () => {
    const data = { id: 'id-1' };
    const fetchMock = vi.fn<typeof fetch>();
    for (let index = 0; index < 8; index += 1) fetchMock.mockResolvedValueOnce(response(index === 0 || index === 3 || index === 5 ? { data: [], meta: { count: 0 } } : { data }));
    vi.stubGlobal('fetch', fetchMock);
    await clubs.listClubs(' Fast Club '); await clubs.createClub('Fast Club'); await clubs.requestToJoinClub('club-1'); await clubs.listMyClubJoinRequests(); await clubs.withdrawClubJoinRequest('request-1'); await clubs.listClubJoinRequests('club-1'); await clubs.approveClubJoinRequest('club-1', 'request-1', 'assistant'); await clubs.rejectClubJoinRequest('club-1', 'request-1');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('clubs?q=Fast%20Club');
    expect(fetchMock.mock.calls[6]?.[1]).toEqual(expect.objectContaining({ method: 'POST', body: JSON.stringify({ role: 'assistant' }) }));
  });
});
