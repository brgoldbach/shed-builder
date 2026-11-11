import { LUMBER, SHEETS, stockFor, type LumberSize } from '../catalog';
import type { ShedConfig } from '../config';
import { LEFT_OUT, type Assembly, type Member, type Point, type Role, type Vec3, type Warning } from '../member';
import { formatInches } from '../units';
import { clipBelow, degrees, idMaker, planeMember, type Slope } from './section';
import { splitPlate } from './walls';

const PLY = 1.5; // thickness of 2x lumber
const MIN_TAIL = 3; // a shorter tail joist between a hatch header and the eave gets a warning
const LONG_HEADER = 48; // a longer hatch header gets a warning to check its size
const NEAR = 0.01;
const X: Vec3 = [1, 0, 0];
const UP: Vec3 = [0, 0, 1];

type Span = readonly [number, number];
type Base = { id: string; assembly: Assembly; role: Role; size: LumberSize };
type Warn = (source: string, message: string) => void;
type LeaveOut = (source: string, assembly: Assembly, message: string, outline: Vec3[]) => void;
type Rect = { min: Point; max: Point };

/** The loft deck in plan: `min` to `max` less the holes, laid on the joists at `bottom`. */
export interface Deck {
  bottom: number;
  min: Point;
  max: Point;
  holes: Rect[];
}

// Level pieces that run front to back between the slopes: ties and loft joists.
interface Level {
  /** Wall-to-wall extent at `bottom`: `inset` in from each wall face, less where the roof line cuts in. */
  span: (bottom: number, inset?: number) => Span;
  /** A piece over `extent` at x, lapping the rafter sides; ends past the roof line are trimmed. */
  piece: (base: Base, x: number, bottom: number, extent: Span, note: (trimmed: boolean) => string) => Member;
}

/**
 * Rafter ties, collar ties, the loft floor, and knee walls of a gable roof. `rafters` holds each
 * rafter's start x, gable-end rafters first and last. `wallTop` is the top of the eave walls.
 * `kneeBase` is where knee walls stand when they carry the rafters, else null.
 */
export function frameAttic(
  config: ShedConfig,
  slope: Slope,
  rafters: readonly number[],
  ridgeBottom: number,
  wallDepth: number,
  wallTop: number,
  kneeBase: number | null,
): { members: Member[]; warnings: Warning[]; deck: Deck | null } {
  const { width, roof } = config;
  const { pitch } = slope;
  const members: Member[] = [];
  const warnings: Warning[] = [];
  const warn: Warn = (source, message) => warnings.push({ source, message });
  const leaveOut: LeaveOut = (source, assembly, message, outline) =>
    warnings.push({ source, message: `${message} ${LEFT_OUT}`, missing: { assembly, outline } });
  const plate = slope.bottom(slope.seat); // where the rafters bear
  const ridgeTop = slope.top(width / 2 - PLY / 2);
  // The gable-end rafter pairs stand on the gable framing and get no ties.
  const commons = rafters.slice(1, -1);
  const roofIds = idMaker('RF');

  const level: Level = {
    span: (bottom, inset = 0) => {
      const start = Math.max(inset, (bottom - slope.top(0)) / pitch.rise);
      return [start, width - start];
    },
    piece: (base, x, bottom, [from, to], note) => {
      const depth = LUMBER[base.size].width;
      const box: Point[] = [[from, bottom], [to, bottom], [to, bottom + depth], [from, bottom + depth]];
      const outline = clipBelow(clipBelow(box, [-pitch.rise, 1], slope.top(0)), [pitch.rise, 1], slope.top(width));
      const trimmed = slope.top(from) < bottom + depth || slope.top(width - to) < bottom + depth;
      return planeMember({ ...base, note: note(trimmed) }, { origin: [x, 0, 0], h: [0, 1, 0] }, outline, [1, 0]);
    },
  };
  const tieNote = (trimmed: boolean) => (trimmed ? `Ends cut ${degrees(pitch)} to the roof line.` : 'Square ends.');

  // Loft joists take the place of rafter ties. An open end keeps clear of ties.
  if (!roof.loft.enabled && roof.rafterTies.enabled) {
    const ties = roof.rafterTies;
    const lowerThird = (ridgeTop - plate) / 3;
    if (ties.height > lowerThird) {
      warn(
        'Roof',
        `Rafter ties ${formatInches(ties.height)} above the plate are above the lower third of the roof ` +
          `(${formatInches(lowerThird)}).`,
      );
    }
    const extent = level.span(plate + ties.height);
    commons.forEach((x, index) => {
      if (index % ties.every !== 0 || extent[1] - extent[0] < PLY) return;
      const base = { id: roofIds('RT'), assembly: 'roof', role: 'tie.rafter', size: ties.size } as const;
      members.push(level.piece(base, x + PLY, plate + ties.height, extent, tieNote));
    });
  }

  if (roof.collarTies.enabled) {
    const collar = roof.collarTies;
    const depth = LUMBER[collar.size].width;
    // Auto: at the bottom of the upper third, kept under the ridge board.
    const auto = Math.min(plate + ((ridgeTop - plate) * 2) / 3, ridgeBottom - depth);
    const bottom = collar.height === 'auto' ? auto : plate + collar.height;
    const extent = level.span(bottom);
    if (bottom + depth > ridgeBottom + 1e-9) {
      // Where the ties would be: level at their bottom, across the common rafters.
      const [x0, x1] = commons.length > 0 ? [commons[0], commons[commons.length - 1] + 2 * PLY] : [0, config.length];
      const [y0, y1] = level.span(bottom);
      const outline: Vec3[] = [[x0, y0, bottom], [x1, y0, bottom], [x1, y1, bottom], [x0, y1, bottom]];
      leaveOut('Roof', 'roof', `Collar ties ${formatInches(bottom - plate)} above the plate hit the ridge board. Lower them.`, outline);
    } else if (extent[1] - extent[0] >= PLY) {
      commons.forEach((x, index) => {
        if (index % collar.every !== 0) return;
        const base = { id: roofIds('CT'), assembly: 'roof', role: 'tie.collar', size: collar.size } as const;
        members.push(level.piece(base, x + PLY, bottom, extent, tieNote));
      });
    }
  }

  let deck: Deck | null = null;
  if (roof.loft.enabled) {
    const loft = frameLoft(config, slope, rafters, wallDepth, wallTop, kneeBase !== null, level, warn, leaveOut);
    members.push(...loft.members);
    deck = loft.deck;
  }
  if (kneeBase !== null) members.push(...frameKneeWalls(config, kneeBase));
  return { members, warnings, deck };
}

/** Loft floor joists, open end, and hatches, with the ledgers or rim joists along the eaves, and the deck. */
function frameLoft(
  config: ShedConfig,
  slope: Slope,
  rafters: readonly number[],
  wallDepth: number,
  wallTop: number,
  raised: boolean,
  level: Level,
  warn: Warn,
  leaveOut: LeaveOut,
): { members: Member[]; deck: Deck | null } {
  const { width, length, roof, catalog } = config;
  const { loft } = roof;
  const { pitch } = slope;
  const ids = idMaker('LF');
  const joistDepth = LUMBER[loft.joist].width;
  const hung = loft.support === 'hung';
  // Joists on the plates without knee walls lap the rafters: they stay clear of rafter positions.
  const lapping = !raised && !hung;
  const bottom = hung ? wallTop - joistDepth : wallTop;
  const extent = level.span(bottom, hung ? wallDepth + PLY : raised ? PLY : 0);
  const members: Member[] = [];

  const trimNote = (trimmed: boolean) => (trimmed ? `Ends cut ${degrees(pitch)} to the roof line.` : 'Square ends.');
  const joistNote = (trimmed: boolean) => (hung ? 'Square ends. Joist hangers at both ends.' : trimNote(trimmed));
  const joist = (code: string, role: Role, x: number, span: Span = extent, note = joistNote) =>
    members.push(level.piece({ id: ids(code), assembly: 'loft', role, size: loft.joist }, x, bottom, span, note));

  // Start of `plies` side by side from `from`, moved toward `direction` until clear of the rafters.
  const blocked = lapping ? rafters : [];
  function clear(from: number, plies: number, direction: 1 | -1): number {
    let start = from;
    for (;;) {
      const hit = blocked.find((rafter) => start < rafter + PLY && start + plies * PLY > rafter);
      if (hit === undefined) return start;
      start = direction > 0 ? hit + PLY : hit - plies * PLY;
    }
  }

  // Ends of the floor: a single joist inside the gable studs at a closed end, a doubled edge
  // joist at the open edge.
  const { open } = loft;
  const leftEdge = open.end === 'left' ? clear(open.length, 2, 1) : null;
  const rightEdge = open.end === 'right' ? clear(length - open.length - 2 * PLY, 2, -1) : null;
  const floor: Span = [leftEdge ?? wallDepth, rightEdge === null ? length - wallDepth : rightEdge + 2 * PLY];
  const inner: Span = [leftEdge === null ? wallDepth + PLY : leftEdge + 2 * PLY, rightEdge ?? length - wallDepth - PLY];
  if (inner[1] - inner[0] < PLY) {
    warn('Loft', 'The open end leaves no loft floor.');
    return { members, deck: null };
  }
  const fixed: Span[] = [];
  const place = (code: string, role: Role, x: number) => {
    fixed.push([x, x + PLY]);
    joist(code, role, x);
  };
  if (leftEdge === null) place('J', 'joist.loft', wallDepth);
  else [leftEdge, leftEdge + PLY].forEach((x) => place('E', 'edge.loft', x));
  if (rightEdge === null) place('J', 'joist.loft', length - wallDepth - PLY);
  else [rightEdge, rightEdge + PLY].forEach((x) => place('E', 'edge.loft', x));

  // Hatches: doubled trimmers outside each x edge, doubled headers across each y end, in hangers.
  const hatches: { left: number; right: number; front: number; back: number }[] = [];
  loft.hatches.forEach((hatch, index) => {
    const source = `Hatch ${index + 1}`;
    const left = clear(hatch.x - 2 * PLY, 2, -1);
    const right = clear(hatch.x + hatch.width, 2, 1);
    const front = hatch.y - 2 * PLY; // outer face of the front header
    const back = hatch.y + hatch.depth + 2 * PLY; // outer face of the back header
    const [x1, y1, z] = [hatch.x + hatch.width, hatch.y + hatch.depth, bottom + joistDepth];
    const skip = (message: string) =>
      leaveOut(source, 'loft', message, [[hatch.x, hatch.y, z], [x1, hatch.y, z], [x1, y1, z], [hatch.x, y1, z]]);
    if (left < inner[0] || right + 2 * PLY > inner[1]) {
      skip('The hatch and its trimmers do not fit between the ends of the loft floor.');
      return;
    }
    const tail = Math.min(front - extent[0], extent[1] - back);
    if (tail < NEAR) {
      skip('The hatch headers reach past the ends of the loft joists.');
      return;
    }
    if (hatches.some((other) => left < other.right + 2 * PLY && right + 2 * PLY > other.left)) {
      skip('The hatch overlaps another hatch.');
      return;
    }
    if (lapping && Math.min(slope.bottom(front), slope.bottom(width - back)) < bottom + joistDepth) {
      skip('The hatch headers would hit the rafters. Move the hatch away from the eaves.');
      return;
    }
    if (tail < MIN_TAIL) warn(source, `The shortest tail joist is ${formatInches(tail)} long.`);
    const headerLength = right - left - 2 * PLY;
    if (headerLength > LONG_HEADER) {
      warn(source, `The ${formatInches(headerLength)} hatch headers are longer than 4 ft. Check their size.`);
    }
    hatches.push({ left, right, front, back });
    [left, left + PLY, right, right + PLY].forEach((x) => place('T', 'trimmer.loft', x));
    for (const y of [front, front + PLY, hatch.y + hatch.depth, hatch.y + hatch.depth + PLY]) {
      members.push({
        id: ids('H'),
        assembly: 'loft',
        role: 'header.loft',
        size: loft.joist,
        treated: false,
        length: headerLength,
        origin: [left + 2 * PLY, y, bottom],
        axes: { length: X, width: UP, thick: [0, 1, 0] },
        note: 'Joist hangers at both ends.',
      });
    }
  });

  // Layout joists on o.c. multiples, moved beside a rafter they land on. Between a hatch's
  // trimmers they become tail joists from each header to the eave.
  const tailNote = (trimmed: boolean) =>
    ['Joist hanger at the hatch header.', trimmed ? `Eave end cut ${degrees(pitch)} to the roof line.` : '', hung ? 'Joist hanger at the ledger.' : '']
      .filter(Boolean)
      .join(' ');
  for (let index = 1; index * loft.oc < length; index++) {
    const from = clear(index * loft.oc - PLY / 2, 1, 1);
    if (from < inner[0] || from + PLY > inner[1]) continue;
    if (fixed.some(([low, high]) => from < high && from + PLY > low)) continue;
    const hatch = hatches.find((candidate) => from >= candidate.left + 2 * PLY && from + PLY <= candidate.right);
    if (!hatch) {
      joist('J', 'joist.loft', from);
      continue;
    }
    joist('TJ', 'tail.loft', from, [extent[0], hatch.front], tailNote);
    joist('TJ', 'tail.loft', from, [hatch.back, extent[1]], tailNote);
  }

  // Along the eaves: ledgers for hung joists, under the floor; rim joists under knee walls, full length.
  const centers = members.filter((member) => member.axes.length[1] === 1).map((member) => member.origin[0] + PLY / 2);
  const edge: { code: string; role: Role; y: number; span: Span } | null = hung
    ? { code: 'L', role: 'ledger.loft', y: wallDepth, span: floor }
    : raised
      ? { code: 'R', role: 'rim.loft', y: 0, span: [wallDepth, length - wallDepth] }
      : null;
  if (edge) {
    const maxStock = Math.max(...stockFor(catalog, loft.joist));
    for (const [y, inward] of [[edge.y, 1], [width - edge.y, -1]] as const) {
      for (const [from, to] of splitPlate(edge.span, maxStock, centers)) {
        members.push({
          id: ids(edge.code),
          assembly: 'loft',
          role: edge.role,
          size: loft.joist,
          treated: false,
          length: to - from,
          origin: [from, y, bottom],
          axes: { length: X, width: UP, thick: [0, inward, 0] },
        });
      }
    }
  }
  // Across an open end no joists carry the knee walls' inside edge: more rim plies, face-nailed
  // inside the rim, fill the knee wall's depth to within 1-1/2 in.
  if (raised && !hung) {
    const plies = Math.floor(LUMBER[roof.kneeWalls.stud].width / PLY);
    const open: Span[] = [];
    if (leftEdge !== null) open.push([wallDepth, leftEdge]);
    if (rightEdge !== null) open.push([rightEdge + 2 * PLY, length - wallDepth]);
    for (const [from, to] of open) {
      for (let ply = 1; ply < plies; ply++) {
        for (const [y, inward] of [[ply * PLY, 1], [width - ply * PLY, -1]] as const) {
          members.push({
            id: ids('R'),
            assembly: 'loft',
            role: 'rim.loft',
            size: loft.joist,
            treated: false,
            length: to - from,
            origin: [from, y, bottom],
            axes: { length: X, width: UP, thick: [0, inward, 0] },
            note: 'Under the knee wall across the open end. Face-nail to the rim.',
          });
        }
      }
    }
  }

  // The deck runs over the rims to the outside faces under knee walls, to the walls' inside faces
  // over ledgers, and otherwise stops where the rafter undersides meet its top. An open end keeps
  // a strip under each knee wall.
  const deckBottom = bottom + joistDepth;
  const strips = raised && !hung;
  const kneeDepth = strips ? LUMBER[roof.kneeWalls.stud].width : 0;
  const reach = hung ? wallDepth : raised ? 0 : Math.max(0, slope.seat + (deckBottom + SHEETS[loft.deck].thick - slope.bottom(slope.seat)) / pitch.rise);
  const [from, to] = strips ? [wallDepth, length - wallDepth] : floor;
  const holes: Rect[] = hatches.map(({ left, right, front, back }) => ({ min: [left + 2 * PLY, front + 2 * PLY], max: [right, back - 2 * PLY] }));
  if (strips && leftEdge !== null) holes.push({ min: [from, kneeDepth], max: [leftEdge, width - kneeDepth] });
  if (strips && rightEdge !== null) holes.push({ min: [rightEdge + 2 * PLY, kneeDepth], max: [to, width - kneeDepth] });
  const deck: Deck | null = reach < width / 2 - NEAR ? { bottom: deckBottom, min: [from, reach], max: [to, width - reach], holes } : null;
  return { members, deck };
}

/**
 * A knee wall at each eave, standing at `base`, outside face flush with the wall below, between
 * the gable-end walls; its cap plate laps over their corners. Its height runs from its base to the
 * top of its plates, where the rafters bear. Studs follow the wall layout from each wall's left
 * corner, viewed from outside.
 */
function frameKneeWalls(config: ShedConfig, base: number): Member[] {
  const { width, length, walls, roof, catalog } = config;
  const knee = roof.kneeWalls;
  const plateCount = walls.capPlate ? 3 : 2;
  const studLength = knee.height - PLY * plateCount;
  const maxStock = Math.max(...stockFor(catalog, knee.stud));
  // Between the gable-end walls, which run through to the corners.
  const wallDepth = LUMBER[walls.stud].width;
  const [start, end] = [wallDepth, length - wallDepth];

  const sides = [
    { assembly: 'knee.front', prefix: 'KF', y: 0, inward: 1, toX: (u: number) => u },
    { assembly: 'knee.back', prefix: 'KB', y: width, inward: -1, toX: (u: number) => length - u - PLY },
  ] as const;

  const members: Member[] = [];
  for (const side of sides) {
    const nextId = idMaker(side.prefix);
    const board = (code: string, role: Role, length: number, origin: Vec3, axes: Member['axes']): Member => ({
      id: nextId(code),
      assembly: side.assembly,
      role,
      size: knee.stud,
      treated: false,
      length,
      origin,
      axes,
    });

    // Layout positions (u) from the wall's left corner: an end stud at each end, the rest on o.c.
    const layout = [start, end - PLY];
    for (let index = 1; index * walls.oc < length; index++) {
      const from = index * walls.oc - PLY / 2;
      if (from >= start + PLY && from + PLY <= end - PLY) layout.push(from);
    }
    const studs = layout.map(side.toX).sort((first, second) => first - second);
    for (const x of studs) {
      members.push(board('S', 'stud', studLength, [x, side.y, base + PLY], { length: UP, width: [0, side.inward, 0], thick: X }));
    }

    const centers = studs.map((x) => x + PLY / 2);
    const plateAxes = { length: X, width: [0, side.inward, 0] as Vec3, thick: UP };
    const topPieces = splitPlate([start, end], maxStock, centers);
    const levels: [string, Role, ReturnType<typeof splitPlate>, number][] = [
      ['BP', 'plate.bottom', splitPlate([start, end], maxStock, centers), base],
      ['TP', 'plate.top', topPieces, base + PLY + studLength],
    ];
    if (walls.capPlate) {
      // The cap runs to the building corners, lapping over the gable-end walls' corner plates.
      const avoid = topPieces.slice(1).map(([from]) => from);
      const capPieces = splitPlate([0, length], maxStock, centers, avoid);
      levels.push(['CP', 'plate.cap', capPieces, base + 2 * PLY + studLength]);
    }
    for (const [code, role, pieces, z] of levels) {
      for (const [from, to] of pieces) members.push(board(code, role, to - from, [from, side.y, z], plateAxes));
    }
  }
  return members;
}
