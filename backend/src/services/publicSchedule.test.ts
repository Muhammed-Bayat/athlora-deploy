import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ getPool: vi.fn() }));

import { getPool } from '../db/client.js';
import { getPublicClubSchedule, listPublicScheduleClubs } from './publicSchedule.js';

const CLUB_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';
const query = vi.fn();

function poolRow(rows: unknown[] = []) {
  return { rows, rowCount: rows.length } as never;
}

const upcomingEventRow = {
  id: EVENT_ID,
  title: 'Spring Open',
  date: '2026-10-01',
  time: '10:00:00',
  type: 'competition',
  discipline: '100m',
  location_name: 'City Track',
  status: 'scheduled',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPool).mockReturnValue({ query } as never);
});

describe('listPublicScheduleClubs', () => {
  it('queries only schedule-published clubs with the optional search', async () => {
    query.mockResolvedValue(poolRow([{ id: CLUB_ID, name: 'Open Track Club' }]));

    const clubs = await listPublicScheduleClubs('track');

    expect(clubs).toEqual([{ id: CLUB_ID, name: 'Open Track Club' }]);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('public_schedule_enabled = true');
    expect(sql).not.toContain('public_results_enabled');
    expect(parameters).toEqual(['track']);
  });
});

describe('getPublicClubSchedule', () => {
  it('gates the club lookup on the schedule flag and never joins participant data', async () => {
    query
      .mockResolvedValueOnce(poolRow([{ id: CLUB_ID, workspace_id: WORKSPACE_ID, name: 'Open Track Club' }]))
      .mockResolvedValueOnce(poolRow([upcomingEventRow]));

    const schedule = await getPublicClubSchedule(CLUB_ID, undefined, new Date('2026-09-15T12:00:00.000Z'));

    expect(schedule).toEqual({
      club: { id: CLUB_ID, name: 'Open Track Club' },
      events: [{
        id: EVENT_ID,
        title: 'Spring Open',
        date: '2026-10-01',
        time: '10:00:00',
        type: 'competition',
        discipline: '100m',
        locationName: 'City Track',
        status: 'scheduled',
      }],
    });
    const [clubSql] = query.mock.calls[0] as [string];
    expect(clubSql).toContain('public_schedule_enabled = true');
    expect(clubSql).not.toContain('public_results_enabled');
    const [eventsSql, eventsParams] = query.mock.calls[1] as [string, unknown[]];
    expect(eventsSql).not.toMatch(/event_participants|athletes|results|timeline_entries/);
    expect(eventsSql).toContain(`status IN ('scheduled', 'in_progress')`);
    expect(eventsParams).toEqual([WORKSPACE_ID, '2026-09-15']);
  });

  it('returns 404 NOT_FOUND for an unpublished club without leaking enumeration', async () => {
    query.mockResolvedValueOnce(poolRow([]));

    await expect(getPublicClubSchedule(CLUB_ID)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns the same generic 404 for a malformed club id without querying', async () => {
    await expect(getPublicClubSchedule('not-a-uuid')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('covers the four publication combinations through independent flags', async () => {
    // Schedule on, results off: schedule is visible.
    query.mockResolvedValueOnce(poolRow([{ id: CLUB_ID, workspace_id: WORKSPACE_ID, name: 'Club' }]))
      .mockResolvedValueOnce(poolRow([upcomingEventRow]));
    await expect(getPublicClubSchedule(CLUB_ID)).resolves.toMatchObject({ club: { id: CLUB_ID } });

    // Schedule off: schedule hidden regardless of results flag (results flag is never read here).
    query.mockResolvedValueOnce(poolRow([]));
    await expect(getPublicClubSchedule(CLUB_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Results on/off has no effect on the schedule list query shape.
    query.mockResolvedValueOnce(poolRow([{ id: CLUB_ID, name: 'Club' }]));
    await listPublicScheduleClubs(null);
    expect(String(query.mock.calls.at(-1)?.[0])).toContain('public_schedule_enabled = true');
    expect(String(query.mock.calls.at(-1)?.[0])).not.toContain('public_results_enabled');
  });
});
