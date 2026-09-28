import { rgb, type PDFPage } from 'pdf-lib';
import type { AnalyticsDiscipline, AnalyticsResult, AthleteDisciplineAnalysis, WorkspaceDisciplineAnalysis } from '../../api/analytics';
import {
  REPORT_MARGINS,
  createReportDocument,
  drawReportSection,
  drawReportStatCards,
  drawReportTable,
  ensureReportSpace,
  formatReportDate,
  safeReportText,
  saveReportDocument,
  wrapReportText,
  type ReportDocument,
  type ReportStatCard,
} from './pdfDocument';

const CHART_HEIGHT = 248;
const CHART_COLORS = {
  ink: rgb(0.02, 0.11, 0.18),
  muted: rgb(0.29, 0.39, 0.44),
  brand: rgb(0, 0.57, 0.74),
  line: rgb(0.79, 0.88, 0.91),
  mist: rgb(0.94, 0.98, 0.99),
  pb: rgb(0.85, 0.32, 0.15),
  white: rgb(1, 1, 1),
};

export interface AthletePerformanceReportOptions {
  athleteName: string;
  analysis: AthleteDisciplineAnalysis;
  teamName?: string;
}

export interface PerformanceChartPoint {
  result: AnalyticsResult;
  dateLabel: string;
  xRatio: number;
  yRatio: number;
  isPb: boolean;
}

export interface PerformanceChartModel {
  axis: { min: number; max: number; ticks: number[]; unitLabel: string };
  points: PerformanceChartPoint[];
  dateLabelIndexes: number[];
}

type PerformanceMetricKey = 'pb' | 'sb' | 'average' | 'median' | 'improvement';

function unitLabel(unit: AnalyticsDiscipline['unit']): string {
  return unit === 'seconds' ? 's' : unit === 'metres' ? 'm' : 'cm';
}

function seasonLabel(selected: AthleteDisciplineAnalysis['season']['selected']): string {
  return selected === 'all' ? 'All-time' : String(selected);
}

function metricLabel(metric: PerformanceMetricKey): string {
  return ({ pb: 'Personal best', sb: 'Season best', average: 'Average', median: 'Median', improvement: 'Improvement' })[metric];
}

function resultTimestamp(result: AnalyticsResult): number {
  const time = new Date(`${result.event.date}T${result.event.time ?? '00:00:00'}Z`).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isBetter(value: number, current: number | null, direction: AnalyticsDiscipline['direction']): boolean {
  return current === null || (direction === 'lower' ? value < current : value > current);
}

function finiteHistory(analysis: AthleteDisciplineAnalysis): AnalyticsResult[] {
  return analysis.history
    .filter((result) => Number.isFinite(result.value))
    .map((result, index) => ({ result, index }))
    .sort((left, right) => resultTimestamp(left.result) - resultTimestamp(right.result) || left.index - right.index)
    .map(({ result }) => result);
}

function axisPadding(values: number[], unit: AnalyticsDiscipline['unit']): number {
  const span = Math.max(...values) - Math.min(...values);
  const minimum = unit === 'seconds' ? 0.05 : unit === 'metres' ? 0.1 : 5;
  return Math.max(span * 0.1, minimum);
}

function abbreviated(text: string, maximum: number): string {
  return text.length <= maximum ? text : `${text.slice(0, Math.max(1, maximum - 3)).trimEnd()}...`;
}

function signed(value: number): string {
  return value > 0 ? '+' : '';
}

export function formatPerformanceValue(value: number, discipline: Pick<AnalyticsDiscipline, 'precision' | 'unit'>): string {
  return `${value.toFixed(discipline.precision)} ${unitLabel(discipline.unit)}`;
}

export function performanceDirectionLabel(discipline: Pick<AnalyticsDiscipline, 'direction'>): string {
  return discipline.direction === 'lower' ? 'Lower values are better' : 'Higher values are better';
}

/** Returns the unmodified raw-value geometry used by the direct-PDF chart. */
export function performanceChartModel(analysis: AthleteDisciplineAnalysis): PerformanceChartModel | null {
  const history = finiteHistory(analysis);
  if (history.length === 0) return null;

  const values = history.map((result) => result.value);
  const padding = axisPadding(values, analysis.discipline.unit);
  const minimum = Math.max(0, Math.min(...values) - padding);
  const maximum = Math.max(...values) + padding;
  const range = Math.max(maximum - minimum, Number.EPSILON);
  const times = history.map(resultTimestamp);
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  const sameTimestamp = earliest === latest;
  let best: number | null = null;

  const points = history.map((result, index) => {
    const isPb = isBetter(result.value, best, analysis.discipline.direction);
    if (isPb) best = result.value;
    const xRatio = history.length === 1 ? 0.5 : sameTimestamp
      ? index / (history.length - 1)
      : (times[index]! - earliest) / (latest - earliest);
    return {
      result,
      dateLabel: formatReportDate(result.event.date),
      xRatio,
      // Direction changes the interpretation, never the raw value plotted on this axis.
      yRatio: (result.value - minimum) / range,
      isPb,
    };
  });
  const labels = points.length <= 5
    ? points.map((_, index) => index)
    : Array.from(new Set([0, Math.round((points.length - 1) * 0.25), Math.round((points.length - 1) * 0.5), Math.round((points.length - 1) * 0.75), points.length - 1]));

  return {
    axis: {
      min: minimum,
      max: maximum,
      ticks: Array.from({ length: 5 }, (_, index) => minimum + (maximum - minimum) * index / 4),
      unitLabel: unitLabel(analysis.discipline.unit),
    },
    points,
    dateLabelIndexes: labels,
  };
}

export function athletePerformanceStats(analysis: AthleteDisciplineAnalysis): ReportStatCard[] {
  const stats: ReportStatCard[] = [{ label: 'Normalized results', value: analysis.resultCount }];
  (['pb', 'sb', 'average', 'median'] as const).forEach((metric) => {
    const value = analysis[metric];
    if (value !== null) stats.push({ label: metricLabel(metric), value: formatPerformanceValue(value, analysis.discipline) });
  });
  if (analysis.latest) stats.push({ label: 'Latest result', value: formatPerformanceValue(analysis.latest.value, analysis.discipline) });
  if (analysis.improvement !== null) {
    stats.push({ label: 'Directional change', value: `${signed(analysis.improvement)}${formatPerformanceValue(analysis.improvement, analysis.discipline)}` });
  }
  return stats;
}

export function athletePerformanceInsights(analysis: AthleteDisciplineAnalysis): string[] {
  const { discipline } = analysis;
  const history = finiteHistory(analysis);
  const insights = [`${performanceDirectionLabel(discipline)} for ${discipline.label}; all chart values remain raw ${unitLabel(discipline.unit)} measurements.`];
  if (history.length === 0) {
    insights.push(`Insufficient data: no normalized ${discipline.label} history is available for this report.`);
    return insights;
  }

  insights.push(`${history.length} normalized result${history.length === 1 ? '' : 's'} are shown chronologically.`);
  if (analysis.pb !== null) insights.push(`Personal best: ${formatPerformanceValue(analysis.pb, discipline)}.`);
  if (analysis.improvement !== null) {
    const change = formatPerformanceValue(Math.abs(analysis.improvement), discipline);
    insights.push(`First-to-latest directional change: ${change} ${analysis.improvement > 0 ? 'improvement' : analysis.improvement < 0 ? 'decline' : 'with no change'}.`);
  }
  if (analysis.recentTrend) {
    insights.push(`Recent trend: ${analysis.recentTrend.direction}; the latest ${analysis.recentTrend.samplesPerWindow} result${analysis.recentTrend.samplesPerWindow === 1 ? '' : 's'} average ${formatPerformanceValue(analysis.recentTrend.recentAverage, discipline)} versus ${formatPerformanceValue(analysis.recentTrend.previousAverage, discipline)} previously.`);
  }
  return insights;
}

export function athleteAnalysisTellMe(athleteName: string, analysis: AthleteDisciplineAnalysis): string {
  const history = finiteHistory(analysis);
  const value = analysis.pb === null ? 'No personal best is recorded.' : `Personal best ${formatPerformanceValue(analysis.pb, analysis.discipline)}.`;
  return `${athleteName}'s ${analysis.discipline.label} analysis for ${seasonLabel(analysis.season.selected)}: ${history.length} normalized result${history.length === 1 ? '' : 's'}. ${performanceDirectionLabel(analysis.discipline)}. ${value}`;
}

function drawParagraph(report: ReportDocument, text: string): void {
  const width = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right;
  for (const line of wrapReportText(report.regular, text, 8.5, width)) {
    ensureReportSpace(report, 12);
    report.page.drawText(line, { x: REPORT_MARGINS.left, y: report.y, size: 8.5, font: report.regular, color: CHART_COLORS.ink });
    report.y -= 12;
  }
  report.y -= 5;
}

function drawInsightList(report: ReportDocument, insights: string[]): void {
  const width = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right - 14;
  insights.forEach((insight) => {
    const lines = wrapReportText(report.regular, insight, 8.5, width);
    lines.forEach((line, index) => {
      ensureReportSpace(report, 12);
      if (index === 0) report.page.drawCircle({ x: REPORT_MARGINS.left + 3, y: report.y + 3, size: 1.5, color: CHART_COLORS.brand });
      report.page.drawText(line, { x: REPORT_MARGINS.left + 11, y: report.y, size: 8.5, font: report.regular, color: CHART_COLORS.ink });
      report.y -= 12;
    });
    report.y -= 2;
  });
}

function drawCenteredText(page: PDFPage, report: ReportDocument, text: string, x: number, y: number, size: number, color: ReturnType<typeof rgb>): void {
  const safeText = safeReportText(text);
  page.drawText(safeText, { x: x - report.regular.widthOfTextAtSize(safeText, size) / 2, y, size, font: report.regular, color });
}

/** Draws a fixed-height chart from the normalized history without changing raw values. */
export function drawPerformanceChart(report: ReportDocument, analysis: AthleteDisciplineAnalysis): void {
  const model = performanceChartModel(analysis);
  ensureReportSpace(report, CHART_HEIGHT + 8);
  const page = report.page;
  const width = page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right;
  const top = report.y;
  const bottom = top - CHART_HEIGHT;

  if (!model) {
    page.drawRectangle({ x: REPORT_MARGINS.left, y: bottom + 42, width, height: 112, color: CHART_COLORS.mist, borderColor: CHART_COLORS.line, borderWidth: 0.5 });
    page.drawText('Insufficient data', { x: REPORT_MARGINS.left + 16, y: bottom + 112, size: 11, font: report.bold, color: CHART_COLORS.ink });
    drawParagraphAt(page, report, `No normalized ${analysis.discipline.label} history is available to chart.`, REPORT_MARGINS.left + 16, bottom + 91, width - 32);
    report.y = bottom - 8;
    return;
  }

  const plot = { left: REPORT_MARGINS.left + 50, right: REPORT_MARGINS.left + width - 10, bottom: bottom + 47, top: top - 28 };
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.top - plot.bottom;
  page.drawText(`Raw performance (${model.axis.unitLabel})`, { x: REPORT_MARGINS.left, y: top - 8, size: 7.5, font: report.bold, color: CHART_COLORS.muted });
  page.drawText('PB markers show directional personal-best milestones', { x: REPORT_MARGINS.left + width - report.regular.widthOfTextAtSize('PB markers show directional personal-best milestones', 7), y: top - 8, size: 7, font: report.regular, color: CHART_COLORS.muted });

  model.axis.ticks.forEach((tick) => {
    const ratio = (tick - model.axis.min) / Math.max(model.axis.max - model.axis.min, Number.EPSILON);
    const y = plot.bottom + ratio * plotHeight;
    page.drawLine({ start: { x: plot.left, y }, end: { x: plot.right, y }, thickness: 0.4, color: CHART_COLORS.line });
    const label = formatPerformanceValue(tick, analysis.discipline);
    page.drawText(label, { x: plot.left - 7 - report.regular.widthOfTextAtSize(label, 6.5), y: y - 2.5, size: 6.5, font: report.regular, color: CHART_COLORS.muted });
  });
  page.drawLine({ start: { x: plot.left, y: plot.bottom }, end: { x: plot.left, y: plot.top }, thickness: 0.7, color: CHART_COLORS.muted });
  page.drawLine({ start: { x: plot.left, y: plot.bottom }, end: { x: plot.right, y: plot.bottom }, thickness: 0.7, color: CHART_COLORS.muted });

  const points = model.points.map((point) => ({ ...point, x: plot.left + point.xRatio * plotWidth, y: plot.bottom + point.yRatio * plotHeight }));
  if (points.length > 1) {
    for (let index = 1; index < points.length; index += 1) {
      page.drawLine({ start: points[index - 1]!, end: points[index]!, thickness: 1.4, color: CHART_COLORS.brand });
    }
  }
  points.forEach((point) => {
    page.drawCircle({ x: point.x, y: point.y, size: point.isPb ? 4.2 : 2.8, color: point.isPb ? CHART_COLORS.pb : CHART_COLORS.brand, borderColor: CHART_COLORS.white, borderWidth: 0.8 });
    if (point.isPb) page.drawText('PB', { x: point.x + 5, y: Math.min(plot.top - 2, point.y + 5), size: 6.5, font: report.bold, color: CHART_COLORS.pb });
  });
  model.dateLabelIndexes.forEach((index) => {
    const point = points[index]!;
    drawCenteredText(page, report, point.dateLabel, point.x, plot.bottom - 12, 6.5, CHART_COLORS.muted);
  });

  const annotated = (points.length <= 4 ? points : points.filter((point) => point.isPb).slice(-4));
  annotated.forEach((point, index) => {
    const label = abbreviated(point.result.event.title, 28);
    const y = Math.max(plot.bottom + 8, Math.min(plot.top - 13 - (index % 2) * 9, point.y + 12 + (index % 2) * 9));
    drawCenteredText(page, report, label, point.x, y, 6.2, CHART_COLORS.muted);
  });
  drawCenteredText(page, report, 'Event date', (plot.left + plot.right) / 2, bottom + 14, 7, CHART_COLORS.muted);
  report.y = bottom - 8;
}

function drawParagraphAt(page: PDFPage, report: ReportDocument, text: string, x: number, y: number, width: number): void {
  wrapReportText(report.regular, text, 8.5, width).slice(0, 2).forEach((line, index) => {
    page.drawText(line, { x, y: y - index * 12, size: 8.5, font: report.regular, color: CHART_COLORS.ink });
  });
}

function recentResults(analysis: AthleteDisciplineAnalysis): AnalyticsResult[] {
  return analysis.recentResults.length > 0 ? analysis.recentResults : finiteHistory(analysis).slice(-8).reverse();
}

function recentResultsHavePlacings(rows: readonly AnalyticsResult[]): boolean {
  return rows.some((result) => result.place !== null);
}

export async function buildAthletePerformanceReport({ athleteName, analysis, teamName }: AthletePerformanceReportOptions): Promise<Uint8Array> {
  const report = await createReportDocument({
    title: `${athleteName} | ${analysis.discipline.label} performance`,
    subject: `${athleteName}'s normalized ${analysis.discipline.label} performance report.`,
    metadata: [
      { label: 'Athlete', value: athleteName },
      { label: 'Discipline', value: `${analysis.discipline.label} (${unitLabel(analysis.discipline.unit)})` },
      ...(teamName ? [{ label: 'Club', value: teamName }] : []),
      { label: 'Season', value: seasonLabel(analysis.season.selected) },
      { label: 'Direction', value: performanceDirectionLabel(analysis.discipline) },
    ],
  });

  drawReportStatCards(report, athletePerformanceStats(analysis));
  drawReportSection(report, 'Performance overview');
  drawInsightList(report, athletePerformanceInsights(analysis));
  ensureReportSpace(report, CHART_HEIGHT + 33);
  drawReportSection(report, 'Normalized performance history');
  drawPerformanceChart(report, analysis);
  drawReportSection(report, 'Recent normalized results');
  const rows = recentResults(analysis);
  if (rows.length === 0) {
    drawParagraph(report, `Insufficient data: no normalized ${analysis.discipline.label} results are available for the recent-results table.`);
  } else {
    const includePlace = recentResultsHavePlacings(rows);
    drawReportTable(report, {
      columns: [
        { header: 'Date', flex: 1, value: (result) => formatReportDate(result.event.date) },
        { header: 'Event', flex: 2.4, value: (result) => result.event.title },
        { header: 'Type', flex: 0.9, value: (result) => result.event.type },
        { header: `Performance (${unitLabel(analysis.discipline.unit)})`, flex: 1.2, value: (result) => formatPerformanceValue(result.value, analysis.discipline), align: 'right' },
        ...(includePlace ? [{ header: 'Place', flex: 0.65, value: (result: AnalyticsResult) => result.place ?? '—', align: 'center' as const }] : []),
      ],
      rows,
    });
  }
  return saveReportDocument(report);
}

export const athletePerformanceReportPdf = buildAthletePerformanceReport;

function rankingFactorLabels(analysis: WorkspaceDisciplineAnalysis): string {
  return analysis.ranking.factors.map((factor) => ({
    pb: 'personal best', sb: 'season best', latest: 'latest result', first: 'first result', average: 'average', median: 'median', improvement: 'improvement', recentTrend: 'recent trend', resultCount: 'result count',
  })[factor]).join(', ');
}

function workspaceMetricExists(analysis: WorkspaceDisciplineAnalysis, metric: 'pb' | 'sb' | 'latest' | 'improvement' | 'recentTrend'): boolean {
  return analysis.athletes.some(({ factors }) => metric === 'latest' ? factors.latest !== null : factors[metric] !== null);
}

function trendText(analysis: AthleteDisciplineAnalysis): string {
  if (!analysis.recentTrend) return 'Not recorded';
  const { direction, change } = analysis.recentTrend;
  return `${direction} (${signed(change)}${formatPerformanceValue(change, analysis.discipline)})`;
}

export function workspaceDisciplineTellMe(analysis: WorkspaceDisciplineAnalysis): string {
  const ranked = analysis.athletes.filter((athlete) => athlete.rank !== null);
  const leader = ranked[0];
  const leaderText = leader && leader.factors.pb !== null
    ? `Leader: ${leader.athlete.name}, rank ${leader.rank}, personal best ${formatPerformanceValue(leader.factors.pb, analysis.discipline)}.`
    : 'No athletes have a ranked valid personal best yet.';
  return `${analysis.discipline.label} analysis for ${seasonLabel(analysis.season.selected)}: ${analysis.athletes.length} athlete${analysis.athletes.length === 1 ? '' : 's'}. ${performanceDirectionLabel(analysis.discipline)}. PB-only ranking: ${analysis.ranking.ordering}. ${leaderText}`;
}

export async function buildWorkspaceDisciplineReport(analysis: WorkspaceDisciplineAnalysis): Promise<Uint8Array> {
  const report = await createReportDocument({
    title: `${analysis.discipline.label} promising-athlete analysis`,
    subject: `Personal-best-only ${analysis.discipline.label} athlete ranking analysis.`,
    metadata: [
      { label: 'Discipline', value: `${analysis.discipline.label} (${unitLabel(analysis.discipline.unit)})` },
      { label: 'Season', value: seasonLabel(analysis.season.selected) },
      { label: 'Direction', value: performanceDirectionLabel(analysis.discipline) },
      { label: 'Ranking basis', value: 'Personal best only' },
    ],
  });
  const ranked = analysis.athletes.filter((athlete) => athlete.rank !== null);
  drawReportStatCards(report, [
    { label: 'Athletes analysed', value: analysis.athletes.length },
    { label: 'PB-ranked athletes', value: ranked.length },
    { label: 'Unranked athletes', value: analysis.athletes.length - ranked.length },
  ]);
  drawReportSection(report, 'Ranking policy and methodology');
  drawParagraph(report, `PB-only policy: ${analysis.ranking.ordering}. ${performanceDirectionLabel(analysis.discipline)}.`);
  drawParagraph(report, `Tie handling: ${analysis.ranking.tieHandling}. Unranked handling: ${analysis.ranking.unrankedHandling}.`);
  drawParagraph(report, `Descriptive factors available in this cached analysis: ${rankingFactorLabels(analysis)}. This report does not calculate a promising-athlete score, composite, points total, or weighting; only personal best determines rank. All other factors provide context.`);
  drawReportSection(report, 'Promising-athlete ranking');

  const columns = [
    { header: 'Rank', flex: 0.55, value: ({ rank }: WorkspaceDisciplineAnalysis['athletes'][number]) => rank === null ? 'Unranked' : rank, align: 'center' as const },
    { header: 'Athlete', flex: 1.75, value: ({ athlete }: WorkspaceDisciplineAnalysis['athletes'][number]) => athlete.name },
    ...(workspaceMetricExists(analysis, 'pb') ? [{ header: 'PB', flex: 0.95, value: ({ factors }: WorkspaceDisciplineAnalysis['athletes'][number]) => factors.pb === null ? 'Not recorded' : formatPerformanceValue(factors.pb, analysis.discipline), align: 'right' as const }] : []),
    ...(workspaceMetricExists(analysis, 'sb') ? [{ header: 'SB', flex: 0.95, value: ({ factors }: WorkspaceDisciplineAnalysis['athletes'][number]) => factors.sb === null ? 'Not recorded' : formatPerformanceValue(factors.sb, analysis.discipline), align: 'right' as const }] : []),
    ...(workspaceMetricExists(analysis, 'latest') ? [{ header: 'Latest', flex: 1.05, value: ({ factors }: WorkspaceDisciplineAnalysis['athletes'][number]) => factors.latest === null ? 'Not recorded' : formatPerformanceValue(factors.latest.value, analysis.discipline), align: 'right' as const }] : []),
    ...(workspaceMetricExists(analysis, 'improvement') ? [{ header: 'Directional change', flex: 1.1, value: ({ factors }: WorkspaceDisciplineAnalysis['athletes'][number]) => factors.improvement === null ? 'Not recorded' : `${signed(factors.improvement)}${formatPerformanceValue(factors.improvement, analysis.discipline)}`, align: 'right' as const }] : []),
    ...(workspaceMetricExists(analysis, 'recentTrend') ? [{ header: 'Recent trend', flex: 1.2, value: ({ factors }: WorkspaceDisciplineAnalysis['athletes'][number]) => trendText(factors) }] : []),
    { header: 'Results', flex: 0.65, value: ({ factors }: WorkspaceDisciplineAnalysis['athletes'][number]) => factors.resultCount, align: 'center' as const },
  ];
  if (analysis.athletes.length === 0) {
    drawParagraph(report, `Insufficient data: no athletes have normalized ${analysis.discipline.label} history in this cached analysis.`);
  } else {
    drawReportTable(report, { columns, rows: analysis.athletes });
  }
  return saveReportDocument(report);
}

export const workspaceDisciplineReportPdf = buildWorkspaceDisciplineReport;

export function performanceReportFilename(value: string): string {
  const safe = value.trim().toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '');
  return safe || 'athlora-report';
}
