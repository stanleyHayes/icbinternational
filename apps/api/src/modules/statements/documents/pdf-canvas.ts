/**
 * The small amount of PDFKit this module needs, wrapped so the documents themselves read
 * as layout rather than as coordinate arithmetic.
 *
 * Helvetica and the other base-14 fonts only. They are built into every PDF reader, so a
 * statement produced here opens identically on a phone, in a browser and in whatever the
 * customer's accountant uses — and the bank ships no font files to lose.
 *
 * Vertical position is set in whole points rather than by PDFKit's line multiplier. A
 * table has to place every cell in a row at the same `y`, which means owning the cursor
 * outright; mixing the two would leave the columns a fraction of a line out of step.
 */

import PDFDocument from 'pdfkit';

const PAGE_MARGIN = 48;
const TITLE_SIZE = 18;
const HEADING_SIZE = 11;
const BODY_SIZE = 9;
const FOOTNOTE_SIZE = 8;
const LABEL_WIDTH = 150;
const ROW_HEIGHT = 14;
const PARAGRAPH_GAP = 8;
const RULE_GAP = 6;

/** A column in a rendered table. */
export interface Column {
  readonly header: string;
  readonly width: number;
  readonly align?: 'left' | 'right';
}

/**
 * One document, built by calling the parts of it in order.
 *
 * Fluent because a document *is* a sequence — letterhead, then body, then footnote — and
 * reading the calls top to bottom should match reading the page top to bottom.
 */
export class PdfPage {
  private readonly document: PDFKit.PDFDocument;

  constructor(meta: { title: string; author: string }) {
    this.document = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      info: { Title: meta.title, Author: meta.author },
    });
  }

  /** The bank's name, what the document is, and the one line that qualifies it. */
  letterhead(input: { bank: string; title: string; subtitle: string }): this {
    this.document.font('Helvetica-Bold').fontSize(TITLE_SIZE).text(input.bank);
    this.document.font('Helvetica').fontSize(HEADING_SIZE).text(input.title);
    this.document.fontSize(BODY_SIZE).text(input.subtitle);
    return this.rule();
  }

  heading(text: string): this {
    this.document.y += PARAGRAPH_GAP;
    this.document.font('Helvetica-Bold').fontSize(HEADING_SIZE).text(text, PAGE_MARGIN);
    this.document.y += RULE_GAP;
    return this;
  }

  /** A block of label/value pairs, aligned down a single gutter. */
  keyValues(rows: readonly (readonly [string, string])[]): this {
    this.document.font('Helvetica').fontSize(BODY_SIZE);

    for (const [label, value] of rows) {
      const top = this.document.y;
      this.document.text(label, PAGE_MARGIN, top, { width: LABEL_WIDTH });
      this.document.text(value, PAGE_MARGIN + LABEL_WIDTH, top, { width: this.contentWidth });
      this.document.y = top + ROW_HEIGHT;
    }

    return this;
  }

  paragraph(text: string): this {
    this.document
      .font('Helvetica')
      .fontSize(BODY_SIZE)
      .text(text, PAGE_MARGIN, this.document.y, { width: this.contentWidth });
    this.document.y += PARAGRAPH_GAP;
    return this;
  }

  /** A table that repeats its header whenever the rows run onto a new page. */
  table(columns: readonly Column[], rows: readonly (readonly string[])[]): this {
    this.headerRow(columns);

    for (const cells of rows) {
      if (this.document.y + ROW_HEIGHT > this.bottom) {
        this.document.addPage();
        this.headerRow(columns);
      }
      this.row(columns, cells, 'Helvetica');
    }

    return this;
  }

  /** A closing note, set smaller than the body so it reads as the bank's own footnote. */
  footnote(lines: readonly string[]): this {
    this.rule();
    this.document.font('Helvetica').fontSize(FOOTNOTE_SIZE);
    for (const line of lines) {
      this.document.text(line, PAGE_MARGIN, this.document.y, { width: this.contentWidth });
    }
    return this;
  }

  /** Closes the document and collects it into a single buffer. */
  render(): Promise<Buffer> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      this.document.on('data', (chunk: Buffer) => chunks.push(chunk));
      this.document.on('end', () => resolve(Buffer.concat(chunks)));
      this.document.on('error', reject);
      this.document.end();
    });
  }

  private rule(): this {
    const top = this.document.y + RULE_GAP;
    this.document
      .moveTo(PAGE_MARGIN, top)
      .lineTo(this.document.page.width - PAGE_MARGIN, top)
      .lineWidth(1)
      .stroke();
    this.document.y = top + RULE_GAP;
    return this;
  }

  private headerRow(columns: readonly Column[]): void {
    this.row(
      columns,
      columns.map((column) => column.header),
      'Helvetica-Bold',
    );
    this.rule();
  }

  private row(columns: readonly Column[], cells: readonly string[], font: string): void {
    const top = this.document.y;
    let left = PAGE_MARGIN;

    this.document.font(font).fontSize(BODY_SIZE);
    columns.forEach((column, index) => {
      this.document.text(cells[index] ?? '', left, top, {
        width: column.width,
        align: column.align ?? 'left',
        ellipsis: true,
        lineBreak: false,
      });
      left += column.width;
    });

    this.document.y = top + ROW_HEIGHT;
  }

  private get contentWidth(): number {
    return this.document.page.width - PAGE_MARGIN * 2;
  }

  private get bottom(): number {
    return this.document.page.height - PAGE_MARGIN;
  }
}
