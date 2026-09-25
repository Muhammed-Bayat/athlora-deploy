import { describe, expect, it } from 'vitest';
import { reportCsv, reportPdf } from './reportExport';

const entry = {
  athleteId: 'athlete', athleteName: '=Formula, Runner', clubId: 'club', clubName: 'Track "Club"', discipline: '100m', label: '100 metres', unit: 'seconds' as const,
  precision: 2, direction: 'lower' as const, performance: 10.91, place: 1, eventTitle: 'City Final', eventDate: '2026-09-25',
};

describe('public report exports', () => {
  it('creates spreadsheet-safe CSV with quoted fields', () => {
    const csv = reportCsv([entry]);
    expect(csv).toContain('"\'=Formula, Runner"');
    expect(csv).toContain('"Track ""Club"""');
    expect(csv).toContain('"10.91 s"');
  });

  it('creates a branded PDF document', async () => {
    const bytes = await reportPdf([entry], { discipline: '100m', season: '2026' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(500);
  });
});
