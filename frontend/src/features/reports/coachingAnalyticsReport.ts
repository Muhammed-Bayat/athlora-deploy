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
  REPORT_AURORA_COLORS,
  createReportDocument,
  drawReportSection,
  drawReportStatCards,
  drawReportTable,
  ensureReportSpace,
  formatReportDate,
  saveReportDocument,
  safeReportText,
  wrapReportText,
  type ReportDocument,
} from './pdfDocument';
import { rgb } from 'pdf-lib';

const REPORT_COLORS = {
  ink: REPORT_AURORA_COLORS.ink,
  brand: REPORT_AURORA_COLORS.brand,
};

const COMPARISON_SERIES_COLORS = [
  REPORT_AURORA_COLORS.cyan,
  REPORT_AURORA_COLORS.blue,
  REPORT_AURORA_COLORS.violet,
  rgb(0.02, 0.62, 0.45),
  rgb(0.9, 0.42, 0.12),
  rgb(0.78, 0.2, 0.52),
  rgb(0.52, 0.45, 0.08),
  rgb(0.08, 0.48, 0.58),
] as const;

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

function drawCenteredReportText(report: ReportDocument, text: string, x: number, y: number, size: number, color: ReturnType<typeof rgb>): void {
  const safeText = safeReportText(text);
  report.page.drawText(safeText, { x: x - report.regular.widthOfTextAtSize(safeText, size) / 2, y, size, font: report.regular, color });
}

/** Draws an honest same-discipline comparison only; incompatible units never share an axis. */
function drawCoachComparisonChart(report: ReportDocument, analysis: CoachPerformanceAnalysis, disciplineCode: string): boolean {
  const rows = analysis.athletes.flatMap((entry) => {
    const discipline = entry.disciplines.find((candidate) => candidate.discipline.code === disciplineCode);
    return discipline && discipline.history.length > 0 ? [{ athlete: entry.athlete, discipline }] : [];
  });
  if (rows.length === 0 || rows.length > 8) return false;

  const discipline = rows[0]!.discipline.discipline;
  const points = rows.flatMap((row) => row.discipline.history.map((point) => ({ ...point, athlete: row.athlete })));
  const values = points.map((point) => point.value);
  const timestamps = points.map((point) => Date.parse(`${point.date}T00:00:00.000Z`));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const minimumPadding = discipline.unit === 'seconds' ? 0.05 : discipline.unit === 'metres' ? 0.1 : 5;
  const padding = Math.max((maximum - minimum) * 0.12, minimumPadding);
  const axisMinimum = Math.max(0, minimum - padding);
  const axisMaximum = maximum + padding;
  const axisRange = Math.max(axisMaximum - axisMinimum, Number.EPSILON);
  const earliest = Math.min(...timestamps);
  const latest = Math.max(...timestamps);

  const height = 246;
  ensureReportSpace(report, height + 12);
  const width = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right;
  const top = report.y;
  const bottom = top - height;
  const plot = { left: REPORT_MARGINS.left + 54, right: REPORT_MARGINS.left + width - 10, top: top - 40, bottom: bottom + 42 };
  const x = (date: string) => plot.left + (Date.parse(`${date}T00:00:00.000Z`) - earliest) / Math.max(latest - earliest, 1) * (plot.right - plot.left);
  const y = (value: number) => plot.bottom + (value - axisMinimum) / axisRange * (plot.top - plot.bottom);
  const unit = discipline.unit === 'seconds' ? 's' : discipline.unit === 'metres' ? 'm' : 'cm';

  report.page.drawText(`${discipline.label} comparison | raw performance (${unit})`, { x: REPORT_MARGINS.left, y: top - 8, size: 8, font: report.bold, color: REPORT_COLORS.ink });
  report.page.drawText(discipline.direction === 'lower' ? 'Lower values are better' : 'Higher values are better', { x: plot.right - report.regular.widthOfTextAtSize(discipline.direction === 'lower' ? 'Lower values are better' : 'Higher values are better', 7), y: top - 8, size: 7, font: report.regular, color: REPORT_AURORA_COLORS.muted });
  Array.from({ length: 5 }, (_, index) => axisMinimum + index / 4 * axisRange).forEach((tick) => {
    const tickY = y(tick);
    report.page.drawLine({ start: { x: plot.left, y: tickY }, end: { x: plot.right, y: tickY }, thickness: 0.4, color: REPORT_AURORA_COLORS.line });
    const label = formatPerformanceValue(tick, discipline);
    report.page.drawText(label, { x: plot.left - 7 - report.regular.widthOfTextAtSize(label, 6.5), y: tickY - 2.5, size: 6.5, font: report.regular, color: REPORT_AURORA_COLORS.muted });
  });
  report.page.drawLine({ start: { x: plot.left, y: plot.bottom }, end: { x: plot.right, y: plot.bottom }, thickness: 0.7, color: REPORT_AURORA_COLORS.muted });
  report.page.drawLine({ start: { x: plot.left, y: plot.bottom }, end: { x: plot.left, y: plot.top }, thickness: 0.7, color: REPORT_AURORA_COLORS.muted });
  rows.forEach((row, index) => {
    const color = COMPARISON_SERIES_COLORS[index % COMPARISON_SERIES_COLORS.length]!;
    const history = row.discipline.history;
    for (let pointIndex = 1; pointIndex < history.length; pointIndex += 1) {
      report.page.drawLine({ start: { x: x(history[pointIndex - 1]!.date), y: y(history[pointIndex - 1]!.value) }, end: { x: x(history[pointIndex]!.date), y: y(history[pointIndex]!.value) }, thickness: 1.7, color });
    }
    history.forEach((point) => report.page.drawCircle({ x: x(point.date), y: y(point.value), size: 2.8, color, borderColor: REPORT_AURORA_COLORS.white, borderWidth: 0.7 }));
    const legendY = top - 22 - Math.floor(index / 3) * 11;
    const legendX = REPORT_MARGINS.left + index % 3 * (width / 3);
    report.page.drawLine({ start: { x: legendX, y: legendY + 3 }, end: { x: legendX + 12, y: legendY + 3 }, thickness: 2, color });
    const label = safeReportText(row.athlete.name);
    report.page.drawText(label, { x: legendX + 16, y: legendY, size: 6.6, font: report.regular, color: REPORT_AURORA_COLORS.ink });
  });
  [earliest, earliest + (latest - earliest) / 2, latest].forEach((timestamp, index) => {
    const xPosition = plot.left + index / 2 * (plot.right - plot.left);
    drawCenteredReportText(report, formatReportDate(new Date(timestamp)), xPosition, bottom + 21, 6.5, REPORT_AURORA_COLORS.muted);
  });
  drawCenteredReportText(report, 'Performance date', (plot.left + plot.right) / 2, bottom + 8, 7, REPORT_AURORA_COLORS.muted);
  report.y = bottom - 8;
  return true;
}

function comparisonDisciplineCodes(analysis: CoachPerformanceAnalysis): string[] {
  const counts = new Map<string, number>();
  for (const entry of analysis.athletes) {
    for (const discipline of entry.disciplines) {
      if (discipline.history.length > 0) counts.set(discipline.discipline.code, (counts.get(discipline.discipline.code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 1 && count <= 8)
    .map(([code]) => code)
    .sort();
}

/** Creates a multi-athlete, selected-range performance PDF from coach analytics only. */
export async function buildCoachPerformanceReport(analysis: CoachPerformanceAnalysis, injuryAnalysis?: CoachInjuryAnalysis): Promise<Uint8Array> {
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

  drawReportSection(report, 'Descriptive relative-improvement ranking');
  drawParagraph(report, analysis.comparison.relativeImprovementRanking.methodology);
  drawParagraph(report, analysis.comparison.relativeImprovementRanking.eligibility);
  const relativeRanking = analysis.comparison.relativeImprovementRanking;
  if (relativeRanking.entries.length === 0) {
    drawParagraph(report, relativeRanking.insufficientDataReason ?? 'No eligible athletes are available for descriptive relative-improvement ranking.');
  } else {
    drawReportTable(report, {
      columns: [
        { header: 'Rank', flex: 0.45, value: (entry) => entry.rank, align: 'center' },
        { header: 'Athlete', flex: 1.3, value: (entry) => entry.athlete.name },
        { header: 'Discipline', flex: 1, value: (entry) => entry.discipline.label },
        { header: 'First', flex: 1, value: (entry) => formatPerformanceValue(entry.first.value, entry.discipline), align: 'right' },
        { header: 'Latest', flex: 1, value: (entry) => formatPerformanceValue(entry.latest.value, entry.discipline), align: 'right' },
        { header: 'Directional change', flex: 1.25, value: (entry) => `${signed(entry.improvement)}${formatPerformanceValue(entry.improvement, entry.discipline)}`, align: 'right' },
        { header: 'Relative change', flex: 1.05, value: (entry) => formatPercent(entry.improvementPercent), align: 'right' },
        { header: 'Results', flex: 0.65, value: (entry) => entry.recordCount, align: 'center' },
      ],
      rows: relativeRanking.entries,
    });
  }

  const sharedDisciplines = comparisonDisciplineCodes(analysis);
  if (sharedDisciplines.length > 0) {
    drawReportSection(report, 'Same-discipline performance comparison charts');
    drawParagraph(report, 'Each chart uses one discipline and its original unit only. Lines connect recorded performance dates without fabricating missing results.');
    for (const disciplineCode of sharedDisciplines) drawCoachComparisonChart(report, analysis, disciplineCode);
  }

  if (injuryAnalysis) {
    drawReportSection(report, 'Recorded injury-monitoring context');
    drawParagraph(report, 'These monitoring-only indicators apply to the same selected comparison cohort and are not medical assessments or readiness recommendations.');
    drawReportTable(report, {
      columns: [
        { header: 'Athlete', flex: 1.25, value: (entry) => entry.athlete.name },
        { header: 'Indicator level', flex: 0.85, value: (entry) => entry.warning.level },
        { header: 'Server warning reasons', flex: 2.15, value: (entry) => coachInjuryWarningReasons(entry.warning) },
        { header: 'Recorded', flex: 0.65, value: (entry) => entry.injuryCount, align: 'center' },
        { header: 'Active', flex: 0.55, value: (entry) => entry.activeInjuryCount, align: 'center' },
      ],
      rows: injuryAnalysis.athletes,
    });
    drawFactList(report, injuryAnalysis.limitations);
  }

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
      ensureReportSpace(report, discipline.history.length === 0 ? 50 : 120);
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
