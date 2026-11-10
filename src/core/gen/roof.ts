import { LUMBER, SHEETS, stockFor, type LumberSize } from '../catalog';
import { extensionSides, type ShedConfig } from '../config';
import type { Assembly, Member, Point, Role, Vec3, Warning } from '../member';
import { roOffset } from '../placement';
import { formatInches } from '../units';
import { frameAttic, type Deck } from './attic';
import { degrees, idMaker, planeMember, type Pitch, type Plane, type Slope } from './section';
import {
  headerOf,
  inGable,
  openingBoards,
  openingZone,
  placements,
  resolveHeader,
  splitPlate,
  wallFrames,
  wallTops,
  type FittedOpening,
  type Placed,
  type RoughOpening,
  type Wall,
} from './walls';

const PLY = 1.5; // thickness of 2x lumber
const MIN_STUD = 3; // a shorter gable stud or cripple is left out
const NEAR = 0.01;
const X: Vec3 = [1, 0, 0];
const UP: Vec3 = [0, 0, 1];
const DOWN: Vec3 = [0, 0, -1];

// Puts the drawn section on one side of the building: real y = map(drawn y).
interface Side {
  map: (y: number) => number;
  sign: 1 | -1;
}

type Cut = 'plumb' | 'square';
interface Notch {
  heel: number; // y of the birdsmouth's plumb face
}

/**
 * The rafter tops of one roof side, where the sheathing lies: from the lower edge over the fascia
 * up to the ridge line or over the high fascia, rake edge to rake edge. u × v points out of the roof.
 */
export interface RoofPlane {
  assembly: Assembly; // whose rafters carry it
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  length: number; // along u
  width: number; // along v, up the slope
  eaves: number; // edges along u that take drip edge
  sheathed: boolean; // false: metal roofing on purlins
}

/** The underside of the main roof outside a wall: what a lean-to roof must stay under. */
export interface Soffit {
  /** Height `x` outside the wall's face at `u` along it, or null past the roof's edge. */
  under: (wall: Wall, u: number, x: number) => number | null;
  /** Distances out from the wall's face where `under` changes course, nearest first. */
  breaks: (wall: Wall) => number[];
}

/** Rafters, ridge, rake ladders, fascia, gable-end framing, and for a gable roof the attic. */
export function frameRoof(config: ShedConfig): {
  members: Member[];
  warnings: Warning[];
  planes: RoofPlane[];
  openings: RoughOpening[];
  rafterSpan: number; // horizontal clear span between bearings, or from the bearing to the ridge board
  deck: Deck | null; // the loft deck
  soffit: Soffit;
  // At a downhill eave's wall: the rafter top over the outside face, the bearing plate's top, and
  // the bearing depth. Roof extensions start here.
  eave: { top: number; plate: number; bearing: number };
} {
  const { roof, walls, width, length } = config;
  const members: Member[] = [];
  const warnings: Warning[] = [];
  const warn = (message: string) => warnings.push({ source: 'Roof', message });

  const tops = wallTops(config);
  const wallDepth = LUMBER[walls.stud].width;
  const angle = Math.atan(roof.pitch / 12);
  const pitch: Pitch = { rise: roof.pitch / 12, cos: Math.cos(angle), sin: Math.sin(angle), degrees: (angle * 180) / Math.PI };
  const depth = LUMBER[roof.rafter].width;
  const gable = roof.style === 'gable';
  const lowWall = gable || roof.highSide === 'back' ? 'front' : 'back';
  // Knee walls in a gable roof's loft raise the roof: the rafters bear on them. They stand on the
  // deck over joists on the plates, or on the wall top when the joists hang between ledgers.
  const raised = gable && roof.loft.enabled && roof.kneeWalls.enabled;
  const kneeBase =
    roof.loft.support === 'hung'
      ? tops.front
      : tops.front + LUMBER[roof.loft.joist].width + SHEETS[roof.loft.deck].thick;
  const bearingDepth = raised ? LUMBER[roof.kneeWalls.stud].width : wallDepth;
  const seat = seatLength(depth, bearingDepth, pitch, warn);
  const plate = raised ? kneeBase + roof.kneeWalls.height : tops[lowWall];
  const plumb = depth / pitch.cos;
  const slope: Slope = {
    pitch,
    depth,
    seat,
    bottom: (y) => plate + pitch.rise * (y - seat),
    top: (y) => plate + pitch.rise * (y - seat) + plumb,
  };

  const front: Side = { map: (y) => y, sign: 1 };
  const back: Side = { map: (y) => width - y, sign: -1 };
  const sides = gable ? [front, back] : [lowWall === 'front' ? front : back];

  // Drawn extent of a rafter, and its cuts.
  const eave = roof.eaveOverhang;
  const from = -eave;
  const to = gable ? width / 2 - PLY / 2 : width + eave;
  // A square cut needs the overhang to reach past the cut's lower corner.
  const tailCut: Cut = roof.tailCut === 'square' && eave >= depth * pitch.sin ? 'square' : 'plumb';
  if (roof.tailCut === 'square' && tailCut === 'plumb') {
    warn(`A square tail cut needs ${formatInches(depth * pitch.sin)} of eave overhang. The tails are plumb cut.`);
  }
  const highCut: Cut = gable ? 'plumb' : tailCut;
  const notches: Notch[] = gable ? [{ heel: 0 }] : [{ heel: 0 }, { heel: width - wallDepth }];

  const rake = roof.rakeOverhang >= PLY ? roof.rakeOverhang : 0;
  const ends: [number, number] = [-rake, length + rake];
  const rafters = rafterStarts(length, roof.oc);
  const centers = rafters.map((x) => x + PLY / 2);
  const maxStock = (size: LumberSize) => Math.max(...stockFor(config.catalog, size));
  const nextId = idMaker('RF');

  // A section plane at x on a side. Its extrusion covers x to x + 1-1/2.
  const planeAt = (x: number, side: Side): Plane =>
    side.sign === 1 ? { origin: [x, 0, 0], h: [0, 1, 0] } : { origin: [x + PLY, width, 0], h: [0, -1, 0] };

  // A roof extension takes over a side's low eave: there the rafters stop, plumb cut, at the wall's
  // outside face. The side's own drawn eave is its low end.
  const extended = extensionSides(config.additions);
  const isExtended = (side: Side) => extended.has(side.sign === 1 ? 'front' : 'back');
  const lowEnd = (side: Side) => (isExtended(side) ? 0 : from);
  const lowCut = (side: Side): Cut => (isExtended(side) ? 'plumb' : tailCut);
  const tailText = (side: Side) =>
    isExtended(side) ? 'No tail: plumb cut at the wall line, under the lean-to rafter beside it.' : tailNote(tailCut, eave / pitch.cos);
  const rafterNote = (side: Side) => {
    const run = -lowEnd(side);
    return gable
      ? `Plumb cut ${degrees(pitch)} at the ridge. Birdsmouth: heel line ${formatInches(to / pitch.cos)} ` +
          `from the ridge long point on the top edge; seat ${formatInches(seat)}, heel ${formatInches(pitch.rise * seat)}. ` +
          tailText(side)
      : `Birdsmouths on the top edge, ${formatInches(run / pitch.cos)} and ` +
          `${formatInches((width - wallDepth + run) / pitch.cos)} from its low end; each seat ${formatInches(seat)}, ` +
          `heel ${formatInches(pitch.rise * seat)}. Both ends ${tailCut === 'plumb' ? `plumb cut ${degrees(pitch)}` : 'square cut'}.`;
  };
  for (const side of sides) {
    const rafterOutline = outline(slope, lowEnd(side), to, notches, lowCut(side), highCut);
    for (const x of rafters) {
      const base = { id: nextId('R'), assembly: 'roof', role: 'rafter', size: roof.rafter, note: rafterNote(side) } as const;
      members.push(planeMember(base, planeAt(x, side), rafterOutline, [pitch.cos, pitch.sin]));
    }
  }

  let deck: Deck | null = null;
  if (gable) {
    const ridgeTop = slope.top(to);
    const ridgeDepth = LUMBER[roof.ridge].width;
    if (ridgeDepth < plumb) {
      warn(`The ridge board (${roof.ridge}) is shallower than the rafter plumb cut (${formatInches(plumb)}).`);
    }
    for (const [start, end] of splitPlate(ends, maxStock(roof.ridge), centers)) {
      members.push(box(nextId('RB'), 'ridge', roof.ridge, end - start, [start, width / 2 - PLY / 2, ridgeTop - ridgeDepth], {
        length: X,
        width: UP,
        thick: [0, 1, 0],
      }));
    }
    const attic = frameAttic(config, slope, rafters, ridgeTop - ridgeDepth, wallDepth, tops.front, raised ? kneeBase : null);
    deck = attic.deck;
    members.push(...attic.members);
    warnings.push(...attic.warnings);
  }

  if (rake > 0) {
    const flyNote = (side: Side) =>
      gable
        ? `Plumb cut ${degrees(pitch)} at the ridge. No birdsmouth. ${tailText(side)}`
        : `No birdsmouth. Both ends ${tailCut === 'plumb' ? `plumb cut ${degrees(pitch)}` : 'square cut'}.`;
    const lookoutLength = rake - PLY;
    for (const side of sides) {
      const start = lowEnd(side);
      const flyOutline = outline(slope, start, to, [], lowCut(side), highCut);
      for (const x of [-rake, length + rake - PLY]) {
        const base = { id: nextId('FR'), assembly: 'roof', role: 'rafter.fly', size: roof.rafter, note: flyNote(side) } as const;
        members.push(planeMember(base, planeAt(x, side), flyOutline, [pitch.cos, pitch.sin]));
      }
      if (lookoutLength < PLY) continue;
      // Lookouts on edge, flush with the rafter tops, evenly spaced from the tail up to where a
      // lookout's lower corner meets the high end's plumb line. On a gable roof the ridge board,
      // which runs out to the fly rafters, is the top rung, so no lookout goes there.
      const lookoutDepth = LUMBER[roof.rakeLadder.size].width;
      const reach = (to - start) / pitch.cos - PLY - lookoutDepth * pitch.rise;
      const gaps = Math.max(1, Math.ceil(reach / roof.rakeLadder.spacing));
      for (let index = 0; index < (gable ? gaps : gaps + 1); index++) {
        const along = (index * reach) / gaps;
        const drawn: Point = [start + along * pitch.cos, slope.top(start) + along * pitch.sin];
        for (const x of [-rake + PLY, length]) {
          members.push(box(nextId('LO'), 'lookout', roof.rakeLadder.size, lookoutLength, [x, side.map(drawn[0]), drawn[1]], {
            length: X,
            width: [0, side.sign * pitch.sin, -pitch.cos],
            thick: [0, side.sign * pitch.cos, pitch.sin],
          }));
        }
      }
    }
  }

  if (roof.fascia !== 'none') {
    const fasciaSize = roof.fascia;
    for (const side of sides) {
      const eaves: { y: number; out: 1 | -1 }[] = [
        ...(isExtended(side) ? [] : [{ y: from, out: -1 as const }]),
        ...(gable ? [] : [{ y: to, out: 1 as const }]),
      ];
      for (const { y, out } of eaves) {
        const axes =
          tailCut === 'plumb'
            ? { length: X, width: DOWN, thick: [0, out * side.sign, 0] as Vec3 }
            : {
                length: X,
                width: [0, side.sign * pitch.sin, -pitch.cos] as Vec3,
                thick: [0, out * side.sign * pitch.cos, out * pitch.sin] as Vec3,
              };
        for (const [start, end] of splitPlate(ends, maxStock(fasciaSize), centers)) {
          members.push(box(nextId('FA'), 'fascia', fasciaSize, end - start, [start, side.map(y), slope.top(y)], axes));
        }
      }
    }
  }

  const gableEnds = frameGableEnds(config, slope, sides, gable, tops.left, wallDepth, bearingDepth, raised, warnings);
  members.push(...gableEnds.members);

  // The fascia thickness, measured along the slope. An extended side's sheathing stops at the wall
  // line, where the extension's takes over.
  const fasciaRun = roof.fascia === 'none' ? 0 : LUMBER[roof.fascia].thick / (tailCut === 'plumb' ? pitch.cos : 1);
  const planes = sides.map((side): RoofPlane => {
    const lowRun = isExtended(side) ? 0 : fasciaRun;
    const lowEdge: Point = [lowEnd(side) - lowRun * pitch.cos, slope.top(lowEnd(side)) - lowRun * pitch.sin];
    const slopeLength = (gable ? (width / 2 - lowEnd(side)) / pitch.cos : (to - lowEnd(side)) / pitch.cos + fasciaRun) + lowRun;
    return {
      assembly: 'roof',
      eaves: (gable ? 0 : 1) + (isExtended(side) ? 0 : 1),
      sheathed: true,
      origin: [side.sign === 1 ? ends[0] : ends[1], side.map(lowEdge[0]), lowEdge[1]],
      u: [side.sign, 0, 0],
      v: [0, side.sign * pitch.cos, pitch.sin],
      length: ends[1] - ends[0],
      width: slopeLength,
    };
  });
  const rafterSpan = (gable ? to : width - wallDepth) - seat;

  // Rafter underside over real y, from whichever side covers it.
  const rafterUnder = (y: number) => Math.min(...sides.map((side) => slope.bottom(side.map(y))));
  const [fasciaThick, fasciaDepth] = roof.fascia === 'none' ? [0, 0] : [LUMBER[roof.fascia].thick, LUMBER[roof.fascia].width];
  const soffit: Soffit = {
    under: (wall, u, x) => {
      if (wall === 'left' || wall === 'right') {
        // Over a gable end the end rafter, lookouts, and fly rafter: the rafter line is the lowest.
        return x <= rake + NEAR ? rafterUnder(wall === 'left' ? width - u : u) : null;
      }
      const y = (eaveOut: number) => (wall === 'front' ? -eaveOut : width + eaveOut);
      if (x <= eave + NEAR) return rafterUnder(y(x));
      // The fascia's bottom edge, hung from the rafter top at the tail.
      if (x <= eave + fasciaThick + NEAR) return rafterUnder(y(eave)) + plumb - fasciaDepth;
      return null;
    },
    breaks: (wall) => (wall === 'left' || wall === 'right' ? [0, rake] : [0, eave, eave + fasciaThick]),
  };
  return { members, warnings, planes, openings: gableEnds.openings, rafterSpan, deck, soffit, eave: { top: slope.top(0), plate, bearing: bearingDepth } };
}

// Seat the full wall depth, shortened so the notch is no deeper than 1/3 of the rafter depth,
// measured square to the edge. Bearing stays at least 1-1/2 in.
function seatLength(depth: number, wallDepth: number, pitch: Pitch, warn: (message: string) => void): number {
  const limit = Math.floor((depth / 3 / pitch.sin) * 16) / 16;
  const seat = Math.min(wallDepth, limit);
  if (seat >= PLY) return seat;
  warn(
    `A 1-1/2 in seat cuts the birdsmouth deeper than 1/3 of the ${formatInches(depth)} rafter depth. ` +
      'Use a deeper rafter or a lower pitch.',
  );
  return PLY;
}

// Rafter outline in the drawn section: low end, along the bottom edge through each birdsmouth,
// high end, then back along the top edge.
function outline(slope: Slope, from: number, to: number, notches: Notch[], lowCut: Cut, highCut: Cut): Point[] {
  const { bottom, top, depth, pitch, seat } = slope;
  const lowTop: Point = [from, top(from)];
  const lowBottom: Point =
    lowCut === 'plumb' ? [from, bottom(from)] : [from + depth * pitch.sin, top(from) - depth * pitch.cos];
  const highTop: Point = [to, top(to)];
  const highBottom: Point =
    highCut === 'plumb' ? [to, bottom(to)] : [to + depth * pitch.sin, top(to) - depth * pitch.cos];
  const path: Point[] = [lowBottom];
  for (const { heel } of notches) {
    const level = bottom(heel + seat);
    path.push([heel, bottom(heel)], [heel, level], [heel + seat, level]);
  }
  path.push(highBottom, highTop, lowTop);
  return path;
}

// Start x of each rafter: one flush with each gable end, the rest centered on o.c. multiples.
function rafterStarts(length: number, oc: number): number[] {
  const starts = [0, length - PLY];
  for (let index = 1; index * oc < length; index++) {
    const start = index * oc - PLY / 2;
    if (start >= PLY && start + PLY <= length - PLY) starts.push(start);
  }
  return starts.sort((first, second) => first - second);
}

type Span = readonly [number, number];

// Where gable openings may go on one end wall, in its frame.
interface GableRoom {
  plateTop: number; // the gable framing stands on the end-wall plate here
  clear: number; // from each eave to the first place a gable stud may stand
  span: number;
  top: (u: number) => number; // underside of the gable top plates
  post: Span | null;
}

function fitGableOpening(
  { label, type, row, position }: Placed,
  walls: ShedConfig['walls'],
  room: GableRoom,
  others: readonly FittedOpening[],
  warn: (message: string) => void,
): FittedOpening | null {
  const offset = roOffset(row.along, position, room.span, type.width);
  const { jacks, side, zone } = openingZone(type, offset, walls);
  const overlaps = ([low, high]: Span) => low < zone[1] && high > zone[0];
  if (zone[0] < room.clear || zone[1] > room.span - room.clear) {
    warn(`The framing runs past the gable. The king and jacks need ${formatInches(side)} on each side of the RO.`);
    return null;
  }
  if (others.some((other) => overlaps(other.zone))) {
    warn('The framing overlaps another opening.');
    return null;
  }
  const { post } = room;
  if (post && overlaps(post) && (post[0] < offset || post[1] > offset + type.width)) {
    warn('The kings or jacks land on the ridge post. Move the opening.');
    return null;
  }
  const header = resolveHeader(type, walls);
  if (header.style !== 'flat' && header.plies * LUMBER[header.size].thick > LUMBER[walls.stud].width) {
    warn(`${header.plies} plies of ${header.size} are thicker than the wall.`);
    return null;
  }
  const roTop = row.sill + type.height;
  // The gable top plates are lowest over the header's outer ends.
  const clearance = Math.min(room.top(zone[0] + PLY), room.top(zone[1] - PLY));
  if (roTop + header.depth > clearance) {
    warn(
      `The header does not fit. RO top ${formatInches(roTop)} plus ${formatInches(header.depth)} of header ` +
        `is above the gable top plate at ${formatInches(clearance)}.`,
    );
    return null;
  }
  let sillBottom: number | null = null;
  if (row.sill > room.plateTop + NEAR) {
    sillBottom = row.sill - walls.sillPlies * PLY;
    if (sillBottom < room.plateTop - NEAR) {
      warn('The rough sill is below the top of the end-wall plate.');
      return null;
    }
  }
  return { label, type, offset, sill: row.sill, jacks, zone, roTop, header, sillBottom };
}

/**
 * Gable-end framing on each end wall's plate: a top plate under each end rafter, studs on layout
 * cut to it, and for a gable roof a ridge post under the ridge board. Openings with their sill at
 * or above the end-wall top frame here, as in a wall.
 */
function frameGableEnds(
  config: ShedConfig,
  slope: Slope,
  sides: Side[],
  gable: boolean,
  plateTop: number,
  wallDepth: number,
  bearingDepth: number,
  raised: boolean,
  warnings: Warning[],
): { members: Member[]; openings: RoughOpening[] } {
  const { width, length, walls, roof } = config;
  const { pitch } = slope;
  const members: Member[] = [];
  const openings: RoughOpening[] = [];
  const placed = placements(config).filter(({ row }) => inGable(config, row));
  const frames = wallFrames(width, length);
  const topCut = `Top cut ${degrees(pitch)}.`;
  const plateThick = PLY / pitch.cos; // plumb thickness of the gable top plate

  // Underside of the gable top plates at real y. A side's map is its own inverse.
  const under = (y: number) => Math.min(...sides.map((side) => slope.bottom(side.map(y)))) - plateThick;
  const ridgeBottom = gable ? slope.top(width / 2 - PLY / 2) - LUMBER[roof.ridge].width : 0;
  const post: Span | null = gable && ridgeBottom - plateTop >= MIN_STUD ? [width / 2 - PLY / 2, width / 2 + PLY / 2] : null;

  // Top plate in the drawn section: its top against the end rafter's underside and a plumb cut at
  // the ridge post or the high wall. Its low end has a level cut where its underside meets the
  // plate below, or a plumb cut. On a roof raised by knee walls the gable end runs through to the
  // corners, and a level corner plate at each eave lines up with the knee wall's top plate. The
  // knee wall's cap plate laps over it, as at a wall corner, and the end rafter seats on the lap.
  // The top plate then starts at the knee wall's inside face, plumb against the lap.
  const base = slope.bottom(slope.seat); // where the rafters bear
  const cornerTop = raised && walls.capPlate ? base - PLY : base;
  const support = raised ? cornerTop : plateTop;
  const meet = slope.seat + (support + plateThick - base) / pitch.rise;
  const low = raised ? (walls.capPlate ? Math.max(slope.seat, bearingDepth) : slope.seat) : Math.max(meet, bearingDepth);
  const levelCut = raised ? slope.bottom(low) - plateThick < support : meet >= bearingDepth;
  const cornerLength = Math.max(bearingDepth + PLY, levelCut ? meet : low);
  const clear = raised ? cornerLength : Math.max(wallDepth, bearingDepth); // eave corners: no layout studs
  const high = gable ? (post ? post[0] : width / 2) : width - wallDepth;
  const highEnd = `${degrees(pitch)} at the ${gable ? 'ridge post' : 'high wall'}`;
  const plateOutline: Point[] = levelCut
    ? [[raised ? low : slope.seat, support], [meet, support], [high, slope.bottom(high) - plateThick], [high, slope.bottom(high)], [low, slope.bottom(low)]]
    : [[low, slope.bottom(low) - plateThick], [high, slope.bottom(high) - plateThick], [high, slope.bottom(high)], [low, slope.bottom(low)]];
  const lowEndNote = raised
    ? `${walls.capPlate ? "Plumb cut against the knee wall's cap plate, level" : 'Level'} cut on the corner plate`
    : 'Level cut on the wall plate';
  const plateNote = levelCut
    ? `${lowEndNote}. Plumb cut ${highEnd}.`
    : `Plumb cuts ${degrees(pitch)} at the ${raised ? 'knee wall' : "eave wall's inside face"} and ${highEnd}.`;
  const cornerNote = walls.capPlate ? "Level, under the knee wall's cap plate, which laps over it." : "Level, under the gable-end rafter's seat.";

  // Each end wall's u runs along it from its left corner, viewed from outside. toY is its own inverse.
  const ends = [
    { wall: 'left', assembly: 'gable.left', prefix: 'GL', plane: { origin: [wallDepth, width, 0], h: [0, -1, 0] }, toY: (u: number) => width - u },
    { wall: 'right', assembly: 'gable.right', prefix: 'GR', plane: { origin: [length - wallDepth, 0, 0], h: [0, 1, 0] }, toY: (u: number) => u },
  ] as const;

  for (const end of ends) {
    const nextId = idMaker(end.prefix);
    const make = (role: Role, code: string, outline: Point[], dir: Point, note: string) =>
      planeMember({ id: nextId(code), assembly: end.assembly, role, size: walls.stud, note }, end.plane, outline, dir, wallDepth);
    const top = (u: number) => under(end.toY(u));
    // A 1-1/2 in column from `bottom` up to the gable top plates, or up to `to` with a square cut.
    const column = (from: number, bottom: number, to?: number): Point[] =>
      to === undefined
        ? [[from, bottom], [from + PLY, bottom], [from + PLY, top(from + PLY)], [from, top(from)]]
        : [[from, bottom], [from + PLY, bottom], [from + PLY, to], [from, to]];

    const room: GableRoom = { plateTop, clear, span: width, top, post };
    const fitted: FittedOpening[] = [];
    for (const candidate of placed.filter(({ row }) => row.wall === end.wall)) {
      const fit = fitGableOpening(candidate, walls, room, fitted, (message) => warnings.push({ source: candidate.label, message }));
      if (fit) fitted.push(fit);
    }
    for (const fit of fitted) {
      const { type, offset, sill, jacks, zone, roTop, header } = fit;
      openings.push({ wall: end.wall, name: type.name, left: offset, right: offset + type.width, bottom: sill, top: roTop, header: headerOf(header) });
      for (const from of [zone[0], zone[1] - PLY]) members.push(make('king', 'K', column(from, plateTop), [0, 1], topCut));
      for (let index = 1; index <= jacks; index++) {
        for (const from of [offset - index * PLY, offset + type.width + (index - 1) * PLY]) {
          members.push(make('jack', 'J', column(from, plateTop, roTop), [0, 1], 'Square cut.'));
        }
      }
      for (const board of openingBoards(frames[end.wall], walls, fit)) {
        const { code, ...rest } = board;
        members.push({ id: nextId(code), assembly: end.assembly, treated: false, ...rest });
      }
    }
    // Inside an opening, a layout position takes cripples above the header and below the rough
    // sill. Above the header, the ridge post keeps its square cut under the ridge board.
    const cripples = (fit: FittedOpening, from: number, ridge: boolean) => {
      const headerTop = fit.roTop + fit.header.depth;
      if (ridge && ridgeBottom - headerTop >= MIN_STUD) {
        members.push(make('post.ridge', 'P', column(from, headerTop, ridgeBottom), [0, 1], 'Square cut.'));
      }
      if (!ridge && Math.min(top(from), top(from + PLY)) - headerTop >= MIN_STUD) {
        members.push(make('cripple', 'CR', column(from, headerTop), [0, 1], topCut));
      }
      if (fit.sillBottom !== null && fit.sillBottom - plateTop >= MIN_STUD) {
        members.push(make('cripple', 'CR', column(from, plateTop, fit.sillBottom), [0, 1], 'Square cut.'));
      }
    };
    const inside = (from: number) => fitted.find(({ offset, type }) => from >= offset - NEAR && from + PLY <= offset + type.width + NEAR);
    const blocked = (from: number) => fitted.some(({ zone }) => from < zone[1] && from + PLY > zone[0]);

    if (low < high) {
      for (const side of sides) {
        const toPlane = ([y, z]: Point): Point => [end.toY(side.map(y)), z];
        // Length runs along the plate's underside, low end to high end.
        const start = toPlane([low, slope.bottom(low) - plateThick]);
        const finish = toPlane([high, slope.bottom(high) - plateThick]);
        const dir: Point = [finish[0] - start[0], finish[1] - start[1]];
        members.push(make('plate.gable', 'TP', plateOutline.map(toPlane), dir, plateNote));
      }
    }
    // At each eave corner: the corner plate, on an end stud and a stud at the knee wall's inside face.
    if (raised) {
      for (const side of sides) {
        const toPlane = ([y, z]: Point): Point => [end.toY(side.map(y)), z];
        const corner: Point[] = [[0, cornerTop - PLY], [cornerLength, cornerTop - PLY], [cornerLength, cornerTop], [0, cornerTop]];
        const [first, second] = [toPlane(corner[0]), toPlane(corner[1])];
        members.push(make('plate.gable', 'CP', corner.map(toPlane), [second[0] - first[0], 0], cornerNote));
        for (const from of [0, bearingDepth]) {
          const stud: Point[] = [[from, plateTop], [from + PLY, plateTop], [from + PLY, cornerTop - PLY], [from, cornerTop - PLY]];
          members.push(make('stud.gable', 'S', stud.map(toPlane), [0, 1], 'Square cut. Under the corner plate.'));
        }
      }
    }
    if (post) {
      const fit = inside(post[0]);
      if (fit) cripples(fit, post[0], true);
      else members.push(make('post.ridge', 'P', column(post[0], plateTop, ridgeBottom), [0, 1], 'Square cut.'));
    }
    for (let index = 1; index * walls.oc < width; index++) {
      const near = index * walls.oc - PLY / 2;
      const far = near + PLY;
      if (near < clear || far > width - clear) continue;
      if (post && near < post[1] && far > post[0]) continue;
      const fit = inside(near);
      if (fit) cripples(fit, near, false);
      if (blocked(near)) continue;
      if (Math.min(top(near), top(far)) - plateTop < MIN_STUD) continue;
      members.push(make('stud.gable', 'S', column(near, plateTop), [0, 1], topCut));
    }
  }
  return { members, openings };
}

function tailNote(cut: Cut, run: number): string {
  if (run === 0) return 'No tail.';
  return `Tail ${formatInches(run)} past the heel line on the top edge, ${cut} cut.`;
}

function box(id: string, role: Member['role'], size: LumberSize, length: number, origin: Vec3, axes: Member['axes']): Member {
  return { id, assembly: 'roof', role, size, treated: false, length, origin, axes };
}
