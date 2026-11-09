import { LUMBER, stockLengths } from '../catalog';
import { WALLS, type ShedConfig } from '../config';
import { ASSEMBLIES, type Member, type Role, type Vec3 } from '../member';

export type Wall = (typeof WALLS)[number];
type Span = readonly [number, number];
type Axes = Member['axes'];

const PLY = 1.5; // thickness of a 2x plate or stud
const CAP_SPLICE_OFFSET = 24; // min distance from a cap-plate splice to a top-plate splice
const MIN_PLATE_PIECE = 24; // no short offcut pieces at a plate end
const UP: Vec3 = [0, 0, 1];

// Wall frame: origin at the building corner on the wall's left end, viewed from outside.
// u runs along the wall to the right, v runs inward, z is up.
interface Frame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
}

function frames(width: number, length: number): Record<Wall, Frame> {
  return {
    front: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
    back: { origin: [length, width, 0], u: [-1, 0, 0], v: [0, -1, 0] },
    left: { origin: [0, width, 0], u: [0, -1, 0], v: [1, 0, 0] },
    right: { origin: [length, 0, 0], u: [0, 1, 0], v: [-1, 0, 0] },
  };
}

// Walls at u = 0 and at u = span. Front and back run through; left and right fit between them.
const ADJACENT: Record<Wall, readonly [Wall, Wall]> = {
  front: ['left', 'right'],
  back: ['right', 'left'],
  left: ['back', 'front'],
  right: ['front', 'back'],
};

const isThrough = (wall: Wall) => wall === 'front' || wall === 'back';

function at(frame: Frame, u: number, v: number, z: number): Vec3 {
  return [
    frame.origin[0] + frame.u[0] * u + frame.v[0] * v,
    frame.origin[1] + frame.u[1] * u + frame.v[1] * v,
    z,
  ];
}

/** Stud length of each wall. On a lean-to, the high wall is taller by the roof rise. */
export function studLengths(config: ShedConfig): Record<Wall, number> {
  const { studLength, stud } = config.walls;
  const lengths = { front: studLength, back: studLength, left: studLength, right: studLength };
  if (config.roof.style === 'lean-to') {
    // Full-width seats: the rafter underside meets the low wall's inside top corner and the
    // high wall's outside top corner, which are (width - wall depth) apart.
    lengths[config.roof.highSide] += (config.roof.pitch / 12) * (config.width - LUMBER[stud].width);
  }
  return lengths;
}

/** Plates, corner studs, and layout studs of the four walls. Openings are not cut in. */
export function frameWalls(config: ShedConfig): Member[] {
  const heights = studLengths(config);
  const frame = frames(config.width, config.length);
  return WALLS.flatMap((wall) => frameWall(config, wall, frame[wall], heights));
}

function frameWall(config: ShedConfig, wall: Wall, frame: Frame, heights: Record<Wall, number>): Member[] {
  const { walls } = config;
  const assembly = `wall.${wall}` as const;
  const { prefix } = ASSEMBLIES[assembly];
  const depth = LUMBER[walls.stud].width;
  const through = isThrough(wall);
  const span = through ? config.length : config.width;
  const start = through ? 0 : depth;
  const end = span - start;
  const studLength = heights[wall];

  const members: Member[] = [];
  const occupied: Span[] = [];
  const centers: number[] = [];
  const counts = new Map<string, number>();

  function add(code: string, role: Role, length: number, origin: Vec3, axes: Axes, treated = false) {
    const count = (counts.get(code) ?? 0) + 1;
    counts.set(code, count);
    const id = `${prefix}-${code}${String(count).padStart(2, '0')}`;
    members.push({ id, assembly, role, size: walls.stud, treated, length, origin, axes });
  }

  function upright(role: Role, from: number) {
    occupied.push([from, from + PLY]);
    centers.push(from + PLY / 2);
    add(role === 'corner' ? 'C' : 'S', role, studLength, at(frame, from, 0, PLY), {
      length: UP,
      width: frame.v,
      thick: frame.u,
    });
  }

  // California corner backing: turned flat on the inside edge of the end stud.
  function flat(from: number) {
    occupied.push([from, from + depth]);
    add('C', 'corner', studLength, at(frame, from, depth - PLY, PLY), {
      length: UP,
      width: frame.u,
      thick: frame.v,
    });
  }

  function plate(code: string, role: Role, [from, to]: Span, z: number, treated = false) {
    add(code, role, to - from, at(frame, from, 0, z), { length: frame.u, width: frame.v, thick: UP }, treated);
  }

  // Start positions of a piece `size` long, `inset` from each end of the wall.
  const bothEnds = (inset: number, size: number) => [inset, span - inset - size];

  if (through) {
    bothEnds(0, PLY).forEach((from) => upright('corner', from));
    if (walls.corner === 'four-stud') {
      // Solid post: end, middle, and backing studs face-nailed.
      bothEnds(PLY, PLY).forEach((from) => upright('corner', from));
      bothEnds(2 * PLY, PLY).forEach((from) => upright('corner', from));
    }
    // Backing stud just past the end wall's inside face.
    if (walls.corner === 'three-stud') bothEnds(depth, PLY).forEach((from) => upright('corner', from));
    if (walls.corner === 'california') bothEnds(PLY, depth).forEach(flat);
  } else {
    bothEnds(depth, PLY).forEach((from) => upright('corner', from));
  }

  // Layout from the building corner, so sheet edges land on stud centers.
  for (let index = 1; index * walls.oc < span; index++) {
    const from = index * walls.oc - PLY / 2;
    if (from < start || from + PLY > end) continue;
    if (occupied.some(([low, high]) => from < high && from + PLY > low)) continue;
    upright('stud', from);
  }

  const maxStock = Math.max(...stockLengths(config.catalog.stock, walls.stud));
  const onSlab = config.foundation.type === 'slab';
  splitPlate([start, end], maxStock, centers).forEach((piece) =>
    plate(onSlab ? 'SL' : 'BP', onSlab ? 'plate.sill' : 'plate.bottom', piece, 0, onSlab),
  );
  const topPieces = splitPlate([start, end], maxStock, centers);
  topPieces.forEach((piece) => plate('TP', 'plate.top', piece, PLY + studLength));

  if (walls.capPlate) {
    // At a level corner the end-wall cap runs to the building corner over the through-wall top
    // plate, and the through-wall cap stops short. At a step in height neither cap laps.
    const capInset = (other: Wall) => {
      const level = heights[other] === studLength;
      if (through) return level ? depth : 0;
      return level ? 0 : depth;
    };
    const [near, far] = ADJACENT[wall];
    const capFrom = capInset(near);
    const capTo = span - capInset(far);
    const topSplices = topPieces.slice(1).map(([from]) => from);
    splitPlate([capFrom, capTo], maxStock, centers, topSplices).forEach((piece) =>
      plate('CP', 'plate.cap', piece, 2 * PLY + studLength),
    );
  }

  return members;
}

/**
 * Split a plate into stock-length pieces, with each splice on a stud center and clear of the
 * `avoid` positions. Leaves one long piece when no legal splice exists.
 */
function splitPlate([start, end]: Span, maxLength: number, studCenters: number[], avoid: number[] = []): Span[] {
  const pieces: Span[] = [];
  let from = start;
  while (end - from > maxLength) {
    const legal = studCenters.filter(
      (joint) =>
        joint - from >= MIN_PLATE_PIECE &&
        joint - from <= maxLength &&
        end - joint >= MIN_PLATE_PIECE &&
        avoid.every((other) => Math.abs(joint - other) >= CAP_SPLICE_OFFSET),
    );
    if (legal.length === 0) break;
    const joint = Math.max(...legal);
    pieces.push([from, joint]);
    from = joint;
  }
  pieces.push([from, end]);
  return pieces;
}
