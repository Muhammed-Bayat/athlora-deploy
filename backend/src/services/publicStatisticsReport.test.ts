import { describe, expect, it, vi } from 'vitest';
import { getPublicStatisticsReport } from './publicStatisticsReport.js';

describe('public statistics report service', () => {
  it('queries only final published individual performances and maps safe report rows', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      athlete_id: 'athlete', athlete_name: 'Ari Runner', club_id: '33333333-3333-4333-8333-333333333333', club_name: 'Open Track',
      code: '100m', label: '100 metres', discipline_unit: 'seconds', precision: '2', direction: 'lower', final_result: '10.91', place: '1', event_title: 'City Final', event_date: '2026-09-25',
    }] });
    const report = await getPublicStatisticsReport({ season: '2026', gender: 'female', age: '20' }, { query } as never);

    expect(report).toEqual([expect.objectContaining({ athleteName: 'Ari Runner', performance: 10.91, eventTitle: 'City Final', place: 1 })]);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain("s.result_state = 'final'");
    expect(sql).toContain('c.public_results_enabled = true');
    expect(sql).toContain("a.lifecycle_status <> 'archived'");
    expect(sql).toContain("en.kind = 'athlete'");
    expect(sql).toContain("r.outcome = 'valid'");
    expect(sql).toContain('FROM results r');
    expect(sql).toContain('UNION ALL');
  });

  it('rejects invalid public filters before querying', async () => {
    const query = vi.fn();
    await expect(getPublicStatisticsReport({ gender: 'unknown' }, { query } as never)).rejects.toMatchObject({ code: 'REPORT_FILTER_INVALID' });
    expect(query).not.toHaveBeenCalled();
  });
});
