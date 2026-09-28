import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export const REPORT_MARGINS = { top: 52, right: 48, bottom: 48, left: 48 };
export const REPORT_CONTENT_BOTTOM = REPORT_MARGINS.bottom + 16;
const REPORT_COLORS = {
  ink: rgb(0.02, 0.11, 0.18),
  muted: rgb(0.29, 0.39, 0.44),
  brand: rgb(0, 0.57, 0.74),
  accent: rgb(0.27, 0.75, 0.84),
  mist: rgb(0.94, 0.98, 0.99),
  mistStrong: rgb(0.89, 0.96, 0.98),
  line: rgb(0.79, 0.88, 0.91),
  white: rgb(1, 1, 1),
};

export interface ReportMetadata {
  label: string;
  value: string;
}

export interface ReportDocumentOptions {
  title: string;
  metadata?: ReportMetadata[];
  subject?: string;
  generatedAt?: Date | string;
}

export interface ReportDocument {
  document: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  title: string;
  metadata: ReportMetadata[];
  generatedAt: string;
  page: PDFPage;
  y: number;
}

export interface ReportStatCard {
  label: string;
  value: string | number;
}

export interface ReportTableColumn<Row> {
  header: string;
  flex: number;
  value: (row: Row) => string | number;
  align?: 'left' | 'center' | 'right';
}

export interface ReportTable<Row> {
  columns: ReportTableColumn<Row>[];
  rows: Row[];
}

export function formatReportDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function safeReportText(value: string | number): string {
  return String(value)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

export function wrapReportText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const safeText = safeReportText(text);
  if (!safeText) return [''];
  if (maxWidth <= 0) return [safeText];

  const lines: string[] = [];
  for (const paragraph of safeText.replaceAll('\r', '').split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line) lines.push(line);
      line = '';
      let remainder = word;
      while (font.widthOfTextAtSize(remainder, size) > maxWidth) {
        let end = Math.max(1, remainder.length - 1);
        while (end > 1 && font.widthOfTextAtSize(remainder.slice(0, end), size) > maxWidth) end -= 1;
        lines.push(remainder.slice(0, end));
        remainder = remainder.slice(end);
      }
      line = remainder;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

export async function createReportDocument(options: ReportDocumentOptions): Promise<ReportDocument> {
  const document = await PDFDocument.create();
  document.setTitle(`Athlora ${options.title}`);
  document.setSubject(options.subject ?? options.title);
  document.setCreator('Athlora');

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const generatedAt = formatReportDate(options.generatedAt ?? new Date());
  const page = document.addPage(PageSizes.A4);
  const report: ReportDocument = {
    document,
    regular,
    bold,
    title: options.title,
    metadata: options.metadata ?? [],
    generatedAt,
    page,
    y: 0,
  };
  drawReportHeader(report);
  return report;
}

export function startReportPage(report: ReportDocument): void {
  report.page = report.document.addPage(PageSizes.A4);
  drawReportHeader(report);
}

export function drawReportHeader(report: ReportDocument): void {
  const { page, bold, regular } = report;
  const top = page.getHeight() - REPORT_MARGINS.top;
  const brandWidth = bold.widthOfTextAtSize('ATHLORA', 16);

  page.drawRectangle({ x: REPORT_MARGINS.left, y: top + 22, width: 46, height: 3, color: REPORT_COLORS.brand });
  page.drawRectangle({ x: REPORT_MARGINS.left + 50, y: top + 22, width: 22, height: 3, color: REPORT_COLORS.accent });
  page.drawText('ATHLORA', { x: REPORT_MARGINS.left, y: top, size: 16, font: bold, color: REPORT_COLORS.ink });
  page.drawText('PERFORMANCE OS', { x: REPORT_MARGINS.left + brandWidth + 9, y: top + 3, size: 6.5, font: bold, color: REPORT_COLORS.brand });
  page.drawLine({
    start: { x: REPORT_MARGINS.left, y: top - 9 },
    end: { x: page.getWidth() - REPORT_MARGINS.right, y: top - 9 },
    thickness: 0.75,
    color: REPORT_COLORS.line,
  });
  report.y = drawReportTitleAndMetadata(report, top - 34, regular, bold);
}

export function drawReportTitleAndMetadata(report: ReportDocument, startY: number, regular = report.regular, bold = report.bold): number {
  const contentWidth = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right;
  let y = startY;
  for (const line of wrapReportText(bold, report.title, 16, contentWidth)) {
    report.page.drawText(line, { x: REPORT_MARGINS.left, y, size: 16, font: bold, color: REPORT_COLORS.ink });
    y -= 20;
  }

  const metadata = [...report.metadata, { label: 'Generated', value: report.generatedAt }];
  for (const item of metadata) {
    const text = item.label ? `${item.label}: ${item.value}` : item.value;
    for (const line of wrapReportText(regular, text, 8, contentWidth)) {
      report.page.drawText(line, { x: REPORT_MARGINS.left, y, size: 8, font: regular, color: REPORT_COLORS.muted });
      y -= 10;
    }
  }
  return y - 12;
}

export function drawReportSection(report: ReportDocument, title: string): void {
  const height = 25;
  ensureReportSpace(report, height);
  const width = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right;
  report.page.drawText(safeReportText(title), { x: REPORT_MARGINS.left, y: report.y, size: 11, font: report.bold, color: REPORT_COLORS.ink });
  report.page.drawLine({
    start: { x: REPORT_MARGINS.left, y: report.y - 6 },
    end: { x: REPORT_MARGINS.left + width, y: report.y - 6 },
    thickness: 0.75,
    color: REPORT_COLORS.line,
  });
  report.y -= height;
}

export function drawReportStatCard(report: ReportDocument, stat: ReportStatCard, x: number, y: number, width: number, height: number): void {
  report.page.drawRectangle({ x, y: y - height, width, height, color: REPORT_COLORS.mist, borderColor: REPORT_COLORS.line, borderWidth: 0.5 });
  report.page.drawText(safeReportText(stat.label).toUpperCase(), { x: x + 10, y: y - 15, size: 6.5, font: report.bold, color: REPORT_COLORS.muted });
  report.page.drawText(safeReportText(stat.value), { x: x + 10, y: y - 36, size: 15, font: report.bold, color: REPORT_COLORS.brand });
}

export function drawReportStatCards(report: ReportDocument, stats: ReportStatCard[]): void {
  const cardsPerRow = 3;
  const gap = 10;
  const height = 50;
  const contentWidth = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right;
  const cardWidth = (contentWidth - gap * (cardsPerRow - 1)) / cardsPerRow;

  for (let start = 0; start < stats.length; start += cardsPerRow) {
    ensureReportSpace(report, height + 12);
    stats.slice(start, start + cardsPerRow).forEach((stat, index) => {
      drawReportStatCard(report, stat, REPORT_MARGINS.left + index * (cardWidth + gap), report.y, cardWidth, height);
    });
    report.y -= height + 12;
  }
}

export function drawReportTable<Row>(report: ReportDocument, table: ReportTable<Row>): void {
  if (!table.columns.length) return;
  const contentWidth = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right;
  const totalFlex = table.columns.reduce((total, column) => total + column.flex, 0);
  if (totalFlex <= 0) throw new Error('Report table columns must have positive flex values.');

  const widths = table.columns.map((column) => contentWidth * column.flex / totalFlex);
  const fontSize = 7.5;
  const lineHeight = 10;
  const paddingX = 4;
  const paddingY = 5;
  const headerHeight = Math.max(18, Math.max(...table.columns.map((column, index) => wrapReportText(report.bold, column.header, 7, widths[index] - paddingX * 2).length)) * 9 + 8);

  const drawHeading = () => {
    if (report.y - headerHeight < REPORT_CONTENT_BOTTOM) startReportPage(report);
    let x = REPORT_MARGINS.left;
    report.page.drawRectangle({ x, y: report.y - headerHeight, width: contentWidth, height: headerHeight, color: REPORT_COLORS.mistStrong });
    table.columns.forEach((column, index) => {
      const lines = wrapReportText(report.bold, column.header, 7, widths[index] - paddingX * 2);
      lines.forEach((line, lineIndex) => {
        drawAlignedText(report.page, report.bold, line, x + paddingX, report.y - paddingY - 7 - lineIndex * 9, 7, widths[index] - paddingX * 2, column.align ?? 'left', REPORT_COLORS.ink);
      });
      x += widths[index];
    });
    report.y -= headerHeight;
  };

  const startTablePage = () => {
    startReportPage(report);
    drawHeading();
  };

  drawHeading();
  table.rows.forEach((row, rowIndex) => {
    const cells = table.columns.map((column, index) => wrapReportText(report.regular, String(column.value(row)), fontSize, widths[index] - paddingX * 2));
    const maxLines = Math.max(...cells.map((lines) => lines.length));
    const rowHeight = Math.max(18, maxLines * lineHeight + paddingY * 2);

    if (rowHeight > report.y - REPORT_CONTENT_BOTTOM) startTablePage();
    if (rowHeight <= report.y - REPORT_CONTENT_BOTTOM) {
      drawTableRowSegment(report, table.columns, widths, cells, rowIndex, 0, maxLines, fontSize, lineHeight, paddingX, paddingY);
      return;
    }

    let lineOffset = 0;
    while (lineOffset < maxLines) {
      const availableHeight = report.y - REPORT_CONTENT_BOTTOM;
      const lineCapacity = Math.floor((availableHeight - paddingY * 2) / lineHeight);
      if (lineCapacity < 1) {
        startTablePage();
        continue;
      }
      const lineCount = Math.min(lineCapacity, maxLines - lineOffset);
      drawTableRowSegment(report, table.columns, widths, cells, rowIndex, lineOffset, lineCount, fontSize, lineHeight, paddingX, paddingY);
      lineOffset += lineCount;
      if (lineOffset < maxLines) startTablePage();
    }
  });
}

export function drawReportFooter(report: ReportDocument, page: PDFPage, pageNumber: number, pageCount: number): void {
  const width = page.getWidth();
  const label = `ATHLORA PERFORMANCE OS | Generated ${report.generatedAt}`;
  const pageLabel = `Page ${pageNumber} of ${pageCount}`;
  page.drawLine({
    start: { x: REPORT_MARGINS.left, y: REPORT_MARGINS.bottom + 7 },
    end: { x: width - REPORT_MARGINS.right, y: REPORT_MARGINS.bottom + 7 },
    thickness: 0.5,
    color: REPORT_COLORS.line,
  });
  page.drawText(label, { x: REPORT_MARGINS.left, y: REPORT_MARGINS.bottom - 7, size: 7, font: report.regular, color: REPORT_COLORS.muted });
  page.drawText(pageLabel, {
    x: width - REPORT_MARGINS.right - report.regular.widthOfTextAtSize(pageLabel, 7),
    y: REPORT_MARGINS.bottom - 7,
    size: 7,
    font: report.regular,
    color: REPORT_COLORS.muted,
  });
}

export async function saveReportDocument(report: ReportDocument): Promise<Uint8Array> {
  const pages = report.document.getPages();
  pages.forEach((page, index) => drawReportFooter(report, page, index + 1, pages.length));
  return report.document.save();
}

export function ensureReportSpace(report: ReportDocument, height: number): void {
  if (report.y - height < REPORT_CONTENT_BOTTOM) startReportPage(report);
}

function drawTableRowSegment<Row>(
  report: ReportDocument,
  columns: ReportTableColumn<Row>[],
  widths: number[],
  cells: string[][],
  rowIndex: number,
  lineOffset: number,
  lineCount: number,
  fontSize: number,
  lineHeight: number,
  paddingX: number,
  paddingY: number,
): void {
  const height = Math.max(18, lineCount * lineHeight + paddingY * 2);
  const contentWidth = report.page.getWidth() - REPORT_MARGINS.left - REPORT_MARGINS.right;
  if (rowIndex % 2 === 1) report.page.drawRectangle({ x: REPORT_MARGINS.left, y: report.y - height, width: contentWidth, height, color: REPORT_COLORS.mist });
  report.page.drawLine({
    start: { x: REPORT_MARGINS.left, y: report.y - height },
    end: { x: REPORT_MARGINS.left + contentWidth, y: report.y - height },
    thickness: 0.4,
    color: REPORT_COLORS.line,
  });

  let x = REPORT_MARGINS.left;
  columns.forEach((column, index) => {
    cells[index].slice(lineOffset, lineOffset + lineCount).forEach((line, lineIndex) => {
      drawAlignedText(report.page, report.regular, line, x + paddingX, report.y - paddingY - fontSize - lineIndex * lineHeight, fontSize, widths[index] - paddingX * 2, column.align ?? 'left', REPORT_COLORS.ink);
    });
    x += widths[index];
  });
  report.y -= height;
}

function drawAlignedText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, width: number, align: 'left' | 'center' | 'right', color: ReturnType<typeof rgb>): void {
  const textWidth = font.widthOfTextAtSize(text, size);
  const alignedX = align === 'right' ? x + width - textWidth : align === 'center' ? x + (width - textWidth) / 2 : x;
  page.drawText(text, { x: alignedX, y, size, font, color });
}
