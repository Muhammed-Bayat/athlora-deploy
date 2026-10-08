import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type {
  AnalyticsDiscipline,
  CoachInjuryAnalysis,
  CoachPerformanceAnalysis,
  CoachPerformanceResultPoint,
  CoachRankingsAnalysis,
} from '../../api/analytics';
import {
  coachDateRangeLabel,
  coachInjuryMonitoringReportPdf,
  coachInjuryWarningReasons,
  coachPerformanceFacts,
  coachPerformanceReportPdf,
  coachRankingMethodology,
  coachRankingsReportPdf,
} from './coachingAnalyticsReport';

const sprint: AnalyticsDiscipline = {
  code: '100m',
  label: '100m',
  unit: 'seconds',
  precision: 2,
  direction: 'lower',
};

function point(date: string, value: number): CoachPerformanceResultPoint {
  return {
    date,
    time: null,
    value,
    event: { id: `event-${date}`, title: `Meet ${date}`, type: 'competition' },
  };
}

const performanceAnalysis: CoachPerformanceAnalysis = {
  selectedRange: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
  lifecycleStatus: 'active',
  athletes: [{
    athlete: { id: 'athlete-1', name: 'Ari Runner', status: 'active' },
    disciplines: [{
      discipline: sprint,
      recordCount: 4,
      first: point('2026-01-01', 12.4),
      latest: point('2026-03-01', 12.1),
      best: {
        personalBest: 12.1,
        seasonBest: 12.1,
        selectedRangeBest: 12.1,
        season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' },
      },
      improvement: 0.3,
      improvementPercent: 2.42,
      recentTrend: { direction: 'improving', previousAverage: 12.35, recentAverage: 12.15, change: 0.2, samplesPerWindow: 2 },
      consistency: { sampleCount: 4, standardDeviation: 0.11, relativeVolatilityPercent: 0.91 },
      plateau: {
        status: 'not_plateaued',
        reason: 'The latest two-result average changed by more than one displayed precision increment.',
        change: 0.2,
        samplesPerWindow: 2,
      },
      sufficientData: true,
      insufficientDataReason: null,
      history: [point('2026-01-01', 12.4), point('2026-02-01', 12.3), point('2026-02-15', 12.2), point('2026-03-01', 12.1)],
    }],
  }],
};

const injuryAnalysis: CoachInjuryAnalysis = {
  selectedRange: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
  lifecycleStatus: 'all',
  limitations: [
    'Indicators summarize recorded injuries only; they are not medical diagnoses or probability estimates.',
    'No workload, readiness, attendance, treatment, or recovery data is available to these indicators.',
  ],
  athletes: [{
    athlete: { id: 'athlete-1', name: 'Ari Runner', status: 'active' },
    injuryCount: 1,
    activeInjuryCount: 1,
    mostCommonRecordedArea: { bodyRegion: 'Leg', area: 'Knee', count: 1 },
    repeatedInjuries: [],
    warning: { level: 'moderate', reasons: ['active_moderate_injury', 'recent_recorded_injury'] },
    history: [{
      bodyRegion: 'Leg',
      area: 'Knee',
      side: 'Left',
      severity: 'Moderate',
      occurrenceDate: '2026-03-01',
      expectedReturnDate: '2026-03-20',
      resolvedDate: null,
      active: true,
    }],
  }],
};

const rankingsAnalysis: CoachRankingsAnalysis = {
  discipline: sprint,
  selectedRange: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
  lifecycleStatus: 'active',
  limit: 50,
  scoring: {
    direction: 'lower',
    weights: { standing: 0.45, improvementPercent: 0.25, consistency: 0.2, resultCount: 0.1 },
    missingFactorHandling: 'Factors without enough athlete or comparison data are omitted from the weighted score.',
    ordering: 'Higher score ranks first; ties use discipline standing, athlete name, then athlete ID.',
  },
  athletes: [{
    athlete: { id: 'athlete-1', name: 'Ari Runner', status: 'active' },
    rank: 1,
    score: 81.25,
    includedFactors: ['standing', 'improvementPercent', 'consistency', 'resultCount'],
    sufficientData: true,
    insufficientDataReason: null,
    factors: {
      standing: { value: 12.1, personalBest: 12.1, current: 12.1, standingRank: 1, score: 100, includedInScore: true, insufficientDataReason: null },
      improvementPercent: { value: 2.42, score: 75, includedInScore: true, insufficientDataReason: null },
      consistency: { value: { sampleCount: 4, standardDeviation: 0.11, relativeVolatilityPercent: 0.91 }, score: 50, includedInScore: true, insufficientDataReason: null },
      resultCount: { value: 4, score: 100, includedInScore: true, insufficientDataReason: null },
    },
  }, {
    athlete: { id: 'athlete-2', name: 'Bex Runner', status: 'active' },
    rank: null,
    score: null,
    includedFactors: [],
    sufficientData: false,
    insufficientDataReason: 'No comparable recorded-performance factors are available for this athlete.',
    factors: {
      standing: { value: null, personalBest: null, current: null, standingRank: null, score: null, includedInScore: false, insufficientDataReason: 'A valid completed-competition result is required for personal-best standing.' },
      improvementPercent: { value: null, score: null, includedInScore: false, insufficientDataReason: 'At least two valid normalized results are required for improvement.' },
      consistency: { value: null, score: null, includedInScore: false, insufficientDataReason: 'At least 3 valid normalized results are required for consistency.' },
      resultCount: { value: null, score: null, includedInScore: false, insufficientDataReason: 'No valid normalized results exist in the selected range.' },
    },
  }],
};

describe('coaching analytics reports', () => {
  it('creates a direction-aware multi-athlete performance PDF using selected-range facts and charts', async () => {
    const discipline = performanceAnalysis.athletes[0]!.disciplines[0]!;

    expect(coachDateRangeLabel(performanceAnalysis.selectedRange)).toBe('01 Jan 2026 to 31 Mar 2026');
    expect(coachPerformanceFacts(discipline)).toEqual(expect.arrayContaining([
      'Lower values are better',
      'Direction-aware first-to-latest change: +0.30 s (+2.42%); improvement.',
    ]));

    const document = await PDFDocument.load(await coachPerformanceReportPdf(performanceAnalysis));
    expect(document.getPageCount()).toBeGreaterThan(0);
  });

  it('creates a non-diagnostic injury-monitoring PDF from minimal fields and server warning codes', async () => {
    expect(coachInjuryWarningReasons(injuryAnalysis.athletes[0]!.warning)).toBe('active_moderate_injury, recent_recorded_injury');
    expect(injuryAnalysis.athletes[0]!.history[0]).not.toHaveProperty('notes');

    const document = await PDFDocument.load(await coachInjuryMonitoringReportPdf(injuryAnalysis));
    expect(document.getPageCount()).toBeGreaterThan(0);
  });

  it('creates a ranking PDF that documents deterministic factors, scores, and omitted-factor reasons', async () => {
    expect(coachRankingMethodology(rankingsAnalysis)).toEqual(expect.arrayContaining([
      'Deterministic factor weights: standing 45%, improvement percentage 25%, consistency 20%, result count 10%.',
      'Factors without enough athlete or comparison data are omitted from the weighted score.',
    ]));

    const document = await PDFDocument.load(await coachRankingsReportPdf(rankingsAnalysis));
    expect(document.getPageCount()).toBeGreaterThan(0);
  });
});
