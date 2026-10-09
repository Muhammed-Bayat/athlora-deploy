import { describe, expect, it } from 'vitest';
import { createReportDocument, drawReportTable } from './pdfDocument';

describe('PDF report document', () => {
  it('leaves a visual gutter after the final table row', async () => {
    const report = await createReportDocument({ title: 'Table spacing' });
    const startY = report.y;

    drawReportTable(report, {
      columns: [{ header: 'Metric', flex: 1, value: (row: { value: string }) => row.value }],
      rows: [{ value: 'Recorded result' }],
    });

    expect(report.y).toBe(startY - 48);
  });
});
