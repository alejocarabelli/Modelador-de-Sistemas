import { jsPDF } from 'jspdf';
import type { FlowDocLine, FlowDocSegment, FlowDocTable, FlowDocument } from './flowDocument';
import { PDF_FONT_FAMILY } from './pdfFontFamily';
import { registerPdfFonts } from './pdfFonts';

/*
 * PDF export matching the UTN FRM Diseño de Sistemas template:
 * - Default A4 Portrait (optional Landscape)
 * - Descriptive List table with dark slate left header column and white bold labels
 * - 3-column Flow table (Actor 22% | Sistema 65% | Ref. 13%)
 * - Exact per-substep Ref. alignment (CA N°X, GUI-N)
 * - Visual box frames drawn around Por cada / Mientras loops
 * - Underlined classes, italic attributes, bold main steps & Actor actions, uppercase bold SI/SINO/FINSI
 * - Safe row-splitting across page breaks (works offline inside WKWebView)
 */

const MARGIN = 32;
const FONT_SIZE = 9;
const LINE_HEIGHT = 12;
const BASELINE = 8.8;
const PAD_X = 5.5;
const PAD_Y = 3.5;
const DEPTH_INDENT = 13;

const DARK_HEADER_FILL: [number, number, number] = [38, 48, 61]; // #26303D
const SECTION_BANNER_FILL: [number, number, number] = [235, 239, 244]; // #EBEFF4
const TABLE_HEADER_FILL: [number, number, number] = [244, 246, 248]; // #F4F6F8
const BORDER_COLOR: [number, number, number] = [55, 65, 81];
const LOOP_BOX_COLOR: [number, number, number] = [45, 55, 72];

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';

type Piece = { style: FontStyle; text: string; underline: boolean; x: number };

type VisualLine = {
  bullet?: { kind: number; x: number };
  pieces: Piece[];
  loopDepth?: number;
  loopStarts?: number;
  loopEnds?: number;
  loopBaseIndent?: number;
};

type Column = {
  align?: 'center';
  fill?: [number, number, number];
  textColor?: [number, number, number];
  lines: VisualLine[];
  width: number;
};

const styleOf = (segment: FlowDocSegment, forceBold: boolean): FontStyle => {
  const bold = forceBold || segment.bold === true;
  const italic = segment.italic === true;
  return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
};

class PdfLayout {
  readonly doc: jsPDF;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly contentWidth: number;
  readonly fontFamily: string;
  y = MARGIN;

  constructor(orientation: 'portrait' | 'landscape' = 'portrait') {
    this.doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
    this.pageWidth = orientation === 'portrait' ? 595.28 : 841.89;
    this.pageHeight = orientation === 'portrait' ? 841.89 : 595.28;
    this.contentWidth = this.pageWidth - MARGIN * 2;
    let family: string;
    try {
      registerPdfFonts(this.doc);
      family = PDF_FONT_FAMILY;
    } catch {
      family = 'helvetica';
    }
    this.fontFamily = family;
    this.doc.setFontSize(FONT_SIZE);
    this.doc.setLineWidth(0.55);
    this.doc.setDrawColor(...BORDER_COLOR);
  }

  private setFont(style: FontStyle): void {
    if (this.fontFamily === PDF_FONT_FAMILY) {
      const mapped = style === 'bolditalic' ? '600italic' : style;
      this.doc.setFont(this.fontFamily, mapped);
    } else {
      this.doc.setFont(this.fontFamily, style);
    }
  }

  width(text: string, style: FontStyle): number {
    this.setFont(style);
    return this.doc.getTextWidth(text);
  }

  wrap(line: FlowDocLine, width: number): VisualLine[] {
    const loopDepth = line.loopDepth ?? 0;
    const boxPad = loopDepth * 6;
    const indent = line.depth * DEPTH_INDENT + boxPad;
    const marker = line.number;
    const markerStyle: FontStyle = line.bold ? 'bold' : 'normal';
    const markerWidth = marker !== undefined
      ? Math.max(13, this.width(marker, markerStyle) + 5)
      : line.bullet !== undefined ? 10 : 0;
    const textX = indent + markerWidth;
    const available = Math.max(36, width - textX - boxPad);
    const first: VisualLine = {
      pieces: [],
      loopDepth,
      loopStarts: line.loopStarts,
      loopBaseIndent: Math.max(0, (line.depth - (line.loopStarts ? 0 : 1)) * DEPTH_INDENT),
    };

    if (marker !== undefined) {
      first.pieces.push({ style: markerStyle, text: marker, underline: false, x: indent });
    } else if (line.bullet !== undefined) {
      first.bullet = { kind: line.bullet, x: indent + 3 };
    }

    const lines: VisualLine[] = [first];
    let cursor = 0;

    const words = line.segments.flatMap((segment) =>
      segment.text.split(/(\s+)/).filter((part) => part.length > 0).map((part) => ({
        style: styleOf(segment, line.bold === true),
        text: part,
        underline: segment.underline === true,
      })),
    );

    words.forEach((word) => {
      const isSpace = /^\s+$/.test(word.text);
      let wordWidth = this.width(word.text, word.style);

      if (isSpace && cursor === 0) return;

      if (!isSpace && cursor > 0 && cursor + wordWidth > available) {
        lines.push({ pieces: [], loopDepth });
        cursor = 0;
      }

      let text = word.text;
      while (!isSpace && wordWidth > available && text.length > 1) {
        let fit = text.length - 1;
        while (fit > 1 && this.width(text.slice(0, fit), word.style) > available - cursor) {
          fit -= 1;
        }
        lines[lines.length - 1].pieces.push({ ...word, text: text.slice(0, fit), x: textX + cursor });
        lines.push({ pieces: [], loopDepth });
        cursor = 0;
        text = text.slice(fit);
        wordWidth = this.width(text, word.style);
      }

      lines[lines.length - 1].pieces.push({ ...word, text, x: textX + cursor });
      cursor += wordWidth;
    });

    if (line.loopEnds) {
      lines[lines.length - 1].loopEnds = line.loopEnds;
    }

    return lines;
  }

  wrapAll(lines: FlowDocLine[], width: number): VisualLine[] {
    const visual: VisualLine[] = [];
    lines.forEach((line) => {
      visual.push(...this.wrap(line, width));
    });
    return visual;
  }

  newPage(): void {
    this.doc.addPage();
    this.y = MARGIN;
  }

  ensureSpace(height: number): void {
    if (this.y + height > this.pageHeight - MARGIN) {
      this.newPage();
    }
  }

  drawVisualLine(
    line: VisualLine,
    x: number,
    baseline: number,
    align: 'center' | undefined,
    width: number,
    textColor: [number, number, number] = [17, 24, 39],
  ): void {
    const doc = this.doc;
    doc.setTextColor(...textColor);
    let offset = 0;

    if (align === 'center') {
      const last = line.pieces[line.pieces.length - 1];
      const lineWidth = last === undefined ? 0 : last.x + this.width(last.text, last.style);
      offset = Math.max(0, (width - lineWidth) / 2);
    }

    if (line.bullet !== undefined) {
      const bx = x + offset + line.bullet.x;
      const by = baseline - 3;
      doc.setFillColor(...textColor);
      doc.setDrawColor(...textColor);
      if (line.bullet.kind === 0) {
        doc.circle(bx, by, 1.6, 'F');
      } else if (line.bullet.kind === 1) {
        doc.setLineWidth(0.5);
        doc.circle(bx, by, 1.6, 'S');
        doc.setLineWidth(0.55);
      } else {
        doc.rect(bx - 1.5, by - 1.5, 3, 3, 'F');
      }
      doc.setDrawColor(...BORDER_COLOR);
    }

    line.pieces.forEach((piece) => {
      this.setFont(piece.style);
      doc.text(piece.text, x + offset + piece.x, baseline);
      if (piece.underline) {
        const pieceWidth = doc.getTextWidth(piece.text);
        doc.setDrawColor(...textColor);
        doc.setLineWidth(0.45);
        doc.line(x + offset + piece.x, baseline + 1.3, x + offset + piece.x + pieceWidth, baseline + 1.3);
        doc.setLineWidth(0.55);
        doc.setDrawColor(...BORDER_COLOR);
      }
    });

    // Draw visual loop box edges around Por cada / Mientras blocks.
    const depth = line.loopDepth ?? 0;
    if (depth > 0) {
      const topY = baseline - BASELINE;
      const bottomY = topY + LINE_HEIGHT;
      doc.setDrawColor(...LOOP_BOX_COLOR);
      doc.setLineWidth(0.65);
      for (let d = 1; d <= depth; d += 1) {
        const bx1 = x + (d - 1) * 5 + 2;
        const bx2 = x + width - (d - 1) * 5 - 1;
        doc.line(bx1, topY, bx1, bottomY);
        doc.line(bx2, topY, bx2, bottomY);
      }
      if (line.loopStarts) {
        for (let k = 0; k < line.loopStarts; k += 1) {
          const d = depth - k;
          const bx1 = x + (d - 1) * 5 + 2;
          const bx2 = x + width - (d - 1) * 5 - 1;
          doc.line(bx1, topY, bx2, topY);
        }
      }
      if (line.loopEnds) {
        for (let k = 0; k < line.loopEnds; k += 1) {
          const d = depth - k;
          const bx1 = x + (d - 1) * 5 + 2;
          const bx2 = x + width - (d - 1) * 5 - 1;
          doc.line(bx1, bottomY, bx2, bottomY);
        }
      }
      doc.setLineWidth(0.55);
      doc.setDrawColor(...BORDER_COLOR);
    }
  }

  drawRow(
    columns: Column[],
    options: { openBottom?: boolean; openTop?: boolean; padY?: number } = {},
  ): void {
    const padY = options.padY ?? PAD_Y;
    const cursors = columns.map(() => 0);
    const total = Math.max(1, ...columns.map((column) => column.lines.length));
    let firstSlice = true;

    while (firstSlice || cursors.some((cursor, index) => cursor < columns[index].lines.length)) {
      const room = Math.floor((this.pageHeight - MARGIN - this.y - padY * 2) / LINE_HEIGHT);
      const remaining = Math.max(1, ...columns.map((column, index) => column.lines.length - cursors[index]));

      if (room < Math.min(2, remaining) && this.y > MARGIN + 1) {
        this.newPage();
        continue;
      }

      const take = Math.max(1, Math.min(room, remaining));
      const height = (firstSlice && total === 0 ? 1 : take) * LINE_HEIGHT + padY * 2;
      let x = MARGIN;
      const doc = this.doc;

      columns.forEach((column, index) => {
        if (column.fill !== undefined) {
          doc.setFillColor(...column.fill);
          doc.rect(x, this.y, column.width, height, 'F');
        }

        const slice = column.lines.slice(cursors[index], cursors[index] + take);
        slice.forEach((line, lineIndex) => {
          this.drawVisualLine(
            line,
            x + PAD_X,
            this.y + padY + lineIndex * LINE_HEIGHT + BASELINE,
            column.align,
            column.width - PAD_X * 2,
            column.textColor,
          );
        });
        cursors[index] += slice.length;

        doc.setDrawColor(...BORDER_COLOR);
        doc.line(x, this.y, x, this.y + height);
        x += column.width;
      });

      const done = cursors.every((cursor, index) => cursor >= columns[index].lines.length);
      doc.setDrawColor(...BORDER_COLOR);
      doc.line(x, this.y, x, this.y + height);
      if (firstSlice && !options.openTop) {
        doc.line(MARGIN, this.y, x, this.y);
      }
      if (!(done && options.openBottom)) {
        doc.line(MARGIN, this.y + height, x, this.y + height);
      }

      this.y += height;
      firstSlice = false;

      if (!done) {
        this.newPage();
      }
    }
  }
}

const labelLine = (text: string, bold = false): FlowDocLine => ({
  bold,
  depth: 0,
  refs: [],
  segments: [{ text, bold }],
});

const drawDescription = (layout: PdfLayout, document: FlowDocument): void => {
  const labelWidth = Math.round(layout.contentWidth * 0.24);
  const valueWidth = layout.contentWidth - labelWidth;
  document.fields.forEach((field) => {
    layout.drawRow([
      {
        width: labelWidth,
        fill: DARK_HEADER_FILL,
        textColor: [255, 255, 255],
        lines: layout.wrap(labelLine(field.label, true), labelWidth - PAD_X * 2),
      },
      {
        width: valueWidth,
        lines: layout.wrapAll(field.lines, valueWidth - PAD_X * 2),
      },
    ]);
  });
};

const drawFlowTable = (layout: PdfLayout, table: FlowDocTable): void => {
  const actorWidth = Math.round(layout.contentWidth * 0.22);
  const refWidth = Math.round(layout.contentWidth * 0.13);
  const systemWidth = layout.contentWidth - actorWidth - refWidth;

  layout.ensureSpace(LINE_HEIGHT * 5);

  if (table.subtitle) {
    layout.drawRow([
      {
        width: layout.contentWidth,
        align: 'center',
        fill: DARK_HEADER_FILL,
        textColor: [255, 255, 255],
        lines: layout.wrap(labelLine(table.subtitle, true), layout.contentWidth - PAD_X * 2),
      },
    ]);
  }

  layout.drawRow([
    {
      width: layout.contentWidth,
      align: 'center',
      fill: SECTION_BANNER_FILL,
      lines: layout.wrap(labelLine(table.title, true), layout.contentWidth - PAD_X * 2),
    },
  ]);

  layout.drawRow([
    { width: actorWidth, align: 'center', fill: TABLE_HEADER_FILL, lines: layout.wrap(labelLine('Actor', true), actorWidth - PAD_X * 2) },
    { width: systemWidth, align: 'center', fill: TABLE_HEADER_FILL, lines: layout.wrap(labelLine('Sistema', true), systemWidth - PAD_X * 2) },
    { width: refWidth, align: 'center', fill: TABLE_HEADER_FILL, lines: layout.wrap(labelLine('Ref.', true), refWidth - PAD_X * 2) },
  ]);

  table.rows.forEach((row) => {
    const count = row.subRows.length;
    row.subRows.forEach((sub, index) => {
      const isFirst = index === 0;
      const isLast = index === count - 1;
      const actorLines = layout.wrapAll(sub.actor, actorWidth - PAD_X * 2);
      const systemLines = layout.wrapAll(sub.system, systemWidth - PAD_X * 2);
      const refLines = sub.ref
        ? sub.ref.split('\n').flatMap((r) => layout.wrap(labelLine(r), refWidth - PAD_X * 2))
        : [];

      layout.drawRow(
        [
          { width: actorWidth, lines: actorLines },
          { width: systemWidth, lines: systemLines },
          { width: refWidth, align: 'center', lines: refLines },
        ],
        {
          openTop: !isFirst,
          openBottom: !isLast,
          padY: isFirst && isLast ? PAD_Y : 2,
        },
      );
    });
  });
};

export const createFlowPdf = (
  document: FlowDocument,
  options: { orientation?: 'portrait' | 'landscape' } = {},
): Blob => {
  const layout = new PdfLayout(options.orientation ?? 'portrait');
  let drewSomething = false;

  if (document.includeDescription) {
    drawDescription(layout, document);
    drewSomething = true;
  }

  if (document.includeBasicFlow) {
    if (drewSomething) layout.y += 14;
    drawFlowTable(layout, document.basic);
    drewSomething = true;
  }

  if (document.includeAlternatives) {
    document.alternatives.forEach((alternative) => {
      if (drewSomething) layout.y += 14;
      drawFlowTable(layout, alternative);
      drewSomething = true;
    });
  }

  return layout.doc.output('blob');
};
