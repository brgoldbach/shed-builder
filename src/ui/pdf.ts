import { jsPDF } from 'jspdf';
import qrcode from 'qrcode-generator';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { svg2pdf } from 'svg2pdf.js';
import { APP_VERSION } from '../core/config';
import { DISCLAIMER } from '../core/disclaimer';
import type { Drawing } from '../drawings/drawing';
import { pickScale, pointsPerInch } from '../drawings/scale';
import { DrawingSvg, fitScale, layoutOf } from './DrawingSvg';

export type Paper = 'letter' | 'tabloid';

const MARGIN = 36; // pt: 1/2 in
const BLOCK = 54; // title block height
// The link sheet's QR code, at most 5 in on a side: a long link (105 modules) still prints each
// module over 1 mm, easy for a phone camera.
const CODE = 360;
const NOTE = 8; // note text size
const LINE = 1.3; // line height per text size
const SVG_NS = 'http://www.w3.org/2000/svg';

// Print colors for the drawing's classes. The app's theme colors do not suit paper, and the halo
// stroke is left off. Text is smaller than on screen, so it crowds less at small scales.
const STYLE = `
.shape { fill: #ffffff; stroke: #000000; stroke-width: 1; }
.shape.treated { fill: #dcebdc; }
.shape.concrete { fill: #e6e6e6; }
.shape.sheet { fill: #f7efe5; }
.shape.steel { fill: #000000; }
.shape.context { fill: none; stroke: #777777; stroke-dasharray: 4 3; }
.wireframe .shape { fill: none; }
.cut-mark { fill: none; stroke: #000000; stroke-width: 0.75; }
.outline { fill: none; stroke: #777777; stroke-dasharray: 6 4; }
.dim line { stroke: #555555; stroke-width: 0.75; }
text { fill: #000000; font-family: helvetica; font-size: 9px; }
.mark { fill: #555555; font-size: 7px; }
`;

// The drawing as an SVG element at a scale in points per building inch, with the print colors.
function svgOf(drawing: Drawing, scale: number): SVGSVGElement {
  const markup = renderToStaticMarkup(createElement(DrawingSvg, { drawing, selected: new Set<string>(), onPick: () => {}, scale }));
  const text = markup.replace(/^<svg/, `<svg xmlns="${SVG_NS}"`).replace(/^(<svg[^>]*>)/, `$1<style>${STYLE}</style>`);
  return new DOMParser().parseFromString(text, 'image/svg+xml').documentElement as unknown as SVGSVGElement;
}

/** Download the plan set as `fileName`. A `link` to the design adds a last sheet with its QR code. */
export async function downloadPlans(drawings: readonly Drawing[], designName: string, paper: Paper, fileName: string, link: string | null) {
  (await plansPdf(drawings, designName, paper, link)).save(fileName);
}

/**
 * Every drawing as one sheet of a landscape PDF. Each drawing gets the largest architectural scale
 * that fits, or else fills the sheet and says it is not to scale. A title block carries the
 * design, sheet, scale, date, version, and the notice. With a `link`, a last sheet shows the
 * design's link as a large QR code that opens it.
 */
export async function plansPdf(drawings: readonly Drawing[], designName: string, paper: Paper, link: string | null = null): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: paper });
  const [pageWidth, pageHeight] = [doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight()];
  const inner = pageWidth - 2 * MARGIN;
  const date = new Date().toLocaleDateString('en-CA');
  const sheets = drawings.length + (link ? 1 : 0);
  const block = (index: number, title: Cell['lines']) =>
    titleBlock(doc, { top: pageHeight - MARGIN - BLOCK, inner }, [
      { share: 0.36, lines: [[DISCLAIMER, 7, 'normal']] },
      { share: 0.22, lines: [[designName, 11, 'bold'], [`Shed Builder ${APP_VERSION}`, 8, 'normal']] },
      { share: 0.28, lines: title },
      { share: 0.14, lines: [[`Sheet ${index + 1} of ${sheets}`, 11, 'bold'], [date, 8, 'normal']] },
    ]);

  for (const [index, drawing] of drawings.entries()) {
    if (index > 0) doc.addPage();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(NOTE);
    const notes = drawing.notes.flatMap((note) => doc.splitTextToSize(`- ${note}`, inner) as string[]);
    const notesHeight = notes.length * NOTE * LINE;
    const area = { width: inner, height: pageHeight - 2 * MARGIN - BLOCK - notesHeight - 12 };

    // A standard scale when one fits, else the scale that fills the area.
    const scale = pickScale((points) => layoutOf(drawing, points), area);
    const points = scale ? pointsPerInch(scale) : fitScale(drawing, area.width, area.height, Infinity);
    const { width, height } = layoutOf(drawing, points);
    await svg2pdf(svgOf(drawing, points), doc, { x: MARGIN + (area.width - width) / 2, y: MARGIN + (area.height - height) / 2, width, height });

    notes.forEach((line, row) => doc.text(line, MARGIN, MARGIN + area.height + 12 + (row + 0.8) * NOTE * LINE));
    block(index, [[drawing.title, 11, 'bold'], [scale ? `Scale ${scale.label}` : 'Not to scale', 8, 'normal']]);
  }

  if (link) {
    doc.addPage();
    // The code centered over a two-line caption, in the room above the title block.
    const caption = 36;
    const room = pageHeight - 2 * MARGIN - BLOCK - caption;
    const size = Math.min(CODE, room, inner);
    const top = MARGIN + (room - size) / 2;
    drawCode(doc, qrModules(link), { left: (pageWidth - size) / 2, top, size });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Scan with a phone camera to open "${designName}" in Shed Builder.`, pageWidth / 2, top + size + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('The code holds the whole design, as it was when these plans were made.', pageWidth / 2, top + size + 30, { align: 'center' });
    block(drawings.length, [['Open this design', 11, 'bold'], ['Scan the code with a phone camera', 8, 'normal']]);
  }
  return doc;
}

// The QR code's dark modules, by row. Level L keeps a long link to the fewest modules.
function qrModules(text: string): boolean[][] {
  const code = qrcode(0, 'L');
  code.addData(text, 'Byte');
  code.make();
  const count = code.getModuleCount();
  return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, column) => code.isDark(row, column)));
}

// The code in a `size` square, inside the 4-module quiet zone the standard asks, each row's dark
// runs drawn as one rectangle.
function drawCode(doc: jsPDF, modules: boolean[][], { left, top, size }: { left: number; top: number; size: number }) {
  const cell = size / (modules.length + 8);
  const [x0, y0] = [left + 4 * cell, top + 4 * cell];
  doc.setFillColor(0, 0, 0);
  modules.forEach((row, index) => {
    for (let column = 0; column < row.length; ) {
      if (!row[column]) {
        column++;
        continue;
      }
      const start = column;
      while (column < row.length && row[column]) column++;
      // A hair taller than the module, so no seam shows between rows.
      doc.rect(x0 + start * cell, y0 + index * cell, (column - start) * cell, cell + 0.05, 'F');
    }
  });
}

type Cell = { share: number; lines: [text: string, size: number, style: 'normal' | 'bold'][] };

// A boxed row of cells across the sheet, each a share of the inner width, text wrapped to fit.
function titleBlock(doc: jsPDF, { top, inner }: { top: number; inner: number }, cells: Cell[]) {
  doc.setLineWidth(0.75);
  doc.rect(MARGIN, top, inner, BLOCK);
  let left = MARGIN;
  for (const [index, { share, lines }] of cells.entries()) {
    const width = inner * share;
    if (index > 0) doc.line(left, top, left, top + BLOCK);
    let y = top + 6;
    for (const [text, size, style] of lines) {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      for (const line of doc.splitTextToSize(text, width - 12) as string[]) {
        y += size * LINE;
        doc.text(line, left + 6, y - size * 0.3);
      }
    }
    left += width;
  }
}
