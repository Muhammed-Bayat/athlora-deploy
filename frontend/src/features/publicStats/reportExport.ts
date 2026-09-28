import type { PublicStatisticsReportEntry } from '../../api/publicStatistics';
import { createReportDocument, drawReportSection, drawReportStatCards, drawReportTable, formatReportDate, saveReportDocument } from '../reports/pdfDocument';

export { downloadFile } from '../../utils/downloadFile';

function spreadsheetCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function performance(entry: PublicStatisticsReportEntry): string {
  return `${entry.performance.toFixed(entry.precision)} ${entry.unit === 'seconds' ? 's' : entry.unit}`;
}

export function reportCsv(entries: PublicStatisticsReportEntry[]): string {
  const rows: Array<Array<string | number>> = [
    ['Place', 'Athlete', 'Club', 'Discipline', 'Performance', 'Event', 'Date'],
    ...entries.map((entry) => [entry.place, entry.athleteName, entry.clubName, entry.label, performance(entry), entry.eventTitle, entry.eventDate]),
  ];
  return rows.map((row) => row.map(spreadsheetCell).join(',')).join('\r\n');
}

export async function reportPdf(entries: PublicStatisticsReportEntry[], filters: Record<string, string>): Promise<Uint8Array> {
  const activeFilters = Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(', ') || 'All results';
  const report = await createReportDocument({
    title: 'Public statistics report',
    metadata: [{ label: 'Filters', value: activeFilters }],
    subject: `Published results report. ${activeFilters}`,
  });
  const athletes = new Set(entries.map((entry) => entry.athleteId)).size;
  const disciplines = new Set(entries.map((entry) => entry.discipline)).size;

  drawReportStatCards(report, [
    { label: 'Published performances', value: entries.length },
    { label: 'Athletes', value: athletes },
    { label: 'Disciplines', value: disciplines },
  ]);
  drawReportSection(report, 'Published performances');
  drawReportTable(report, {
    columns: [
      { header: 'Place', flex: 0.55, value: (entry) => entry.place, align: 'center' },
      { header: 'Athlete', flex: 1.35, value: (entry) => entry.athleteName },
      { header: 'Club', flex: 1.2, value: (entry) => entry.clubName },
      { header: 'Discipline', flex: 1.15, value: (entry) => entry.label },
      { header: 'Performance', flex: 1, value: performance, align: 'right' },
      { header: 'Event', flex: 2, value: (entry) => entry.eventTitle },
      { header: 'Date', flex: 1.05, value: (entry) => formatReportDate(entry.eventDate) },
    ],
    rows: entries,
  });
  return saveReportDocument(report);
}
