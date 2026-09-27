import { describe, expect, it, vi } from 'vitest';
import { getPublicClubStandings } from './standings.js';

describe('public club standings service', () => {
  it('maps safe standing totals and queries only accepted current shared fixtures', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      club_id: 'club-1', club_name: 'Open Track Club', total_points: '8', fixtures: '2', wins: '1',
      seconds: '1', thirds: '0', scored_results: '2', rank: '1',
    }] });

    await expect(getPublicClubStandings('2026', { query } as never)).resolves.toEqual([{
      clubId: 'club-1', clubName: 'Open Track Club', totalPoints: 8, fixtures: 2, wins: 1,
      seconds: 1, thirds: 0, scoredResults: 2, rank: 1,
    }]);
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("fw.role = 'host'");
    expect(sql).toContain("guest.role = 'guest'");
    expect(sql).toContain('accepted_revision = e.fixture_revision');
    expect(sql).toContain("d.default_rules->>'entrantType' = 'relay'");
    expect(sql).toContain('RANK() OVER (ORDER BY total_points DESC, wins DESC, seconds DESC, thirds DESC)');
    expect(query.mock.calls[0]?.[1]).toEqual(['2026-01-01', '2027-01-01']);
  });
});
