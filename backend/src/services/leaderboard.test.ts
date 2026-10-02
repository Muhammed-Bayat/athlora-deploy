import { describe, expect, it, vi } from 'vitest';
import { getPublicLeaderboard } from './leaderboard.js';

describe('public leaderboard service', () => {
  it('queries the public leaderboard with applied filters and direction-correct ranking', async () => {
    const query = { discipline: '100m', season: '2026', gender: 'male', age: '20', club: 'club-1' };
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          athlete_id: 'ath-1',
          athlete_name: 'Fast Runner',
          club_id: 'club-1',
          club_name: 'Speed Club',
          code: '100m',
          label: '100m',
          discipline_unit: 'seconds',
          precision: '2',
          direction: 'lower',
          best_result: '10.5',
          place: '1',
          gender: 'male',
          dob: '2006-01-01',
        },
      ],
    });
    const db = { query: mockQuery } as never;
    const entries = await getPublicLeaderboard(query, db);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expect.objectContaining({ athleteName: 'Fast Runner', label: '100m', performance: 10.5, place: 1, discipline: '100m' }));
    expect(mockQuery).toHaveBeenCalledOnce();
    expect(mockQuery.mock.calls[0]?.[0]).toContain('FROM results r');
    expect(mockQuery.mock.calls[0]?.[0]).toContain("s.result_state = 'final'");
    expect(mockQuery.mock.calls[0]?.[0]).toContain('EXTRACT(YEAR FROM age(e.date, a.dob))::integer =');
    expect(mockQuery.mock.calls[0]?.[1]).toContain(20);
  });

  it('uses valid supported-discipline filters without requiring a discipline query parameter', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(getPublicLeaderboard({ season: 'all' }, { query } as never)).resolves.toEqual([]);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("r.discipline IN ('100m', '200m', '400m'");
    expect(sql).toContain("d.code IN ('100m', '200m', '400m'");
  });

  it.each(['under-20', '20.5', '4', '101', 'not-an-age'])('rejects invalid exact age %s before querying', async (age) => {
    const query = vi.fn();
    await expect(getPublicLeaderboard({ age }, { query } as never)).rejects.toMatchObject({ code: 'LEADERBOARD_FILTER_INVALID' });
    expect(query).not.toHaveBeenCalled();
  });
});
