import { SHEETS, stockFor, type LumberSize, type SheetKey } from '../catalog';
import type { Prices, ShedConfig } from '../config';
import type { Member, Point, Solid, Warning } from '../member';
import type { Model } from '../model';
import { formatInches, formatMoney } from '../units';

const SHEET_LENGTH = 96;
const SHEET_WIDTH = 48;
// QUIKRETE Concrete Mix No. 1101 data sheet: an 80 lb bag yields about 0.60 cu ft.
const BAG_YIELD = 0.6;
const CUBIC_FOOT = 1728; // cu in
const NEAR = 0.01;
// cu yd: a smaller pour is priced in bags. Ready-mix adds a short-load fee below about this.
const BAGS_UNDER = 1;

/** What the prices cover. */
export const PRICE_NOTE =
  'US dollars, before tax and delivery, at the unit prices in the lumber catalog. Special-order lumber is not priced.';

export interface Piece {
  id: string;
  length: number;
}

/** A cost in US dollars, and how it was priced, for example `$0.75 each`. */
export interface Cost {
  total: number;
  basis: string;
}

/** One stock board and the pieces cut from it. */
export interface Board {
  stock: number;
  pieces: Piece[];
}

export interface LumberGroup {
  size: LumberSize;
  treated: boolean;
  boards: Board[];
  tooLong: Piece[]; // longer than any stock length, not priced
  waste: number; // fraction of the stock length bought that is not in a piece
  rate: number; // dollars per foot of stock, with the treated markup
  cost: Cost;
}

export interface SheetGroup {
  sheet: SheetKey;
  count: number;
  uses: { label: string; panels: number }[];
  waste: number;
  cost: Cost;
}

/** A counted item: concrete, hardware, or roofing. */
export interface Line {
  item: string;
  quantity: number;
  unit: string;
  note?: string;
  cost: Cost;
}

export interface Bom {
  lumber: LumberGroup[];
  sheets: SheetGroup[];
  concrete: Line[];
  hardware: Line[];
  roofing: Line[];
  warnings: Warning[];
  costs: Record<'lumber' | 'sheets' | 'concrete' | 'hardware' | 'roofing' | 'total', number>;
}

/** Materials to buy for the model. `marks` maps member ids to cut-list marks, for warnings. */
export function buildBom(config: ShedConfig, model: Model, marks: ReadonlyMap<string, string>): Bom {
  const lumber = lumberGroups(config, model.members);
  // One warning for each cut line: its pieces share a size and length.
  const warnings = lumber.flatMap(({ size, tooLong }) => {
    const longest = formatInches(Math.max(...onePiece(config, size)));
    return [...Map.groupBy(tooLong, ({ id }) => marks.get(id) ?? id)].map(([source, [{ length }, ...others]]) => ({
      source,
      message:
        others.length === 0
          ? `The ${size} at ${formatInches(length)} is longer than the longest stock, ${longest}. Splice it or order it long.`
          : `The ${others.length + 1} pieces of ${size} at ${formatInches(length)} are longer than the longest stock, ${longest}. Splice them or order them long.`,
    }));
  });
  const { prices } = config.catalog;
  const sheets = sheetGroups(model.solids, config.catalog.kerf, prices);
  const lines = { concrete: concrete(model.solids, prices), hardware: hardware(config, model), roofing: roofing(config, model) };
  const costOf = (parts: readonly { cost: Cost }[]) => sum(parts.map(({ cost }) => cost.total));
  const costs = {
    lumber: costOf(lumber),
    sheets: costOf(sheets),
    concrete: costOf(lines.concrete),
    hardware: costOf(lines.hardware),
    roofing: costOf(lines.roofing),
  };
  return { lumber, sheets, ...lines, warnings, costs: { ...costs, total: sum(Object.values(costs)) } };
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
// Shoelace formula, for a simple polygon.
const area = (points: readonly Point[]) =>
  Math.abs(sum(points.map(([x, y], index) => x * points[(index + 1) % points.length][1] - points[(index + 1) % points.length][0] * y))) / 2;
const each = (quantity: number, price: number, unit = 'each'): Cost => ({ total: quantity * price, basis: `${formatMoney(price)} ${unit}` });
const onePiece = ({ catalog }: ShedConfig, size: LumberSize) => stockFor(catalog, size, Math.max(catalog.maxLength, catalog.maxOnePiece));
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

function lumberGroups(config: ShedConfig, members: readonly Member[]): LumberGroup[] {
  const groups = Map.groupBy(members, ({ size, treated }) => `${size}|${treated}`);
  return [...groups.values()].map((group) => {
    const { size, treated } = group[0];
    const general = stockFor(config.catalog, size);
    const long = onePiece(config, size);
    const longest = Math.max(...long);
    // Cut-list lengths: to the nearest 1/16 in.
    const pieces = group.map(({ id, length }) => ({ id, length: Math.round(length * 16) / 16 }));
    const boards = packLumber(
      pieces.filter(({ length }) => length <= longest + NEAR),
      general,
      config.catalog.kerf,
      long,
    );
    const bought = sum(boards.map(({ stock }) => stock));
    const used = sum(boards.flatMap((board) => board.pieces.map(({ length }) => length)));
    const { lumber, treatedMarkup } = config.catalog.prices;
    const rate = lumber[size] * (treated ? 1 + treatedMarkup / 100 : 1);
    return {
      size,
      treated,
      boards,
      tooLong: pieces.filter(({ length }) => length > longest + NEAR),
      waste: bought > 0 ? 1 - used / bought : 0,
      rate,
      cost: { total: (bought / 12) * rate, basis: `${formatMoney(rate)}/ft${treated ? `, untreated +${treatedMarkup}%` : ''}` },
    };
  });
}


/**
 * Pieces packed into stock boards. A piece as long as a stock length takes that board: precut
 * studs stay precut. The rest go longest first, each into the first board with room. Two ways to
 * open a board: at the shortest stock that takes the piece, or at the longest stock. Each board
 * then cuts back to the shortest stock that holds its pieces, and splits when its pieces cost less
 * length apart: each on its own board, or the longest alone. The way that buys less length wins.
 *
 * Boards come from `general`. Only a piece longer than any of those opens a board from `long`.
 */
export function packLumber(pieces: readonly Piece[], general: readonly number[], kerf: number, long: readonly number[] = general): Board[] {
  const cap = Math.max(...general);
  const content = (board: Board) => sum(board.pieces.map(({ length }) => length)) + kerf * (board.pieces.length - 1);
  const exact = (piece: Piece) => (piece.length <= cap + NEAR ? general : long).find((stock) => Math.abs(stock - piece.length) < NEAR);
  const whole = pieces.flatMap((piece) => {
    const stock = exact(piece);
    return stock === undefined ? [] : [{ stock, pieces: [piece] }];
  });
  const sorted = pieces.filter((piece) => exact(piece) === undefined).sort((first, second) => second.length - first.length);
  const shortestFor = (length: number) =>
    Math.min(...(length <= cap + NEAR ? general : long).filter((stock) => stock >= length - NEAR));
  const pack = (open: (length: number) => number): Board[] => {
    const boards: Board[] = [];
    for (const piece of sorted) {
      const board = boards.find((candidate) => content(candidate) + kerf + piece.length <= candidate.stock + NEAR);
      if (board) board.pieces.push(piece);
      else boards.push({ stock: open(piece.length), pieces: [piece] });
    }
    return boards.flatMap((board) => split({ ...board, stock: shortestFor(content(board)) }));
  };
  const alone = (piece: Piece): Board => ({ stock: shortestFor(piece.length), pieces: [piece] });
  const split = (board: Board): Board[] => {
    if (board.pieces.length < 2) return [board];
    const [longest, ...rest] = board.pieces;
    const apart = board.pieces.map(alone);
    const remainder: Board = { stock: shortestFor(content({ stock: 0, pieces: rest })), pieces: rest };
    const options = [[board], apart, [alone(longest), remainder]];
    return options.reduce((best, option) => (bought(option) < bought(best) - NEAR ? option : best));
  };
  const bought = (boards: Board[]) => sum(boards.map(({ stock }) => stock));
  const [shortest, longest] = [pack(shortestFor), pack((length) => (length <= cap + NEAR ? cap : shortestFor(length)))];
  const packed = bought(longest) < bought(shortest) - NEAR ? longest : shortest;
  return [...whole, ...packed].sort((first, second) => second.stock - first.stock);
}

/**
 * Sheets needed for rectangular pieces (long and short side), by shelves: the widest piece
 * starts a shelf across the sheet, and later pieces fill along the first shelf that fits. A piece
 * no longer than the sheet width may turn to fit a shelf.
 */
export function packSheets(pieces: readonly { long: number; short: number }[], kerf: number): number {
  const sorted = [...pieces].sort((first, second) => second.short - first.short || second.long - first.long);
  const sheets: { shelves: { height: number; used: number }[]; height: number }[] = [];
  for (const { long, short } of sorted) {
    const turns = long <= SHEET_WIDTH + NEAR ? [[long, short], [short, long]] : [[long, short]];
    const fit = sheets
      .flatMap(({ shelves }) => shelves)
      .flatMap((shelf) => turns.map(([along, across]) => ({ shelf, along, across })))
      .find(({ shelf, along, across }) => shelf.height >= across - NEAR && shelf.used + kerf + along <= SHEET_LENGTH + NEAR);
    if (fit) {
      fit.shelf.used += kerf + fit.along;
      continue;
    }
    const sheet = sheets.find(({ height }) => height + kerf + short <= SHEET_WIDTH + NEAR);
    if (sheet) {
      sheet.shelves.push({ height: short, used: long });
      sheet.height += kerf + short;
    } else {
      sheets.push({ shelves: [{ height: short, used: long }], height: short });
    }
  }
  return sheets.length;
}

// Each panel is cut from the rectangle around it.
function sheetGroups(solids: readonly Solid[], kerf: number, prices: Prices): SheetGroup[] {
  const panels = solids.filter((solid) => solid.sheet !== undefined && solid.shape.kind === 'panel');
  return [...Map.groupBy(panels, ({ sheet }) => sheet!)].map(([sheet, group]) => {
    const pieces = group.map(({ shape }) => {
      const outline = shape.kind === 'panel' ? shape.outline : [];
      const across = Math.max(...outline.map(([u]) => u)) - Math.min(...outline.map(([u]) => u));
      const up = Math.max(...outline.map(([, v]) => v)) - Math.min(...outline.map(([, v]) => v));
      return { long: Math.max(across, up), short: Math.min(across, up) };
    });
    const count = packSheets(pieces, kerf);
    const uses = [...Map.groupBy(group, ({ label }) => label.split(',')[0])].map(([label, used]) => ({ label, panels: used.length }));
    return {
      sheet,
      count,
      uses,
      waste: 1 - sum(pieces.map(({ long, short }) => long * short)) / (count * SHEET_LENGTH * SHEET_WIDTH),
      cost: each(count, prices.sheets[sheet], 'per sheet'),
    };
  });
}

function concrete(solids: readonly Solid[], prices: Prices): Line[] {
  const lines: Line[] = [];
  const poured = solids.filter(({ material }) => material === 'concrete');
  const volume = (solid: Solid) => {
    const { shape } = solid;
    if (shape.kind === 'box') return (shape.max[0] - shape.min[0]) * (shape.max[1] - shape.min[1]) * (shape.max[2] - shape.min[2]);
    if (shape.kind === 'cylinder') return Math.PI * shape.radius ** 2 * shape.height;
    return area(shape.outline) * shape.thick;
  };
  const { bag, readyMix, formTube } = prices.concrete;
  const pour = (item: string, parts: Solid[]) => {
    const cubicFeet = sum(parts.map(volume)) / CUBIC_FOOT;
    const [yards, bags] = [round(cubicFeet / 27, 2), Math.ceil(cubicFeet / BAG_YIELD)];
    lines.push({
      item,
      quantity: yards,
      unit: 'cu yd',
      note: `${round(cubicFeet, 1)} cu ft net, or ${bags} bags of 80 lb mix at 0.60 cu ft each.`,
      cost: yards < BAGS_UNDER ? { total: bags * bag, basis: `${bags} bags at ${formatMoney(bag)}` } : each(yards, readyMix, 'per cu yd, ready-mix'),
    });
  };
  const slab = poured.filter(({ shape }) => shape.kind === 'box');
  if (slab.length > 0) pour('Concrete, slab', slab);
  const ramps = poured.filter(({ shape }) => shape.kind === 'panel');
  if (ramps.length > 0) pour(ramps.length === 1 ? 'Concrete, ramp' : `Concrete, ${ramps.length} ramps`, ramps);
  const piers = poured.filter(({ shape }) => shape.kind === 'cylinder');
  if (piers.length > 0) {
    pour(`Concrete, ${piers.length} piers`, piers);
    const [first] = piers;
    if (first.shape.kind === 'cylinder') {
      const { radius, height } = first.shape;
      lines.push({
        item: `Form tube, ${formatInches(2 * radius)}`,
        quantity: piers.length,
        unit: 'ea',
        note: `${formatInches(height)} each.`,
        cost: each(piers.length, formTube),
      });
    }
  }
  return lines;
}

function hardware(config: ShedConfig, model: Model): Line[] {
  const lines: Line[] = [];
  const count = (role: Member['role']) => model.members.filter((member) => member.role === role).length;
  const price = config.catalog.prices.hardware;
  const add = (item: string, quantity: number, unitPrice: number, note?: string) => {
    if (quantity > 0) lines.push({ item, quantity, unit: 'ea', ...(note && { note }), cost: each(quantity, unitPrice) });
  };

  add('Anchor bolt, 1/2", with nut and washer', model.solids.filter(({ label }) => label.startsWith('Anchor bolt')).length, price.anchorBolt);
  const seats = config.roof.style === 'lean-to' ? 2 : 1;
  const rafters = (assembly: string) => model.members.filter((member) => member.role === 'rafter' && member.assembly === assembly);
  // A lean-to rafter seats on its beam, and an extension rafter on the main wall too.
  const leanTos = model.leanTos.map(({ side, addition }) => ({ rafters: rafters(`addition.${side}`), extension: addition.attach === 'extension' }));
  add(
    'Hurricane tie, rafter to plate',
    rafters('roof').length * seats + leanTos.reduce((sum, { rafters, extension }) => sum + rafters.length * (extension ? 2 : 1), 0),
    price.hurricaneTie,
    `One at each rafter seat: ${seats} per main rafter${leanTos.length ? '; per lean-to rafter, 1 on its beam and 1 on the main wall for an extension' : ''}.`,
  );
  for (const [size, posts] of Map.groupBy(model.members.filter(({ role }) => role === 'post'), ({ size }) => size)) {
    add(`Post base, ${size}`, posts.length, price.postBase, 'Set in the pier, or anchored to the slab or a deck beam.');
    add(`Post cap, ${size}`, posts.length, price.postCap, 'To the girder or beam.');
  }

  // Joist hangers by size: hung loft joists, hatch framing, and lean-to rafters at their ledgers.
  // Trimmers, edge joists, and hatch headers are doubled: one double hanger per end.
  const { loft } = config.roof;
  const hung = loft.support === 'hung';
  const singles = new Map<string, number>();
  const single = (size: string, quantity: number) => singles.set(size, (singles.get(size) ?? 0) + quantity);
  single(loft.joist, count('tail.loft') * (hung ? 2 : 1) + (hung ? 2 * count('joist.loft') : 0));
  // Below-soffit lean-to rafters hang from their ledgers. Deck joists hang at both ends.
  leanTos.filter(({ extension }) => !extension).forEach(({ rafters }) => rafters.forEach(({ size }) => single(size, 1)));
  for (const { deck } of model.leanTos) if (deck) single(deck.joist, deck.hangers);
  for (const [size, quantity] of singles) add(`Joist hanger, ${size}`, quantity, price.joistHanger);
  add(`Joist hanger, double ${loft.joist}`, count('header.loft') + (hung ? count('trimmer.loft') + count('edge.loft') : 0), price.doubleHanger);
  add(
    'Ledger lag screw, 1/2"',
    model.leanTos.reduce((sum, { lags }) => sum + lags, 0),
    price.lag,
    'Two at each main-wall stud behind a lean-to ledger.',
  );
  add('Deck ledger lag screw, 1/2"', model.leanTos.reduce((sum, { deck }) => sum + (deck?.ledgerLags ?? 0), 0), price.lag, 'Two at each deck joist, into the floor framing.');
  for (const { deck } of model.leanTos) {
    if (deck) add(`Beam seat, ${deck.plies}-ply ${deck.joist}`, deck.seats, price.postCap, 'On each pier, under the deck beam.');
  }
  add('Ramp lag screw, 1/2"', 2 * count('stringer'), price.lag, 'Two at each ramp stringer, into the floor framing.');
  return lines;
}

// From the roof planes: roof area by roofing, and drip edge along every eave and rake, but not
// along the ridge.
function roofing(config: ShedConfig, model: Model): Line[] {
  const { planes } = model;
  if (planes.length === 0) return [];
  const price = config.catalog.prices.roofing;
  // The main roof's roofing is in the config. A lean-to's roof is metal where it is not sheathed.
  const metal = ({ assembly, sheathed }: Model['planes'][number]) => (assembly === 'roof' ? config.roof.roofing !== 'shingles' : !sheathed);
  const areas = [
    { item: 'Roof area, shingles', planes: planes.filter((plane) => !metal(plane)), price: price.shingles },
    { item: 'Roof area, metal panels', planes: planes.filter(metal), price: price.metal },
  ].flatMap(({ item, planes: covered, price: unitPrice }): Line[] => {
    if (covered.length === 0) return [];
    const area = round(sum(covered.map(({ length, width }) => length * width)) / 144, 1);
    return [{ item, quantity: area, unit: 'sq ft', note: `${round(area / 100, 2)} squares.`, cost: each(area, unitPrice, 'per sq ft') }];
  });
  const eaves = sum(planes.map(({ length, eaves }) => length * eaves)) / 12;
  const rakes = sum(planes.map(({ width }) => 2 * width)) / 12;
  const edge = round(eaves + rakes, 1);
  return [
    ...areas,
    {
      item: 'Drip edge',
      quantity: edge,
      unit: 'ft',
      note: `Eaves ${round(eaves, 1)} ft, rakes ${round(rakes, 1)} ft.`,
      cost: each(edge, price.dripEdge, 'per ft'),
    },
  ];
}

export const sheetLabel = (sheet: SheetKey) => `${SHEETS[sheet].label}, 4×8`;
