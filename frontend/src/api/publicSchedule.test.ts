import { afterEach, describe, expect, it, vi } from 'vitest';
import * as publicSchedule from './publicSchedule';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

describe('publicSchedule API', () => {
  it('lists schedule-published clubs with optional search query', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(response({ data: [{ id: 'club-1', name: 'Fast Club' }], meta: { count: 1 } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await publicSchedule.listPublicScheduleClubs(' Fast Club ');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('clubs?q=Fast%20Club');

    await publicSchedule.listPublicScheduleClubs();
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/v1/public/schedule/clubs');
    expect(fetchMock.mock.calls[1]?.[0]).not.toContain('?q=');
  });

  it('gets a club schedule and unwraps the data envelope', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(response({
        data: {
          club: { id: 'club-1', name: 'Fast Club' },
          events: [{
            id: 'event-1',
            title: 'Spring Open',
            date: '2026-10-01',
            time: '10:00:00',
            type: 'competition',
            discipline: '100m',
            disciplines: [{ code: '100m', label: '100m' }],
            locationName: 'City Track',
            status: 'scheduled',
          }],
        },
      })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const schedule = await publicSchedule.getPublicClubSchedule('club-1', controller.signal);

    expect(schedule.club.name).toBe('Fast Club');
    expect(schedule.events[0]?.disciplines).toEqual([{ code: '100m', label: '100m' }]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/public/schedule/clubs/club-1');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: controller.signal }));
  });

  it('propagates the 404 for disabled or unknown clubs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(response({ error: { code: 'NOT_FOUND', message: 'Resource not found' } }, 404)),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(publicSchedule.getPublicClubSchedule('club-1')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});
