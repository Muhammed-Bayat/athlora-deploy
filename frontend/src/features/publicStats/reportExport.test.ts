import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { formatReportDate, wrapReportText } from '../reports/pdfDocument';
import { reportCsv, reportPdf } from './reportExport';

const entry = {
  athleteId: 'athlete', athleteName: '=Formula, Runner', clubId: 'club', clubName: 'Track "Club"', discipline: '100m', label: '100m', unit: 'seconds' as const,
  precision: 2, direction: 'lower' as const, performance: 10.91, place: 1, eventTitle: 'City Final', eventDate: '2026-09-25',
};

describe('public report exports', () => {
  it('creates spreadsheet-safe CSV with quoted fields', () => {
    const csv = reportCsv([entry]);
    expect(csv).toContain('"\'=Formula, Runner"');
    expect(csv).toContain('"Track ""Club"""');
    expect(csv).toContain('"10.91 s"');
  });

  it('abbreviates field-result units in exports', () => {
    expect(reportCsv([{ ...entry, discipline: 'long_jump', label: 'Long jump', unit: 'metres', performance: 6.45 }])).toContain('"6.45 m"');
  });

  it('creates a branded PDF document', async () => {
    const bytes = await reportPdf([entry], { discipline: '100m', season: '2026' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it('wraps long values and creates additional PDF pages for a large report', async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    expect(wrapReportText(font, 'Intercontinental Championship Final With A Long Event Name', 7.5, 55).length).toBeGreaterThan(1);

    const entries = Array.from({ length: 70 }, (_, index) => ({
      ...entry,
      athleteId: `athlete-${index}`,
      athleteName: `Athlete ${index + 1}`,
      eventTitle: `Intercontinental Championship Final With A Long Event Name ${index + 1}`,
    }));
    const bytes = await reportPdf(entries, {});
    const exported = await PDFDocument.load(bytes);

    expect(exported.getPageCount()).toBeGreaterThan(1);
  });

  it('formats event dates for readable PDF table labels', () => {
    expect(formatReportDate('2026-09-25')).toBe('25 Sept 2026');
  });
});
