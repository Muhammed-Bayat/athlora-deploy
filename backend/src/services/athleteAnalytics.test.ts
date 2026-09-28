import { describe, expect, it, vi } from 'vitest';
import {
  getAthleteDisciplineAnalytics,
  getSquadDisciplineAnalytics,
  getWorkspaceDisciplineAnalytics,
  rankSquadDisciplineAthletes,
  summarizeAthleteDisciplineResults,
  type AnalyticsDiscipline,
  type NormalizedAthleteResult,
} from './athleteAnalytics.js';
import type { SeasonScope } from './seasons.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const athleteId = '22222222-2222-4222-8222-222222222222';
const otherAthleteId = '33333333-3333-4333-8333-333333333333';
const squadId = '44444444-4444-4444-8444-444444444444';
const disciplineDefinitionId = '55555555-5555-4555-8555-555555555555';
const timeDiscipline: AnalyticsDiscipline = {
  code: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower',
};
const distanceDiscipline: AnalyticsDiscipline = {
  code: 'long_jump', label: 'Long jump', unit: 'metres', precision: 2, direction: 'higher',
};
const season: SeasonScope = { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' };

function result(
  discipline: AnalyticsDiscipline,
  value: number,
  date: string,
  source: NormalizedAthleteResult['source'] = 'session_result',
  athlete = athleteId,
): NormalizedAthleteResult {
  const sourceResultId = `${source}-${date}-${value}`;
  return {
    id: `${source}:${sourceResultId}`,
    source,
    sourceResultId,
    athleteId: athlete,
    discipline,
    event: { id: `event-${date}-${value}`, title: 'Meet', date, time: null, type: 'competition' },
    value,
    place: null,
  };
}

describe('athlete discipline analytics', () => {
  it('returns null metrics for an athlete with no results', () => {
    const summary = summarizeAthleteDisciplineResults(athleteId, timeDiscipline, [], season);

    expect(summary).toMatchObject({
      pb: null,
      sb: null,
      latest: null,
      first: null,
      average: null,
      median: null,
      improvement: null,
      recentTrend: null,
      resultCount: 0,
      recentResults: [],
      history: [],
    });
  });

  it('keeps single-result metrics while leaving comparison metrics null', () => {
    const onlyResult = result(timeDiscipline, 11.2, '2026-03-01');
    const summary = summarizeAthleteDisciplineResults(athleteId, timeDiscipline, [onlyResult], season);

    expect(summary).toMatchObject({
      pb: 11.2,
      sb: 11.2,
      latest: onlyResult,
      first: onlyResult,
      average: 11.2,
      median: 11.2,
      improvement: null,
      recentTrend: null,
      resultCount: 1,
    });
  });

  it('calculates lower-is-better time statistics, progression, and recent trend', () => {
    const history = [
      result(timeDiscipline, 12, '2025-12-01'),
      result(timeDiscipline, 11, '2026-02-01'),
      result(timeDiscipline, 10.5, '2026-03-01'),
    ];
    const summary = summarizeAthleteDisciplineResults(athleteId, timeDiscipline, history, season);

    expect(summary).toMatchObject({
      pb: 10.5,
      sb: 10.5,
      average: 11.17,
      median: 11,
      improvement: 1.5,
      resultCount: 3,
      recentTrend: {
        direction: 'improving',
        previousAverage: 11,
        recentAverage: 10.5,
        change: 0.5,
        samplesPerWindow: 1,
      },
    });
    expect(summary.first?.value).toBe(12);
    expect(summary.latest?.value).toBe(10.5);
    expect(summary.recentResults.map((entry) => entry.value)).toEqual([10.5, 11, 12]);
  });

  it('uses all normalized history as the all-time season scope', () => {
    const allTime: SeasonScope = { selected: 'all', startDate: null, endDate: null };
    const summary = summarizeAthleteDisciplineResults(athleteId, timeDiscipline, [
      result(timeDiscipline, 11.8, '2025-12-01'),
      result(timeDiscipline, 10.9, '2026-02-01'),
    ], allTime);

    expect(summary).toMatchObject({ pb: 10.9, sb: 10.9 });
  });

  it('calculates higher-is-better distance statistics and ranks using the visible PB factor', () => {
    const longJumpHistory = [
      result(distanceDiscipline, 5.1, '2026-01-01'),
      result(distanceDiscipline, 5.6, '2026-02-01'),
      result(distanceDiscipline, 5.4, '2026-03-01'),
    ];
    const summary = summarizeAthleteDisciplineResults(athleteId, distanceDiscipline, longJumpHistory, season);
    const ranking = rankSquadDisciplineAthletes(
      [
        { id: athleteId, name: 'Ari', lifecycle_status: 'active' },
        { id: otherAthleteId, name: 'Bea', lifecycle_status: 'active' },
        { id: squadId, name: 'Cy', lifecycle_status: 'inactive' },
      ],
      distanceDiscipline,
      [...longJumpHistory, result(distanceDiscipline, 5.8, '2026-02-10', 'session_result', otherAthleteId)],
      season,
    );

    expect(summary).toMatchObject({
      pb: 5.6,
      sb: 5.6,
      average: 5.37,
      median: 5.4,
      improvement: 0.3,
      recentTrend: {
        direction: 'declining',
        previousAverage: 5.6,
        recentAverage: 5.4,
        change: -0.2,
      },
    });
    expect(ranking.map(({ athlete, rank, factors }) => ({ athlete: athlete.name, rank, pb: factors.pb }))).toEqual([
      { athlete: 'Bea', rank: 1, pb: 5.8 },
      { athlete: 'Ari', rank: 2, pb: 5.6 },
      { athlete: 'Cy', rank: null, pb: null },
    ]);
    expect(ranking[0]).not.toHaveProperty('score');
  });

  it('unions legacy 100m rows with finalized generic session rows without migrating either source', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: athleteId }] })
      .mockResolvedValueOnce({ rows: [{ ...timeDiscipline, precision: '2' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            source: 'legacy_result', source_result_id: `legacy-${athleteId}`, athlete_id: athleteId,
            ...timeDiscipline, precision: '2', event_id: 'legacy-event', event_title: 'Legacy meet',
            event_date: '2025-12-01', event_time: null, event_type: 'competition', result_value: '11.4', placing: 2,
          },
          {
            source: 'session_result', source_result_id: 'session-result-id', athlete_id: athleteId,
            ...timeDiscipline, precision: '2', event_id: 'generic-event', event_title: 'Finalized meet',
            event_date: '2026-03-01', event_time: null, event_type: 'competition', result_value: '11.1', placing: 1,
          },
        ],
      });

    const summary = await getAthleteDisciplineAnalytics(
      workspaceId,
      athleteId,
      '100m',
      season,
      { query } as never,
    );

    expect(summary.pb).toBe(11.1);
    expect(summary.sb).toBe(11.1);
    expect(summary.history.map(({ source, sourceResultId }) => ({ source, sourceResultId }))).toEqual([
      { source: 'legacy_result', sourceResultId: `legacy-${athleteId}` },
      { source: 'session_result', sourceResultId: 'session-result-id' },
    ]);
    const normalizedQuery = String(query.mock.calls[2]?.[0]);
    expect(normalizedQuery).toContain('FROM results r');
    expect(normalizedQuery).toContain('FROM session_results r');
    expect(normalizedQuery).toContain('UNION ALL');
    expect(normalizedQuery).not.toContain('INSERT INTO');
    expect(normalizedQuery).toContain("s.result_state = 'final'");
  });

  it('uses one generic not-found response for an out-of-workspace squad', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(getSquadDisciplineAnalytics(
      workspaceId,
      squadId,
      'long_jump',
      season,
      { query } as never,
    )).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Resource not found' });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('FROM squads WHERE id = $1 AND workspace_id = $2');
  });

  it('lists active workspace athletes with any preferred definition version sharing the requested code', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: disciplineDefinitionId, ...timeDiscipline, precision: '2' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: athleteId, name: 'Ari', lifecycle_status: 'active' },
          { id: otherAthleteId, name: 'Bea', lifecycle_status: 'active' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            source: 'legacy_result', source_result_id: `legacy-${athleteId}`, athlete_id: athleteId,
            ...timeDiscipline, precision: '2', event_id: 'legacy-event', event_title: 'Legacy meet',
            event_date: '2025-12-01', event_time: null, event_type: 'competition', result_value: '11.4', placing: 2,
          },
          {
            source: 'session_result', source_result_id: 'session-result-id', athlete_id: athleteId,
            ...timeDiscipline, precision: '2', event_id: 'generic-event', event_title: 'Finalized meet',
            event_date: '2026-03-01', event_time: null, event_type: 'competition', result_value: '11.1', placing: 1,
          },
        ],
      });

    const analytics = await getWorkspaceDisciplineAnalytics(
      workspaceId,
      '100m',
      season,
      { query } as never,
    );

    expect(analytics.ranking).toMatchObject({ basis: 'pb', direction: 'lower' });
    expect(analytics.athletes.map(({ athlete, rank, factors }) => ({
      name: athlete.name, rank, pb: factors.pb, sources: factors.history.map((entry) => entry.source),
    }))).toEqual([
      { name: 'Ari', rank: 1, pb: 11.1, sources: ['legacy_result', 'session_result'] },
      { name: 'Bea', rank: null, pb: null, sources: [] },
    ]);
    const athletesQuery = String(query.mock.calls[1]?.[0]);
    expect(athletesQuery).toContain('a.workspace_id = $1');
    expect(athletesQuery).toContain("a.lifecycle_status = 'active'");
    expect(athletesQuery).toContain('JOIN discipline_definitions preferred_definition');
    expect(athletesQuery).toContain('preferred_definition.code = $2');
    expect(athletesQuery).toContain('GROUP BY a.id, a.name, a.lifecycle_status');
    expect(query.mock.calls[1]?.[1]).toEqual([workspaceId, '100m']);
    expect(query.mock.calls[2]?.[1]).toEqual([workspaceId, '100m', [athleteId, otherAthleteId]]);
  });
});
