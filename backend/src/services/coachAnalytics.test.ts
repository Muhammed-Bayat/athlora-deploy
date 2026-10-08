import { describe, expect, it, vi } from 'vitest';
import {
  analyzeCoachPerformance,
  getCoachInjuryAnalytics,
  rankCoachAthletes,
  summarizeCoachInjuryRoster,
  summarizeCoachInjuries,
  summarizeCoachPerformanceChanges,
  type CoachDateRange,
} from './coachAnalytics.js';
import type { AnalyticsDiscipline, NormalizedAthleteResult } from './athleteAnalytics.js';
import type { SeasonScope } from './seasons.js';

const athleteId = '11111111-1111-4111-8111-111111111111';
const secondAthleteId = '22222222-2222-4222-8222-222222222222';
const thirdAthleteId = '33333333-3333-4333-8333-333333333333';
const season: SeasonScope = { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' };
const allDates: CoachDateRange = { dateFrom: null, dateTo: null };
const timed: AnalyticsDiscipline = {
  code: '100m', label: '100m', unit: 'seconds', precision: 2, direction: 'lower',
};
const measured: AnalyticsDiscipline = {
  code: 'long_jump', label: 'Long jump', unit: 'metres', precision: 2, direction: 'higher',
};

function result(
  discipline: AnalyticsDiscipline,
  value: number,
  date: string,
  athlete = athleteId,
): NormalizedAthleteResult {
  const sourceResultId = `${athlete}-${date}-${value}`;
  return {
    id: `session_result:${sourceResultId}`,
    source: 'session_result',
    sourceResultId,
    athleteId: athlete,
    discipline,
    event: {
      id: `event-${sourceResultId}`,
      title: 'Meet',
      date,
      time: null,
      type: 'competition',
      status: 'completed',
    },
    value,
    place: null,
  };
}

describe('coach analytics foundations', () => {
  it('orders distinct coach athletes by a selected case-insensitive name expression', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await getCoachInjuryAnalytics(
      '11111111-1111-4111-8111-111111111111',
      { dateRange: allDates, lifecycleStatus: 'all' },
      { query },
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain('lower(a.name) AS name_sort');
    expect(query.mock.calls[0]?.[0]).toContain('ORDER BY name_sort, a.id');
  });

  it('makes timed and measured improvements positive in their respective better directions', () => {
    const timedAnalysis = analyzeCoachPerformance(timed, [
      result(timed, 12, '2026-01-01'),
      result(timed, 11, '2026-02-01'),
    ], allDates, season);
    const measuredAnalysis = analyzeCoachPerformance(measured, [
      result(measured, 5, '2026-01-01'),
      result(measured, 5.5, '2026-02-01'),
    ], allDates, season);

    expect(timedAnalysis).toMatchObject({ improvement: 1, improvementPercent: 8.33, sufficientData: true });
    expect(measuredAnalysis).toMatchObject({ improvement: 0.5, improvementPercent: 10, sufficientData: true });
  });

  it('reports a direction-aware decline as a negative improvement', () => {
    const analysis = analyzeCoachPerformance(timed, [
      result(timed, 10, '2026-01-01'),
      result(timed, 10.5, '2026-02-01'),
    ], allDates, season);

    expect(analysis).toMatchObject({ improvement: -0.5, improvementPercent: -5 });
    expect(analysis.recentTrend).toMatchObject({ direction: 'declining', change: -0.5 });
  });

  it('identifies cross-discipline change leaders using normalized direction-aware percentages', () => {
    const athletes = [
      {
        athlete: { id: athleteId, name: 'Ari', status: 'active' as const },
        disciplines: [analyzeCoachPerformance(timed, [
          result(timed, 12, '2026-07-01'),
          result(timed, 11, '2026-09-01'),
        ], allDates, season)],
      },
      {
        athlete: { id: secondAthleteId, name: 'Bea', status: 'active' as const },
        disciplines: [analyzeCoachPerformance(measured, [
          result(measured, 5, '2026-07-01', secondAthleteId),
          result(measured, 5.75, '2026-09-01', secondAthleteId),
        ], allDates, season)],
      },
      {
        athlete: { id: thirdAthleteId, name: 'Cy', status: 'inactive' as const },
        disciplines: [analyzeCoachPerformance(timed, [
          result(timed, 10, '2026-07-01', thirdAthleteId),
          result(timed, 11, '2026-09-01', thirdAthleteId),
        ], allDates, season)],
      },
    ];

    const comparison = summarizeCoachPerformanceChanges(athletes, 2);

    expect(comparison).toMatchObject({
      eligibleAthleteDisciplineCount: 3,
      mostImproved: { athlete: { name: 'Bea' }, discipline: { code: 'long_jump' }, improvement: 0.75, improvementPercent: 15 },
      mostDeclined: { athlete: { name: 'Cy' }, discipline: { code: '100m' }, improvement: -1, improvementPercent: -10 },
      insufficientDataReason: null,
    });
    expect(comparison.relativeImprovementRanking).toMatchObject({
      limit: 2,
      eligibleAthleteCount: 3,
      entries: [
        { rank: 1, athlete: { name: 'Bea' }, discipline: { code: 'long_jump' }, improvementPercent: 15, classification: 'improved' },
        { rank: 2, athlete: { name: 'Ari' }, discipline: { code: '100m' }, improvementPercent: 8.33, classification: 'improved' },
      ],
    });
  });

  it('ranks each athlete once by their strongest eligible discipline and excludes non-positive baselines', () => {
    const athletes = [
      {
        athlete: { id: athleteId, name: 'Ari', status: 'active' as const },
        disciplines: [
          analyzeCoachPerformance(timed, [result(timed, 12, '2026-07-01'), result(timed, 11, '2026-09-01')], allDates, season),
          analyzeCoachPerformance(measured, [result(measured, 5, '2026-07-01'), result(measured, 6, '2026-09-01')], allDates, season),
        ],
      },
      {
        athlete: { id: secondAthleteId, name: 'Bea', status: 'active' as const },
        disciplines: [analyzeCoachPerformance(timed, [
          result(timed, 0, '2026-07-01', secondAthleteId),
          result(timed, 10, '2026-09-01', secondAthleteId),
        ], allDates, season)],
      },
    ];

    const ranking = summarizeCoachPerformanceChanges(athletes).relativeImprovementRanking;

    expect(ranking).toMatchObject({
      eligibleAthleteCount: 1,
      entries: [{ rank: 1, athlete: { name: 'Ari' }, discipline: { code: 'long_jump' }, improvementPercent: 20, classification: 'improved' }],
    });
    expect(ranking.insufficientDataReason).toBeNull();
  });

  it('returns an insufficient-data comparison when no athlete-discipline has two selected results', () => {
    const comparison = summarizeCoachPerformanceChanges([{
      athlete: { id: athleteId, name: 'Ari', status: 'active' },
      disciplines: [analyzeCoachPerformance(timed, [result(timed, 12, '2026-09-01')], allDates, season)],
    }]);

    expect(comparison).toMatchObject({
      eligibleAthleteDisciplineCount: 0,
      mostImproved: null,
      mostDeclined: null,
      insufficientDataReason: 'At least two valid normalized results in the selected range are required for each athlete-discipline comparison.',
      relativeImprovementRanking: {
        eligibleAthleteCount: 0,
        entries: [],
        insufficientDataReason: 'At least two valid normalized results with a positive first result are required for each athlete before descriptive relative-improvement ranking is available.',
      },
    });
  });

  it('excludes records outside the selected date range before calculating change', () => {
    const selectedRange: CoachDateRange = { dateFrom: '2026-07-08', dateTo: '2026-10-08' };
    const analysis = analyzeCoachPerformance(timed, [
      result(timed, 12, '2026-07-01'),
      result(timed, 11.5, '2026-08-01'),
      result(timed, 11, '2026-11-01'),
    ], selectedRange, season);

    expect(analysis).toMatchObject({
      recordCount: 1,
      first: { value: 11.5 },
      latest: { value: 11.5 },
      improvement: null,
      improvementPercent: null,
      sufficientData: false,
      insufficientDataReason: 'At least two valid normalized results in the selected range are required to compare change.',
    });
  });

  it('returns volatility only once there are enough samples and detects a plateau from four recent results', () => {
    const consistency = analyzeCoachPerformance(timed, [
      result(timed, 10, '2026-01-01'),
      result(timed, 11, '2026-02-01'),
      result(timed, 9, '2026-03-01'),
    ], allDates, season);
    const plateau = analyzeCoachPerformance(timed, [
      result(timed, 10, '2026-01-01'),
      result(timed, 10.01, '2026-02-01'),
      result(timed, 10, '2026-03-01'),
      result(timed, 10.01, '2026-04-01'),
    ], allDates, season);

    expect(consistency.consistency).toEqual({ sampleCount: 3, standardDeviation: 0.82, relativeVolatilityPercent: 8.16 });
    expect(consistency.plateau).toBeNull();
    expect(plateau.plateau).toMatchObject({ status: 'plateaued', samplesPerWindow: 2 });
  });

  it('summarizes repeated/common injury areas and derives only record-based warnings', () => {
    const athletes = [
      { id: athleteId, name: 'Ari', lifecycle_status: 'active' as const },
      { id: secondAthleteId, name: 'Bea', lifecycle_status: 'active' as const },
    ];
    const summaries = summarizeCoachInjuries(athletes, [
      {
        athleteId,
        bodyRegion: 'Leg', area: 'Knee', side: 'Left', severity: 'Minor',
        occurrenceDate: '2026-07-01', expectedReturnDate: null, resolvedDate: '2026-07-10', active: false,
      },
      {
        athleteId,
        bodyRegion: 'Leg', area: 'Knee', side: 'Left', severity: 'Moderate',
        occurrenceDate: '2026-09-01', expectedReturnDate: '2026-09-15', resolvedDate: null, active: true,
      },
      {
        athleteId: secondAthleteId,
        bodyRegion: 'Arm', area: 'Shoulder', side: 'Right', severity: 'Severe',
        occurrenceDate: '2026-08-01', expectedReturnDate: null, resolvedDate: null, active: true,
      },
    ], new Date('2026-10-01T00:00:00.000Z'));

    expect(summaries[0]).toMatchObject({
      injuryCount: 2,
      activeInjuryCount: 1,
      mostCommonRecordedArea: { bodyRegion: 'Leg', area: 'Knee', count: 2 },
      repeatedInjuries: [{ bodyRegion: 'Leg', area: 'Knee', side: 'Left', count: 2 }],
      warning: {
        level: 'moderate',
        reasons: expect.arrayContaining(['active_moderate_injury', 'overdue_expected_return', 'repeated_same_area', 'recent_recorded_injury']),
      },
    });
    expect(summaries[1]?.warning).toEqual({ level: 'high', reasons: ['active_severe_injury'] });
    expect(summarizeCoachInjuryRoster(summaries)).toMatchObject({
      injuryRecordCount: 3,
      athletesWithRecordedInjuries: 2,
      mostCommonRecordedArea: { bodyRegion: 'Leg', area: 'Knee', count: 2 },
      mostCommonBodyRegion: { bodyRegion: 'Leg', count: 2 },
      athletesWithRepeatedInjuries: [{ athlete: { name: 'Ari' }, repeatedInjuries: [{ area: 'Knee', count: 2 }] }],
      insufficientDataReason: null,
    });
  });

  it('reports no-recorded-injuries instead of an unavailable injury analysis', () => {
    const empty = summarizeCoachInjuryRoster(summarizeCoachInjuries([
      { id: athleteId, name: 'Ari', lifecycle_status: 'active' },
    ], []));

    expect(empty).toEqual({
      injuryRecordCount: 0,
      athletesWithRecordedInjuries: 0,
      mostCommonRecordedArea: null,
      mostCommonBodyRegion: null,
      athletesWithRepeatedInjuries: [],
      insufficientDataReason: 'No recorded injuries were found for the selected athletes and date range.',
    });
  });

  it('ranks promising athletes within one discipline and flags a single incomparable athlete as insufficient', () => {
    const athletes = [
      { id: athleteId, name: 'Ari', lifecycle_status: 'active' as const },
      { id: secondAthleteId, name: 'Bea', lifecycle_status: 'active' as const },
      { id: thirdAthleteId, name: 'Cy', lifecycle_status: 'active' as const },
    ];
    const rankings = rankCoachAthletes(athletes, measured, [
      result(measured, 5, '2026-01-01', athleteId),
      result(measured, 5.5, '2026-02-01', athleteId),
      result(measured, 6, '2026-03-01', athleteId),
      result(measured, 5.4, '2026-01-01', secondAthleteId),
      result(measured, 5.45, '2026-02-01', secondAthleteId),
      result(measured, 5.5, '2026-03-01', secondAthleteId),
    ], allDates, season);
    const insufficient = rankCoachAthletes([athletes[0]!], measured, [
      result(measured, 5.5, '2026-01-01'),
    ], allDates, season);

    expect(rankings.map(({ athlete, rank }) => ({ athlete: athlete.name, rank }))).toEqual([
      { athlete: 'Ari', rank: 1 },
      { athlete: 'Bea', rank: 2 },
      { athlete: 'Cy', rank: null },
    ]);
    expect(rankings[0]).toMatchObject({ sufficientData: true, includedFactors: expect.arrayContaining(['standing', 'improvementPercent']) });
    expect(insufficient[0]).toMatchObject({
      rank: null,
      score: null,
      sufficientData: false,
      insufficientDataReason: 'No comparable recorded-performance factors are available for this athlete.',
    });
  });
});
