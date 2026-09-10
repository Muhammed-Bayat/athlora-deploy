import { beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({ createClub: vi.fn(), createJoinRequest: vi.fn(), getClubComparison: vi.fn(), getClubStatistics: vi.fn(), listClubComparisonAthletes: vi.fn(), listClubJoinRequests: vi.fn(), listClubs: vi.fn(), listMyJoinRequests: vi.fn(), reviewJoinRequest: vi.fn(), withdrawJoinRequest: vi.fn() }));
const auth = vi.hoisted(() => ({ getApplicationUserContext: vi.fn(() => ({ userId: 'coach-1' })), getLocalApplicationUserContext: vi.fn(() => ({ userId: 'user-1' })) }));
vi.mock('../services/clubs.js', () => services);
vi.mock('../middleware/auth.js', () => auth);
import * as clubs from './clubs.js';

function response() { const value = { status: vi.fn(), json: vi.fn(), end: vi.fn() }; value.status.mockReturnValue(value); return value; }
async function invoke(handler: typeof clubs.list, params = { clubId: 'club-1', id: 'request-1' }, body: Record<string, unknown> = { name: 'Fast Club', role: 'coach' }, query: Record<string, unknown> = {}) { const res = response(); const next = vi.fn(); await handler({ params, body, query } as never, res as never, next); expect(next).not.toHaveBeenCalled(); return res; }

describe('club controllers', () => {
  beforeEach(() => { vi.clearAllMocks(); for (const mock of Object.values(services)) mock.mockResolvedValue([]); services.createClub.mockResolvedValue({ id: 'club-1' }); services.createJoinRequest.mockResolvedValue({ id: 'request-1' }); services.reviewJoinRequest.mockResolvedValue({ id: 'request-1' }); });
  it('handles discovery and applicant actions', async () => { await invoke(clubs.list, undefined, undefined, { q: ' Fast ' }); await invoke(clubs.create); await invoke(clubs.requestJoin); await invoke(clubs.listMine); await invoke(clubs.withdraw); expect(services.listClubs).toHaveBeenCalledWith('Fast'); expect(services.createClub).toHaveBeenCalledWith('user-1', 'Fast Club'); });
  it('handles coach review actions', async () => { await invoke(clubs.listJoinRequests); await invoke(clubs.approve); await invoke(clubs.reject); expect(services.reviewJoinRequest).toHaveBeenCalledWith('club-1', 'request-1', 'coach-1', 'approved', 'coach'); expect(services.reviewJoinRequest).toHaveBeenCalledWith('club-1', 'request-1', 'coach-1', 'rejected'); });
  it('returns comparison lookup and club statistic envelopes', async () => {
    services.listClubComparisonAthletes.mockResolvedValue([{ id: 'athlete-1', name: 'Ari Runner', status: 'active' }]);
    services.getClubStatistics.mockResolvedValue({ club: { id: 'club-1', name: 'Fast Club' } });
    services.getClubComparison.mockResolvedValue({ clubs: [] });

    const athletes = await invoke(clubs.listComparisonAthletes, undefined, undefined, { q: ' Ari ' });
    const statistics = await invoke(clubs.statistics);
    const comparison = await invoke(clubs.comparison, undefined, undefined, { club1Id: 'club-1', club2Id: 'club-2' });

    expect(services.listClubComparisonAthletes).toHaveBeenCalledWith('club-1', 'Ari');
    expect(athletes.json).toHaveBeenCalledWith({ data: [{ id: 'athlete-1', name: 'Ari Runner', status: 'active' }], meta: { count: 1 } });
    expect(statistics.json).toHaveBeenCalledWith({ data: { club: { id: 'club-1', name: 'Fast Club' } } });
    expect(services.getClubComparison).toHaveBeenCalledWith('club-1', 'club-2');
    expect(comparison.json).toHaveBeenCalledWith({ data: { clubs: [] } });
  });
});
