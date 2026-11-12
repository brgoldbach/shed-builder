import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { DISCLAIMER } from '../src/core/disclaimer';
import { buildModel } from '../src/core/model';
import { buildBom, packLumber, packSheets, PRICE_NOTE, type Bom } from '../src/core/out/bom';
import { buildCutList, LENGTH_RULE } from '../src/core/out/cutlist';
import { bomCsv, cutListCsv } from '../src/core/out/csv';
import { naming } from '../src/core/naming';
import { PRESETS } from '../src/core/presets';
import { DESIGNS } from './designs';

const [gableSkid, leanToPier, garageSlab] = PRESETS;
const bomOf = (config = gableSkid) => {
  const model = buildModel(config);
  const marks = new Map(buildCutList(model.members, naming(config)).flatMap((line) => line.ids.map((id) => [id, line.mark] as const)));
  return buildBom(config, model, marks);
};
const item = (lines: Bom['hardware'], name: string) => lines.find((line) => line.item === name);

describe('lumber packing', () => {
  it('keeps a stock-length piece whole and packs the rest into the least length', () => {
    const pieces = [92.625, 50, 40, 30, 20].map((length, index) => ({ id: `P${index}`, length }));
    const boards = packLumber(pieces, [92.625, 96, 120, 144], 0.125);
    // 50 + 40 + 30 + 20 and three 1/8 in kerfs = 140-3/8: one 12 ft board beats two precuts.
    expect(boards.map(({ stock, pieces }) => [stock, pieces.map(({ length }) => length)])).toEqual([
      [144, [50, 40, 30, 20]],
      [92.625, [92.625]],
    ]);
  });

  it('cuts from boards no longer than the longest stock, as long as pieces allow', () => {
    // Uncapped, 100 and 90 share a 16 ft board. Capped at 10 ft: 100 on a 10 ft board, 90 and 80 on 8 ft.
    const pieces = [100, 90, 80].map((length, index) => ({ id: `P${index}`, length }));
    const stocks = [96, 120, 144, 192, 240];
    const stockOf = (boards: { stock: number }[]) => boards.map(({ stock }) => stock);
    expect(stockOf(packLumber(pieces, stocks, 0.125))).toEqual([192, 96]);
    expect(stockOf(packLumber(pieces, [96, 120], 0.125, stocks))).toEqual([120, 96, 96]);
    // A 17 ft piece takes one 18 ft board; the short pieces stay on short boards.
    expect(stockOf(packLumber([...pieces, { id: 'L', length: 204 }], [96, 120], 0.125, [...stocks, 216]))).toEqual([216, 120, 96, 96]);
  });

  it('flags a piece longer than any stock', () => {
    // 10x12 lean-to rafters are 150-1/4 in: too long for 12 ft 2x8s.
    const config = shedSchema.parse({ ...leanToPier, catalog: { stock: { '2x8': [96, 144] } } });
    const bom = bomOf(config);
    // 10 rafters and 2 fly rafters; the PT 2x8 girders split over the piers.
    expect(bom.lumber.find(({ size, treated }) => size === '2x8' && !treated)!.tooLong).toHaveLength(12);
    // One warning for each cut line.
    expect(bom.warnings).toEqual([
      { source: 'RF-1', message: 'The 10 pieces of 2x8 at 150-1/4" are longer than the longest stock, 144". Splice them or order them long.' },
      { source: 'RF-2', message: 'The 2 pieces of 2x8 at 150-1/4" are longer than the longest stock, 144". Splice them or order them long.' },
    ]);
  });
});

describe('sheet packing', () => {
  it('fills a sheet along its length, turning a small piece to fit', () => {
    // 8x10 subfloor: 96, 24, 48, and 72 in by 48. The 24 x 48 turns in beside the 48 x 48.
    const pieces = [{ long: 96, short: 48 }, { long: 48, short: 24 }, { long: 48, short: 48 }, { long: 72, short: 48 }];
    expect(packSheets(pieces, 0.125)).toBe(3);
  });

  it('stacks ripped strips across one sheet', () => {
    expect(packSheets([{ long: 72, short: 20 }, { long: 72, short: 20 }], 0.125)).toBe(1);
  });

  it('counts a piece larger than a sheet as a sheet of its own', () => {
    expect(packSheets([{ long: 120, short: 24 }, { long: 48, short: 24 }], 0.125)).toBe(2);
    expect(packSheets([{ long: 60, short: 50 }, { long: 30, short: 20 }], 0.125)).toBe(2);
  });
});

describe('counted items', () => {
  it('ties each rafter at its seat, and takes off the roof area and drip edge', () => {
    const bom = bomOf();
    // 6 rafter pairs: 12 seats.
    expect(item(bom.hardware, 'Hurricane tie, rafter to plate')?.quantity).toBe(12);
    // Two 136 x 68.76 in planes: (12 + 48 + 1-1/2 fascia) run at 6/12.
    expect(item(bom.roofing, 'Roof area, shingles')?.quantity).toBe(129.9);
    // Eaves 2 x 136 in, rakes 4 x 68.76 in.
    expect(item(bom.roofing, 'Drip edge')).toMatchObject({ quantity: 45.6, note: 'Eaves 22.7 ft, rakes 22.9 ft.' });
    expect(bom.sheets.map(({ sheet, count }) => [sheet, count])).toContainEqual(['tg-23/32', 3]);
  });

  it('pours the piers and counts form tubes', () => {
    const bom = bomOf(leanToPier);
    // 9 piers, 10 in by 44 in: 31,103 cu in = 18.0 cu ft.
    // Under 1 cu yd, the pour is priced in bags.
    expect(bom.concrete).toEqual([
      {
        item: 'Concrete, 9 piers',
        quantity: 0.67,
        unit: 'cu yd',
        note: '18 cu ft net, or 30 bags of 80 lb mix at 0.60 cu ft each.',
        cost: { total: 180, basis: '30 bags at $6.00' },
      },
      { item: 'Form tube, 10"', quantity: 9, unit: 'ea', note: '44" each.', cost: { total: 144, basis: '$16.00 each' } },
    ]);
    // Lean-to rafters bear on both walls.
    expect(item(bom.hardware, 'Hurricane tie, rafter to plate')?.quantity).toBe(20);
  });

  it('gives each form-tube length when lean-to deck piers stop at the deck beam', () => {
    const loftShed = DESIGNS.find(({ name }) => name === '10x16 loft shed')!;
    const onPiers = shedSchema.parse({ ...loftShed, foundation: { ...loftShed.foundation, type: 'pier' } });
    const tube = bomOf(onPiers).concrete.find(({ item }) => item.startsWith('Form tube'))!;
    expect(tube.note).toMatch(/^\d+ at [^,]+, \d+ at [^,]+\.$/);
    expect(tube.note!.match(/\d+(?= at)/g)!.map(Number).reduce((total, count) => total + count)).toBe(tube.quantity);
  });

  it('pours the slab with its thickened edge, and counts anchor bolts', () => {
    const bom = bomOf(garageSlab);
    // 240 x 144 x 4 slab plus a 12 in wide ring 8 in under it: 207,360 cu in = 120 cu ft.
    expect(bom.concrete[0]).toMatchObject({ item: 'Concrete, slab', quantity: 4.44, cost: { basis: '$165.00 per cu yd, ready-mix' } });
    // 16 ft sills: the front splices at the door's left king (177-3/4), the back at the 192 stud.
    // Each part clear of a doorway takes its own end bolts: front 4 + 1 + 1, back 4 + 2, right 3, left 1 + 1.
    expect(item(bom.hardware, 'Anchor bolt, 1/2", with nut and washer')?.quantity).toBe(17);
  });

  it('counts post bases and caps under posts', () => {
    const config = shedSchema.parse({ ...leanToPier, foundation: { ...leanToPier.foundation, pier: { ...leanToPier.foundation.pier, post: '4x4' } } });
    const { hardware } = bomOf(config);
    expect(item(hardware, 'Post base, 4x4')?.quantity).toBe(9);
    expect(item(hardware, 'Post cap, 4x4')?.quantity).toBe(9);
  });

  it('hangs each loft joist between the ledgers', () => {
    // 8x10 hung loft: end joists at 3-1/2 and 115, layout joists at 16 in: 9 joists, 2 hangers each.
    const config = shedSchema.parse({ ...gableSkid, roof: { ...gableSkid.roof, loft: { enabled: true, support: 'hung' } } });
    expect(item(bomOf(config).hardware, 'Joist hanger, 2x6')?.quantity).toBe(18);
  });
});

describe('prices', () => {
  it('prices lumber by the foot of stock, with the treated markup', () => {
    const { lumber } = bomOf();
    const skids = lumber.find(({ size, treated }) => size === '4x6' && treated)!;
    // 4x6 at $2.10/ft untreated, +50%: $3.15/ft. Three 10 ft skids: 30 ft.
    expect(skids.cost.basis).toBe('$3.15/ft, untreated +50%');
    expect(skids.cost.total).toBeCloseTo(94.5, 9);
  });

  it('totals each section and the whole', () => {
    const { costs, sheets, hardware } = bomOf();
    // 17 sheets of 7/16 OSB at $16.50, 3 of 23/32 T&G at $34; 12 hurricane ties at $0.75.
    expect(costs.sheets).toBeCloseTo(17 * 16.5 + 3 * 34, 9);
    expect(costs.hardware).toBeCloseTo(9, 9);
    expect(sheets.map(({ cost }) => cost.basis)).toEqual(['$16.50 per sheet', '$34.00 per sheet']);
    expect(hardware[0].cost.total).toBe(9);
    expect(costs.total).toBeCloseTo(costs.lumber + costs.sheets + costs.concrete + costs.hardware + costs.roofing, 9);
  });

  it('keeps the default for each price a file leaves out', () => {
    const config = shedSchema.parse({ ...gableSkid, catalog: { prices: { lumber: { '2x4': 1 } } } });
    expect(config.catalog.prices.lumber).toMatchObject({ '2x4': 1, '2x6': 0.75 });
    expect(config.catalog.prices.hardware.hurricaneTie).toBe(0.75);
  });
});

describe('CSV', () => {
  it('quotes fields with commas or quotes', () => {
    const lines = buildCutList(buildModel(gableSkid).members, naming(gableSkid));
    const [header, first] = cutListCsv(lines, naming(gableSkid)).split('\n');
    expect(header).toBe('Mark,Assembly,Part,Stock,Qty,Length (in),Length,Notes');
    // How lengths are measured, then the caution, close the file.
    const rows = cutListCsv(lines, naming(gableSkid)).split('\n');
    expect(rows.slice(-3, -1)).toEqual([`"${LENGTH_RULE}"`, `"${DISCLAIMER}"`]);
    expect(first).toBe('FD-1,Foundation,Skid,4x6 PT,3,120,"120""","Both ends cut 45° across the bottom, 1-7/8"" up and in, so the shed drags without digging in."');
  });

  it('lists lumber by stock length, then sheets and counted items', () => {
    const rows = bomCsv(bomOf()).split('\n');
    const bom = bomOf();
    expect(rows[0]).toBe('Section,Item,Length,Qty,Unit,Price,Cost,Notes');
    // The total, then the caution, close the file.
    expect(rows.slice(-3, -1)).toEqual([`Total,Materials,,,,,${bom.costs.total.toFixed(2)},"${PRICE_NOTE}"`, `"${DISCLAIMER}"`]);
    expect(rows).toContain('Hardware,"Hurricane tie, rafter to plate",,12,ea,$0.75 each,9.00,One at each rafter seat: 1 per main rafter.');
  });
});
