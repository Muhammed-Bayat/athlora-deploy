import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { AnalyticsDiscipline, AnalyticsResult, AthleteDisciplineAnalysis, WorkspaceDisciplineAnalysis } from '../../api/analytics';
import {
  athletePerformanceInsights,
  athletePerformanceReportPdf,
  athletePerformanceStats,
  performanceChartModel,
  workspaceDisciplineReportPdf,
  workspaceDisciplineTellMe,
} from './performanceReport';

const rankingFactors = ['pb', 'sb', 'latest', 'first', 'average', 'median', 'improvement', 'recentTrend', 'resultCount'] as const;

function discipline(direction: AnalyticsDiscipline['direction'] = 'lower'): AnalyticsDiscipline {
  return { code: direction === 'lower' ? '100m' : 'long_jump', label: direction === 'lower' ? '100m' : 'Long jump', unit: direction === 'lower' ? 'seconds' : 'metres', precision: 2, direction };
}

function result(id: string, date: string, value: number, definition = discipline()): AnalyticsResult {
  return {
    id,
    source: 'session_result',
    sourceResultId: id,
    athleteId: 'athlete-1',
    discipline: definition,
    event: { id: `event-${id}`, title: `Championship event ${id}`, date, time: null, type: 'competition' },
    value,
    place: null,
  };
}

function analysis(history: AnalyticsResult[], definition = discipline()): AthleteDisciplineAnalysis {
  const chronological = [...history].sort((left, right) => left.event.date.localeCompare(right.event.date));
  const first = chronological[0] ?? null;
  const latest = chronological.at(-1) ?? null;
  const values = chronological.map((entry) => entry.value);
  const pb = values.length === 0 ? null : definition.direction === 'lower' ? Math.min(...values) : Math.max(...values);
  return {
    athleteId: 'athlete-1',
    discipline: definition,
    season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' },
    pb,
    sb: pb,
    latest,
    first,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    median: values.length ? values[Math.floor(values.length / 2)] ?? null : null,
    improvement: first && latest && values.length > 1 ? definition.direction === 'lower' ? first.value - latest.value : latest.value - first.value : null,
    recentTrend: null,
    resultCount: values.length,
    recentResults: chronological.slice(-8).reverse(),
    history,
  };
}

function workspace(athletes: WorkspaceDisciplineAnalysis['athletes'], definition = discipline()): WorkspaceDisciplineAnalysis {
  return {
    discipline: definition,
    season: { selected: 2026, startDate: '2026-01-01', endDate: '2027-01-01' },
    ranking: {
      basis: 'pb', direction: definition.direction,
      ordering: definition.direction === 'lower' ? 'Lower personal-best values rank first' : 'Higher personal-best values rank first',
      tieHandling: 'Equal personal-best values share a rank',
      unrankedHandling: 'Athletes without valid results are unranked',
      factors: rankingFactors,
    },
    athletes,
  };
}

describe('performance reports', () => {
  it('uses chronological raw-value geometry and direction-aware PB markers for lower and higher disciplines', async () => {
    const lower = analysis([
      result('late', '2026-03-01', 11.4),
      result('first', '2026-01-01', 12),
      result('middle', '2026-02-01', 11.6),
    ]);
    const higherDefinition = discipline('higher');
    const higher = analysis([
      result('first', '2026-01-01', 5.8, higherDefinition),
      result('middle', '2026-02-01', 5.6, higherDefinition),
      result('late', '2026-03-01', 6.1, higherDefinition),
    ], higherDefinition);

    const lowerModel = performanceChartModel(lower)!;
    const higherModel = performanceChartModel(higher)!;

    expect(lowerModel.points.map((point) => point.result.id)).toEqual(['first', 'middle', 'late']);
    expect(lowerModel.points.map((point) => point.isPb)).toEqual([true, true, true]);
    expect(lowerModel.points[2]!.yRatio).toBeLessThan(lowerModel.points[0]!.yRatio);
    expect(higherModel.points.map((point) => point.isPb)).toEqual([true, false, true]);
    expect(higherModel.points[2]!.yRatio).toBeGreaterThan(higherModel.points[0]!.yRatio);
    expect(athletePerformanceInsights(lower)[0]).toContain('Lower values are better');
    expect(athletePerformanceInsights(higher)[0]).toContain('Higher values are better');
    expect((await athletePerformanceReportPdf({ athleteName: 'Leah Jumper', analysis: higher })).byteLength).toBeGreaterThan(500);
  });

  it('renders no null metric cards and explains insufficient empty normalized history', async () => {
    const empty = analysis([]);

    expect(performanceChartModel(empty)).toBeNull();
    expect(athletePerformanceStats(empty)).toEqual([{ label: 'Normalized results', value: 0 }]);
    expect(athletePerformanceInsights(empty)).toContain('Insufficient data: no normalized 100m history is available for this report.');

    const bytes = await athletePerformanceReportPdf({ athleteName: 'Ari Runner', analysis: empty });
    // The shared Aurora report cover precedes the single content page.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it('safely renders single-point and large-history athlete reports with a chart and multipage table', async () => {
    const one = analysis([result('one', '2026-01-01', 10.9)]);
    expect(performanceChartModel(one)?.points[0]?.xRatio).toBe(0.5);
    expect((await athletePerformanceReportPdf({ athleteName: 'Ari Runner', analysis: one })).byteLength).toBeGreaterThan(500);

    const rows = Array.from({ length: 90 }, (_, index) => result(
      `result-${index}`,
      `2026-01-${String(index % 28 + 1).padStart(2, '0')}`,
      12 - index * 0.01,
    ));
    const many = analysis(rows);
    many.recentResults = rows.map((entry, index) => ({
      ...entry,
      event: { ...entry.event, title: `Intercontinental Championship Final With A Long Event Title ${index + 1}` },
    }));

    const exported = await PDFDocument.load(await athletePerformanceReportPdf({ athleteName: 'Ari Runner', analysis: many }));
    expect(exported.getPageCount()).toBeGreaterThan(1);
  });

  it('creates a PB-only workspace report with descriptive no-score context across multiple pages', async () => {
    const athletes = Array.from({ length: 90 }, (_, index) => {
      const factors = analysis([result(`athlete-${index}`, `2026-02-${String(index % 28 + 1).padStart(2, '0')}`, 11 + index * 0.01)]);
      return {
        athlete: { id: `athlete-${index}`, name: `Athlete ${index + 1}`, status: 'active' as const },
        rank: index + 1,
        factors,
      };
    });
    const cached = workspace(athletes);

    expect(workspaceDisciplineTellMe(cached)).toContain('PB-only ranking');
    expect((await PDFDocument.load(await workspaceDisciplineReportPdf(cached))).getPageCount()).toBeGreaterThan(1);
  });

  it('generates a PDF when athlete and event names include non-ASCII characters', async () => {
    const unicodeResult = {
      ...result('unicode', '2026-03-01', 10.9),
      event: { id: 'event-unicode', title: 'R\u00e9union - S\u00e3o Paulo', date: '2026-03-01', time: null, type: 'competition' as const },
    };

    await expect(athletePerformanceReportPdf({
      athleteName: 'Zo\u00eb Mokoena',
      teamName: '\u00c9lan Track Club',
      analysis: analysis([unicodeResult]),
    })).resolves.toBeInstanceOf(Uint8Array);
  });
});
