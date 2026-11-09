import { LUMBER, SHEETS, stockLengths, type LumberSize } from '../catalog';
import type { ShedConfig } from '../config';
import type { Member, Point, Vec3, Warning } from '../member';
import { formatInches } from '../units';
import { frameAttic } from './attic';
import { degrees, idMaker, planeMember, type Pitch, type Plane, type Slope } from './section';
import { splitPlate, wallTops } from './walls';

const PLY = 1.5; // thickness of 2x lumber
const MIN_STUD = 3; // a shorter gable stud is left out
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

/** Rafters, ridge, rake ladders, fascia, gable-end framing, and for a gable roof the attic. */
export function frameRoof(config: ShedConfig): { members: Member[]; warnings: Warning[] } {
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
  const maxStock = (size: LumberSize) => Math.max(...stockLengths(config.catalog.stock, size));
  const nextId = idMaker('RF');

  // A section plane at x on a side. Its extrusion covers x to x + 1-1/2.
  const planeAt = (x: number, side: Side): Plane =>
    side.sign === 1 ? { origin: [x, 0, 0], h: [0, 1, 0] } : { origin: [x + PLY, width, 0], h: [0, -1, 0] };

  const rafterOutline = outline(slope, from, to, notches, tailCut, highCut);
  const rafterNote = gable
    ? `Plumb cut ${degrees(pitch)} at the ridge. Birdsmouth: heel line ${formatInches(to / pitch.cos)} ` +
      `from the ridge long point on the top edge; seat ${formatInches(seat)}, heel ${formatInches(pitch.rise * seat)}. ` +
      tailNote(tailCut, eave / pitch.cos)
    : `Birdsmouths on the top edge, ${formatInches(eave / pitch.cos)} and ` +
      `${formatInches((width - wallDepth + eave) / pitch.cos)} from its low end; each seat ${formatInches(seat)}, ` +
      `heel ${formatInches(pitch.rise * seat)}. Both ends ${tailCut === 'plumb' ? `plumb cut ${degrees(pitch)}` : 'square cut'}.`;
  for (const side of sides) {
    for (const x of rafters) {
      const base = { id: nextId('R'), assembly: 'roof', role: 'rafter', size: roof.rafter, note: rafterNote } as const;
      members.push(planeMember(base, planeAt(x, side), rafterOutline, [pitch.cos, pitch.sin]));
    }
  }

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
    members.push(...attic.members);
    warnings.push(...attic.warnings);
  }

  if (rake > 0) {
    const flyOutline = outline(slope, from, to, [], tailCut, highCut);
    const flyNote = gable
      ? `Plumb cut ${degrees(pitch)} at the ridge. No birdsmouth. ${tailNote(tailCut, eave / pitch.cos)}`
      : `No birdsmouth. Both ends ${tailCut === 'plumb' ? `plumb cut ${degrees(pitch)}` : 'square cut'}.`;
    const lookoutLength = rake - PLY;
    for (const side of sides) {
      for (const x of [-rake, length + rake - PLY]) {
        const base = { id: nextId('FR'), assembly: 'roof', role: 'rafter.fly', size: roof.rafter, note: flyNote } as const;
        members.push(planeMember(base, planeAt(x, side), flyOutline, [pitch.cos, pitch.sin]));
      }
      if (lookoutLength < PLY) continue;
      // Lookouts on edge, flush with the rafter tops, evenly spaced from tail to high end. The
      // last stops where its lower corner meets the high end's plumb line.
      const lookoutDepth = LUMBER[roof.rakeLadder.size].width;
      const reach = (to - from) / pitch.cos - PLY - lookoutDepth * pitch.rise;
      const count = Math.max(2, Math.ceil(reach / roof.rakeLadder.spacing) + 1);
      for (let index = 0; index < count; index++) {
        const along = (index * reach) / (count - 1);
        const drawn: Point = [from + along * pitch.cos, slope.top(from) + along * pitch.sin];
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
    const eaves: { y: number; out: 1 | -1 }[] = gable ? [{ y: from, out: -1 }] : [{ y: from, out: -1 }, { y: to, out: 1 }];
    for (const side of sides) {
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

  members.push(...frameGableEnds(config, slope, sides, gable, tops.left, wallDepth, bearingDepth));
  return { members, warnings };
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

/**
 * Gable-end framing on each end wall's plate: a top plate under each end rafter, studs on layout
 * cut to it, and for a gable roof a ridge post under the ridge board.
 */
function frameGableEnds(
  config: ShedConfig,
  slope: Slope,
  sides: Side[],
  gable: boolean,
  plateTop: number,
  wallDepth: number,
  bearingDepth: number,
): Member[] {
  const { width, length, walls, roof } = config;
  const { pitch } = slope;
  const members: Member[] = [];
  const plateThick = PLY / pitch.cos; // plumb thickness of the gable top plate

  // Underside of the gable top plates at real y. A side's map is its own inverse.
  const under = (y: number) => Math.min(...sides.map((side) => slope.bottom(side.map(y)))) - plateThick;
  const ridgeBottom = gable ? slope.top(width / 2 - PLY / 2) - LUMBER[roof.ridge].width : 0;
  const post: [number, number] | null =
    gable && ridgeBottom - plateTop >= MIN_STUD ? [width / 2 - PLY / 2, width / 2 + PLY / 2] : null;

  // Top plate in the drawn section: its top against the end rafter's underside, a plumb cut at the
  // ridge post or the high wall, and a level cut where its underside meets the end-wall plate. On
  // a roof raised by knee walls it stops short of that, with a plumb cut at the knee wall.
  const meet = slope.seat + (plateTop + plateThick - slope.bottom(slope.seat)) / pitch.rise;
  const low = Math.max(meet, bearingDepth);
  const high = gable ? (post ? post[0] : width / 2) : width - wallDepth;
  const highEnd = `${degrees(pitch)} at the ${gable ? 'ridge post' : 'high wall'}`;
  const plateOutline: Point[] =
    meet >= bearingDepth
      ? [[slope.seat, plateTop], [low, plateTop], [high, slope.bottom(high) - plateThick], [high, slope.bottom(high)]]
      : [[low, slope.bottom(low) - plateThick], [high, slope.bottom(high) - plateThick], [high, slope.bottom(high)], [low, slope.bottom(low)]];
  const plateNote =
    meet >= bearingDepth
      ? `Level cut on the wall plate. Plumb cut ${highEnd}.`
      : `Plumb cuts ${degrees(pitch)} at the knee wall and ${highEnd}.`;

  // Each end wall's u runs along it from its left corner, viewed from outside. toY is its own inverse.
  const ends = [
    { assembly: 'gable.left', prefix: 'GL', plane: { origin: [wallDepth, width, 0], h: [0, -1, 0] }, toY: (u: number) => width - u },
    { assembly: 'gable.right', prefix: 'GR', plane: { origin: [length - wallDepth, 0, 0], h: [0, 1, 0] }, toY: (u: number) => u },
  ] as const;

  for (const end of ends) {
    const nextId = idMaker(end.prefix);
    const make = (role: 'plate.gable' | 'post.ridge' | 'stud.gable', code: string, outline: Point[], dir: Point, note: string) =>
      planeMember({ id: nextId(code), assembly: end.assembly, role, size: walls.stud, note }, end.plane, outline, dir, wallDepth);

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
    if (post) {
      const outline: Point[] = [[post[0], plateTop], [post[1], plateTop], [post[1], ridgeBottom], [post[0], ridgeBottom]];
      members.push(make('post.ridge', 'P', outline, [0, 1], 'Square cut.'));
    }
    for (let index = 1; index * walls.oc < width; index++) {
      const near = index * walls.oc - PLY / 2;
      const far = near + PLY;
      const clear = Math.max(wallDepth, bearingDepth);
      if (near < clear || far > width - clear) continue;
      if (post && near < post[1] && far > post[0]) continue;
      const nearTop = under(end.toY(near));
      const farTop = under(end.toY(far));
      if (Math.min(nearTop, farTop) - plateTop < MIN_STUD) continue;
      const outline: Point[] = [[near, plateTop], [far, plateTop], [far, farTop], [near, nearTop]];
      members.push(make('stud.gable', 'S', outline, [0, 1], `Top cut ${degrees(pitch)}.`));
    }
  }
  return members;
}

function tailNote(cut: Cut, run: number): string {
  if (run === 0) return 'No tail.';
  return `Tail ${formatInches(run)} past the heel line on the top edge, ${cut} cut.`;
}

function box(id: string, role: Member['role'], size: LumberSize, length: number, origin: Vec3, axes: Member['axes']): Member {
  return { id, assembly: 'roof', role, size, treated: false, length, origin, axes };
}
