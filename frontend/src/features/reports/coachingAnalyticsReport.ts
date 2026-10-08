import type {
  AnalyticsResult,
  AthleteDisciplineAnalysis,
  CoachDateRange,
  CoachInjuryAnalysis,
  CoachInjuryWarning,
  CoachPerformanceAnalysis,
  CoachPerformanceDisciplineAnalysis,
  CoachPerformanceResultPoint,
  CoachRankingEntry,
  CoachRankingsAnalysis,
} from '../../api/analytics';
import {
  drawPerformanceChart,
  formatPerformanceValue,
  performanceDirectionLabel,
} from './performanceReport';
import {
  REPORT_MARGINS,
  createReportDocument,
  drawReportSection,
  drawReportStatCards,
  drawReportTable,
  ensureReportSpace,
  formatReportDate,
  saveReportDocument,
  wrapReportText,
  type ReportDocument,
} from './pdfDocument';
import { rgb } from 'pdf-lib';

const REPORT_COLORS = {
  ink: rgb(0.02, 0.11, 0.18),
  brand: rgb(0, 0.57, 0.74),
};

function signed(value: number): string {
  return value > 0 ? '+' : '';
}

function formatPercent(value: number): string {
  return `${signed(value)}${value.toFixed(2)}%`;
}

function formatScore(value: number | null): string {
  return value === null ? 'Not scored' : `${value.toFixed(2)} / 100`;
}

function dateValue(value: string | null): string {
  return value === null ? 'Not recorded' : formatReportDate(value);
}

function drawParagraph(report: ReportDocument, text: string): void {
  const width = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right;
  for (const line of wrapReportText(report.regular, text, 8.5, width)) {
    ensureReportSpace(report, 12);
    report.page.drawText(line, {
      x: REPORT_MARGINS.left,
      y: report.y,
      size: 8.5,
      font: report.regular,
      color: REPORT_COLORS.ink,
    });
    report.y -= 12;
  }
  report.y -= 4;
}

function drawFactList(report: ReportDocument, facts: readonly string[]): void {
  const width = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right - 14;
  for (const fact of facts) {
    const lines = wrapReportText(report.regular, fact, 8.5, width);
    lines.forEach((line, index) => {
      ensureReportSpace(report, 12);
      if (index === 0) {
        report.page.drawCircle({
          x: REPORT_MARGINS.left + 3,
          y: report.y + 3,
          size: 1.5,
          color: REPORT_COLORS.brand,
        });
      }
      report.page.drawText(line, {
        x: REPORT_MARGINS.left + 11,
        y: report.y,
        size: 8.5,
        font: report.regular,
        color: REPORT_COLORS.ink,
      });
      report.y -= 12;
    });
    report.y -= 2;
  }
}

/** Formats the server's inclusive selected range without inferring any missing dates. */
export function coachDateRangeLabel(range: CoachDateRange): string {
  if (range.dateFrom && range.dateTo) return `${formatReportDate(range.dateFrom)} to ${formatReportDate(range.dateTo)}`;
  if (range.dateFrom) return `From ${formatReportDate(range.dateFrom)}`;
  if (range.dateTo) return `Up to ${formatReportDate(range.dateTo)}`;
  return 'All recorded dates';
}

/** Produces display facts directly from direction-aware performance analytics. */
export function coachPerformanceFacts(analysis: CoachPerformanceDisciplineAnalysis): string[] {
  const { discipline } = analysis;
  const facts = [
    `${analysis.recordCount} valid normalized result${analysis.recordCount === 1 ? '' : 's'} in the selected range.`,
    performanceDirectionLabel(discipline),
  ];

  if (analysis.best.selectedRangeBest !== null) {
    facts.push(`Selected-range best: ${formatPerformanceValue(analysis.best.selectedRangeBest, discipline)}.`);
  }
  if (analysis.first) facts.push(`First selected result: ${formatPerformanceValue(analysis.first.value, discipline)} on ${formatReportDate(analysis.first.date)}.`);
  if (analysis.latest) facts.push(`Latest selected result: ${formatPerformanceValue(analysis.latest.value, discipline)} on ${formatReportDate(analysis.latest.date)}.`);
  if (analysis.improvement !== null) {
    const result = analysis.improvement > 0 ? 'improvement' : analysis.improvement < 0 ? 'decline' : 'no change';
    const percentage = analysis.improvementPercent === null ? '' : ` (${formatPercent(analysis.improvementPercent)})`;
    facts.push(`Direction-aware first-to-latest change: ${signed(analysis.improvement)}${formatPerformanceValue(analysis.improvement, discipline)}${percentage}; ${result}.`);
  }
  if (analysis.recentTrend) {
    const trend = analysis.recentTrend;
    facts.push(`Recent trend: ${trend.direction}; latest ${trend.samplesPerWindow}-result average ${formatPerformanceValue(trend.recentAverage, discipline)} versus ${formatPerformanceValue(trend.previousAverage, discipline)} previously (direction-aware change ${signed(trend.change)}${formatPerformanceValue(trend.change, discipline)}).`);
  }
  if (analysis.consistency) {
    const volatility = analysis.consistency.relativeVolatilityPercent === null
      ? 'relative volatility not available'
      : `relative volatility ${analysis.consistency.relativeVolatilityPercent.toFixed(2)}%`;
    facts.push(`Consistency: standard deviation ${formatPerformanceValue(analysis.consistency.standardDeviation, discipline)} across ${analysis.consistency.sampleCount} results; ${volatility}.`);
  }
  if (analysis.plateau) {
    facts.push(`Plateau assessment: ${analysis.plateau.status}. ${analysis.plateau.reason} Direction-aware change ${signed(analysis.plateau.change)}${formatPerformanceValue(analysis.plateau.change, discipline)} across ${analysis.plateau.samplesPerWindow} results per window.`);
  }
  if (analysis.insufficientDataReason) facts.push(`Data limitation: ${analysis.insufficientDataReason}`);
  return facts;
}

function chartResult(
  athleteId: string,
  discipline: CoachPerformanceDisciplineAnalysis['discipline'],
  point: CoachPerformanceResultPoint,
  index: number,
): AnalyticsResult {
  return {
    id: `${athleteId}-${discipline.code}-${index}`,
    source: 'session_result',
    sourceResultId: point.event.id,
    athleteId,
    discipline,
    event: {
      id: point.event.id,
      title: point.event.title,
      date: point.date,
      time: point.time,
      type: point.event.type,
    },
    value: point.value,
    place: null,
  };
}

function chartAnalysis(athleteId: string, analysis: CoachPerformanceDisciplineAnalysis): AthleteDisciplineAnalysis {
  const history = analysis.history.map((point, index) => chartResult(athleteId, analysis.discipline, point, index));
  return {
    athleteId,
    discipline: analysis.discipline,
    season: analysis.best.season,
    pb: analysis.best.personalBest,
    sb: analysis.best.seasonBest,
    latest: analysis.latest ? chartResult(athleteId, analysis.discipline, analysis.latest, history.length) : null,
    first: analysis.first ? chartResult(athleteId, analysis.discipline, analysis.first, history.length + 1) : null,
    average: null,
    median: null,
    improvement: analysis.improvement,
    recentTrend: analysis.recentTrend,
    resultCount: analysis.recordCount,
    recentResults: history.slice(-8).reverse(),
    history,
  };
}

function performanceResultsTable(report: ReportDocument, analysis: CoachPerformanceDisciplineAnalysis): void {
  if (analysis.history.length === 0) {
    drawParagraph(report, 'No valid normalized results are available in the selected range.');
    return;
  }
  drawReportTable(report, {
    columns: [
      { header: 'Date', flex: 1, value: (point) => formatReportDate(point.date) },
      { header: 'Event', flex: 2.3, value: (point) => point.event.title },
      { header: 'Type', flex: 0.9, value: (point) => point.event.type },
      { header: 'Performance', flex: 1.25, value: (point) => formatPerformanceValue(point.value, analysis.discipline), align: 'right' },
    ],
    rows: analysis.history,
  });
}

/** Creates a multi-athlete, selected-range performance PDF from coach analytics only. */
export async function buildCoachPerformanceReport(analysis: CoachPerformanceAnalysis): Promise<Uint8Array> {
  const disciplineCount = analysis.athletes.reduce((total, entry) => total + entry.disciplines.length, 0);
  const resultCount = analysis.athletes.reduce(
    (total, entry) => total + entry.disciplines.reduce((disciplineTotal, discipline) => disciplineTotal + discipline.recordCount, 0),
    0,
  );
  const report = await createReportDocument({
    title: 'Coaching performance analysis',
    subject: 'Multi-athlete direction-aware performance report from normalized analytics.',
    metadata: [
      { label: 'Selected date range', value: coachDateRangeLabel(analysis.selectedRange) },
      { label: 'Lifecycle filter', value: analysis.lifecycleStatus },
    ],
  });

  drawReportStatCards(report, [
    { label: 'Athletes analysed', value: analysis.athletes.length },
    { label: 'Discipline analyses', value: disciplineCount },
    { label: 'Selected results', value: resultCount },
  ]);
  drawReportSection(report, 'Scope');
  drawParagraph(report, 'All figures and charts use server-returned normalized results within the selected date range. Positive directional change means improvement for the discipline; chart axes retain the original raw measurement values.');

  for (const entry of analysis.athletes) {
    drawReportSection(report, `${entry.athlete.name} (${entry.athlete.status})`);
    if (entry.disciplines.length === 0) {
      drawParagraph(report, 'No discipline with normalized results is available for this athlete under the selected filters.');
      continue;
    }

    for (const discipline of entry.disciplines) {
      drawReportSection(report, `${discipline.discipline.label} performance`);
      drawReportStatCards(report, [
        { label: 'Selected results', value: discipline.recordCount },
        { label: 'Selected-range best', value: discipline.best.selectedRangeBest === null ? 'Not recorded' : formatPerformanceValue(discipline.best.selectedRangeBest, discipline.discipline) },
        { label: 'Directional change', value: discipline.improvement === null ? 'Not available' : `${signed(discipline.improvement)}${formatPerformanceValue(discipline.improvement, discipline.discipline)}` },
      ]);
      drawFactList(report, coachPerformanceFacts(discipline));
      drawReportSection(report, 'Selected normalized performance history');
      drawPerformanceChart(report, chartAnalysis(entry.athlete.id, discipline));
      drawReportSection(report, 'Selected normalized results');
      performanceResultsTable(report, discipline);
    }
  }
  return saveReportDocument(report);
}

/** Returns the exact warning codes supplied by the server without medical interpretation. */
export function coachInjuryWarningReasons(warning: CoachInjuryWarning): string {
  return warning.reasons.join(', ');
}

/** Creates a non-diagnostic injury-monitoring PDF using only analytics-safe injury fields. */
export async function buildCoachInjuryMonitoringReport(analysis: CoachInjuryAnalysis): Promise<Uint8Array> {
  const injuryCount = analysis.athletes.reduce((total, entry) => total + entry.injuryCount, 0);
  const activeInjuryCount = analysis.athletes.reduce((total, entry) => total + entry.activeInjuryCount, 0);
  const report = await createReportDocument({
    title: 'Injury-monitoring analysis',
    subject: 'Non-diagnostic summary of recorded injury indicators.',
    metadata: [
      { label: 'Selected date range', value: coachDateRangeLabel(analysis.selectedRange) },
      { label: 'Lifecycle filter', value: analysis.lifecycleStatus },
    ],
  });

  drawReportStatCards(report, [
    { label: 'Athletes monitored', value: analysis.athletes.length },
    { label: 'Recorded injuries', value: injuryCount },
    { label: 'Active recorded injuries', value: activeInjuryCount },
  ]);
  drawReportSection(report, 'Non-medical limitations');
  drawFactList(report, analysis.limitations);
  drawParagraph(report, 'Warning levels and reason codes are recorded-data indicators returned by the server. They do not provide a medical assessment.');
  drawReportSection(report, 'Monitoring summary');
  drawReportTable(report, {
    columns: [
      { header: 'Athlete', flex: 1.35, value: (entry) => entry.athlete.name },
      { header: 'Status', flex: 0.75, value: (entry) => entry.athlete.status },
      { header: 'Indicator level', flex: 0.95, value: (entry) => entry.warning.level },
      { header: 'Server warning reasons', flex: 2.25, value: (entry) => coachInjuryWarningReasons(entry.warning) },
      { header: 'Recorded', flex: 0.65, value: (entry) => entry.injuryCount, align: 'center' },
      { header: 'Active', flex: 0.55, value: (entry) => entry.activeInjuryCount, align: 'center' },
    ],
    rows: analysis.athletes,
  });

  for (const entry of analysis.athletes) {
    drawReportSection(report, `${entry.athlete.name} recorded injury entries`);
    drawFactList(report, [
      `Indicator level: ${entry.warning.level}. Server warning reasons: ${coachInjuryWarningReasons(entry.warning)}.`,
      entry.mostCommonRecordedArea === null
        ? 'No recorded injury area is available in the selected range.'
        : `Most common recorded area: ${entry.mostCommonRecordedArea.bodyRegion} - ${entry.mostCommonRecordedArea.area} (${entry.mostCommonRecordedArea.count} recorded entries).`,
      ...(entry.repeatedInjuries.length === 0
        ? []
        : entry.repeatedInjuries.map((injury) => `Repeated recorded area: ${injury.bodyRegion} - ${injury.area} (${injury.side}), ${injury.count} entries.`)),
    ]);
    if (entry.history.length === 0) {
      drawParagraph(report, 'No recorded injury entries are available in the selected range.');
      continue;
    }
    drawReportTable(report, {
      columns: [
        { header: 'Occurrence', flex: 0.95, value: (injury) => dateValue(injury.occurrenceDate) },
        { header: 'Body region', flex: 0.9, value: (injury) => injury.bodyRegion },
        { header: 'Area', flex: 1.05, value: (injury) => injury.area },
        { header: 'Side', flex: 0.6, value: (injury) => injury.side },
        { header: 'Severity', flex: 0.7, value: (injury) => injury.severity },
        { header: 'Status', flex: 0.65, value: (injury) => injury.active ? 'Active' : 'Resolved' },
        { header: 'Expected return', flex: 0.95, value: (injury) => dateValue(injury.expectedReturnDate) },
        { header: 'Resolved', flex: 0.85, value: (injury) => dateValue(injury.resolvedDate) },
      ],
      rows: entry.history,
    });
  }
  return saveReportDocument(report);
}

function rankingFactorText(entry: CoachRankingEntry, factor: 'standing' | 'improvementPercent' | 'consistency' | 'resultCount', analysis: CoachRankingsAnalysis): string {
  if (factor === 'standing') {
    const standing = entry.factors.standing;
    if (standing.personalBest === null) return formatScore(standing.score);
    const current = standing.current === null ? '' : `; latest ${formatPerformanceValue(standing.current, analysis.discipline)}`;
    const rank = standing.standingRank === null ? '' : `; standing ${standing.standingRank}`;
    return `PB ${formatPerformanceValue(standing.personalBest, analysis.discipline)}${current}${rank}; ${formatScore(standing.score)}`;
  }
  if (factor === 'improvementPercent') {
    const improvement = entry.factors.improvementPercent;
    return improvement.value === null ? formatScore(improvement.score) : `${formatPercent(improvement.value)}; ${formatScore(improvement.score)}`;
  }
  if (factor === 'consistency') {
    const consistency = entry.factors.consistency;
    if (consistency.value === null) return formatScore(consistency.score);
    const volatility = consistency.value.relativeVolatilityPercent === null ? 'volatility unavailable' : `volatility ${consistency.value.relativeVolatilityPercent.toFixed(2)}%`;
    return `${volatility}; ${formatScore(consistency.score)}`;
  }
  const resultCount = entry.factors.resultCount;
  return resultCount.value === null ? formatScore(resultCount.score) : `${resultCount.value} results; ${formatScore(resultCount.score)}`;
}

/** Documents the exact deterministic scoring method returned with a ranking analysis. */
export function coachRankingMethodology(analysis: CoachRankingsAnalysis): string[] {
  const { weights } = analysis.scoring;
  return [
    performanceDirectionLabel(analysis.discipline),
    `Deterministic factor weights: standing ${(weights.standing * 100).toFixed(0)}%, improvement percentage ${(weights.improvementPercent * 100).toFixed(0)}%, consistency ${(weights.consistency * 100).toFixed(0)}%, result count ${(weights.resultCount * 100).toFixed(0)}%.`,
    analysis.scoring.missingFactorHandling,
    analysis.scoring.ordering,
    'Included factor scores are 0-100 relative values within the selected athlete group. The composite is the weighted score of included factors only; omitted factors are not treated as zero.',
  ];
}

function omittedRankingFactors(analysis: CoachRankingsAnalysis): Array<{ athlete: string; factor: string; reason: string }> {
  const rows: Array<{ athlete: string; factor: string; reason: string }> = [];
  for (const entry of analysis.athletes) {
    const factors = [
      { label: 'Standing', factor: entry.factors.standing },
      { label: 'Improvement percentage', factor: entry.factors.improvementPercent },
      { label: 'Consistency', factor: entry.factors.consistency },
      { label: 'Result count', factor: entry.factors.resultCount },
    ];
    for (const { label, factor } of factors) {
      if (!factor.includedInScore && factor.insufficientDataReason) {
        rows.push({ athlete: entry.athlete.name, factor: label, reason: factor.insufficientDataReason });
      }
    }
  }
  return rows;
}

/** Creates a discipline-specific promising-athlete ranking PDF from deterministic server scores. */
export async function buildCoachRankingsReport(analysis: CoachRankingsAnalysis): Promise<Uint8Array> {
  const scoredCount = analysis.athletes.filter((entry) => entry.score !== null).length;
  const report = await createReportDocument({
    title: `${analysis.discipline.label} promising-athlete ranking`,
    subject: 'Discipline-specific deterministic promising-athlete ranking analysis.',
    metadata: [
      { label: 'Discipline', value: analysis.discipline.label },
      { label: 'Selected date range', value: coachDateRangeLabel(analysis.selectedRange) },
      { label: 'Lifecycle filter', value: analysis.lifecycleStatus },
      { label: 'Requested limit', value: String(analysis.limit) },
    ],
  });

  drawReportStatCards(report, [
    { label: 'Returned athletes', value: analysis.athletes.length },
    { label: 'Scored athletes', value: scoredCount },
    { label: 'Unscored athletes', value: analysis.athletes.length - scoredCount },
  ]);
  drawReportSection(report, 'Deterministic methodology');
  drawFactList(report, coachRankingMethodology(analysis));
  drawReportSection(report, 'Promising-athlete ranking');
  if (analysis.athletes.length === 0) {
    drawParagraph(report, 'No athletes were returned for this discipline and selected filters.');
  } else {
    drawReportTable(report, {
      columns: [
        { header: 'Rank', flex: 0.5, value: (entry) => entry.rank === null ? 'Unranked' : entry.rank, align: 'center' },
        { header: 'Athlete', flex: 1.15, value: (entry) => entry.athlete.name },
        { header: 'Composite score', flex: 0.9, value: (entry) => formatScore(entry.score), align: 'right' },
        { header: 'Standing PB / score', flex: 1.7, value: (entry) => rankingFactorText(entry, 'standing', analysis) },
        { header: 'Improvement / score', flex: 1.15, value: (entry) => rankingFactorText(entry, 'improvementPercent', analysis) },
        { header: 'Consistency / score', flex: 1.35, value: (entry) => rankingFactorText(entry, 'consistency', analysis) },
        { header: 'Results / score', flex: 0.9, value: (entry) => rankingFactorText(entry, 'resultCount', analysis) },
      ],
      rows: analysis.athletes,
    });
  }

  const omissions = omittedRankingFactors(analysis);
  if (omissions.length > 0) {
    drawReportSection(report, 'Omitted factors and data limitations');
    drawParagraph(report, 'These factors were excluded from the affected composite score for the server-provided reason below.');
    drawReportTable(report, {
      columns: [
        { header: 'Athlete', flex: 1.2, value: (row) => row.athlete },
        { header: 'Factor', flex: 1.15, value: (row) => row.factor },
        { header: 'Server reason', flex: 3.4, value: (row) => row.reason },
      ],
      rows: omissions,
    });
  }
  return saveReportDocument(report);
}

export const coachPerformanceReportPdf = buildCoachPerformanceReport;
export const coachInjuryMonitoringReportPdf = buildCoachInjuryMonitoringReport;
export const coachRankingsReportPdf = buildCoachRankingsReport;
