import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PublicStatisticsReportEntry } from '../../api/publicStatistics';

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

export function downloadFile(content: BlobPart | Uint8Array, name: string, type: string): void {
  const blobContent: BlobPart = content instanceof Uint8Array
    ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
    : content;
  const url = URL.createObjectURL(new Blob([blobContent], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export async function reportPdf(entries: PublicStatisticsReportEntry[], filters: Record<string, string>): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle('Athlora public statistics report');
  document.setSubject(`Published results report. ${Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(', ') || 'All results'}`);
  document.setCreator('Athlora');
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const rows = entries.length ? entries : [];
  let page = document.addPage();
  let y = 800;
  const drawHeader = () => {
    page.drawText('ATHLORA', { x: 48, y, size: 18, font: bold, color: rgb(0.05, 0.55, 0.72) });
    y -= 28;
    page.drawText('Public statistics report', { x: 48, y, size: 14, font: bold });
    y -= 20;
    page.drawText(document.getSubject() ?? '', { x: 48, y, size: 8, font: regular, maxWidth: 500 });
    y -= 28;
    page.drawText('Place  Athlete                 Club                    Discipline       Performance  Event', { x: 48, y, size: 8, font: bold });
    y -= 14;
  };
  drawHeader();
  for (const entry of rows) {
    if (y < 48) {
      page = document.addPage();
      y = 800;
      drawHeader();
    }
    const line = `${entry.place}      ${entry.athleteName.slice(0, 22).padEnd(23)} ${entry.clubName.slice(0, 20).padEnd(22)} ${entry.label.slice(0, 14).padEnd(16)} ${performance(entry).padEnd(12)} ${entry.eventTitle.slice(0, 24)}`;
    page.drawText(line, { x: 48, y, size: 7.5, font: regular });
    y -= 12;
    page.drawText(entry.eventDate, { x: 48, y, size: 7, font: regular, color: rgb(0.25, 0.25, 0.25) });
    y -= 11;
  }
  return document.save();
}
