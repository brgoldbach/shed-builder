import { DISCLAIMER } from '../disclaimer';
import { ROLES } from '../member';
import type { Naming } from '../naming';
import { formatInches, formatLength } from '../units';
import { PRICE_NOTE, sheetLabel, type Bom } from './bom';
import { LENGTH_RULE, type CutLine } from './cutlist';

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
// The caution is the last row, so the header stays the first.
const csv = (rows: (string | number)[][]) => `${[...rows, [DISCLAIMER]].map((row) => row.map(cell).join(',')).join('\n')}\n`;

/** The cut list as CSV: one row per line, lengths in decimal inches and as written. */
export function cutListCsv(lines: readonly CutLine[], names: Naming): string {
  return csv([
    ['Mark', 'Assembly', 'Part', 'Stock', 'Qty', 'Length (in)', 'Length', 'Notes'],
    ...lines.map((line) => [
      line.mark,
      names.assembly(line.assembly).label,
      ROLES[line.role],
      `${line.size}${line.treated ? ' PT' : ''}`,
      line.ids.length,
      line.length,
      formatInches(line.length),
      line.note ?? '',
    ]),
    [LENGTH_RULE],
  ]);
}

const dollars = (value: number) => value.toFixed(2);

/**
 * The bill of materials as CSV: lumber by stock length, sheets, then counted items, each with its
 * price and cost in dollars, then the total.
 */
export function bomCsv(bom: Bom): string {
  const rows: (string | number)[][] = [['Section', 'Item', 'Length', 'Qty', 'Unit', 'Price', 'Cost', 'Notes']];
  for (const group of bom.lumber) {
    const item = `${group.size}${group.treated ? ' PT' : ''}`;
    for (const [stock, boards] of Map.groupBy(group.boards, ({ stock }) => stock)) {
      rows.push(['Lumber', item, formatLength(stock), boards.length, 'ea', group.cost.basis, dollars((boards.length * stock * group.rate) / 12), '']);
    }
  }
  for (const group of bom.sheets) {
    const uses = group.uses.map(({ label, panels }) => `${label}: ${panels} panels`).join('; ');
    rows.push(['Sheets', sheetLabel(group.sheet), '', group.count, 'sheets', group.cost.basis, dollars(group.cost.total), uses]);
  }
  for (const [section, lines] of [['Concrete', bom.concrete], ['Hardware', bom.hardware], ['Roofing', bom.roofing]] as const) {
    for (const line of lines) rows.push([section, line.item, '', line.quantity, line.unit, line.cost.basis, dollars(line.cost.total), line.note ?? '']);
  }
  rows.push(['Total', 'Materials', '', '', '', '', dollars(bom.costs.total), PRICE_NOTE]);
  return csv(rows);
}
