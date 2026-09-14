import { afterEach, describe, expect, it, vi } from 'vitest';
import * as injuries from './injuries';
afterEach(() => vi.unstubAllGlobals());
function response(data: unknown) { return new Response(JSON.stringify(data)); }
describe('injury API', () => {
  it('covers list, create, lifecycle, and deletion requests', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    for (let index = 0; index < 6; index += 1) fetchMock.mockResolvedValueOnce(response(index < 2 ? { data: [], meta: { count: 0 } } : { data: { id: 'injury-1' } }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await injuries.listInjuries('athlete-1', controller.signal, 'active'); await injuries.listAthleteInjurySummaries(controller.signal); await injuries.createInjury('athlete-1', { bodyRegion: 'leg', area: 'knee', side: 'left', severity: 'minor' }); await injuries.resolveInjury('athlete-1', 'injury-1'); await injuries.reopenInjury('athlete-1', 'injury-1'); await injuries.deleteInjury('athlete-1', 'injury-1');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('injuries?status=active');
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls[5]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });
});
