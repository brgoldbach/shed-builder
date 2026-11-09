import { LUMBER, SHEETS } from '../catalog';
import { WALLS, type ShedConfig } from '../config';
import { ASSEMBLIES, corners, type Member, type Point, type Solid, type Vec3 } from '../member';
import type { RoofPlane } from './roof';
import { clipBelow, hull, idMaker } from './section';
import { ADJACENT, wallFrames, type Frame, type RoughOpening, type Wall } from './walls';

const SHEET_WIDTH = 48;
const SHEET_LENGTH = 96;
const MIN_PIECE = 12; // a row does not end in a narrower piece when a joint can avoid it
const MIN_STRIP = 3; // a lower strip at the top of a wall is left off: the sheets end on the top plates
const NEAR = 0.01;
const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const UP: Vec3 = [0, 0, 1];

type Span = readonly [number, number];
interface Rect {
  min: Point;
  max: Point;
}

// A surface to sheathe, in its own (u, v) plane coordinates. Panels extrude along u × v.
interface Face {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  region: Point[]; // convex, counterclockwise
  supports: number[]; // u of the framing that sheet joints land on
  holes: Rect[];
  along: number; // sheet size along u
  across: number; // sheet size along v
  stagger: boolean; // odd rows start with a half sheet
  minRow: number; // a piece lower than this is left off
}

const dot = (first: Vec3, second: Vec3) => first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
const minus = (first: Vec3, second: Vec3): Vec3 => [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
const rectangle = (length: number, width: number): Point[] => [[0, 0], [length, 0], [length, width], [0, width]];
const distinct = (values: number[]) =>
  [...values].sort((first, second) => first - second).filter((value, index, sorted) => index === 0 || value - sorted[index - 1] > NEAR);

/**
 * Wall, gable, roof, and subfloor sheets. Each panel is one 4×8 sheet, cut to fit, with its
 * joints on framing.
 */
export function frameSheathing(
  config: ShedConfig,
  members: readonly Member[],
  openings: readonly RoughOpening[],
  planes: readonly RoofPlane[],
): Solid[] {
  const { walls, roof, floor } = config;
  const solids: Solid[] = [];
  if (walls.sheathing !== 'none') {
    const { label, thick } = SHEETS[walls.sheathing];
    const frames = wallFrames(config.width, config.length);
    for (const wall of WALLS) {
      const face = wallFace(config, wall, frames[wall], members, openings, thick);
      solids.push(...panels(face, thick, idMaker(ASSEMBLIES[`wall.${wall}`].prefix), 'SH', `Wall sheathing, ${label}`));
    }
  }
  if (roof.sheathing !== 'none') {
    const { label, thick } = SHEETS[roof.sheathing];
    const nextId = idMaker('RF');
    for (const plane of planes) solids.push(...panels(roofFace(plane, members), thick, nextId, 'SH', `Roof sheathing, ${label}`));
  }
  const joists = members.filter((member) => member.role === 'joist.floor' || member.role === 'joist.end');
  if (joists.length > 0) {
    const { label, thick } = SHEETS[floor.subfloor];
    const face: Face = {
      origin: [0, 0, -thick],
      u: X,
      v: Y,
      region: rectangle(config.length, config.width),
      supports: centers(joists, (point) => point[0]),
      holes: [],
      along: SHEET_LENGTH,
      across: SHEET_WIDTH,
      stagger: true,
      minRow: 0,
    };
    solids.push(...panels(face, thick, idMaker('FL'), 'SF', `Subfloor, ${label}`));
  }
  return solids;
}

/** Middle of each member along one axis, in order. */
function centers(members: readonly Member[], along: (point: Vec3) => number): number[] {
  return distinct(
    members.map((member) => {
      const values = corners(member).map(along);
      return (Math.min(...values) + Math.max(...values)) / 2;
    }),
  );
}

// Sheets stand on the outside face from the bottom of the wall. The face takes in the framing
// flush with it: wall, gable end, knee wall, and loft rim. The eave walls run past each corner to
// cover the end-wall sheathing edge; the end walls cover the eave walls' ends, up to their tops.
function wallFace(
  config: ShedConfig,
  wall: Wall,
  frame: Frame,
  members: readonly Member[],
  openings: readonly RoughOpening[],
  thick: number,
): Face {
  const depth = LUMBER[config.walls.stud].width;
  const toFace = (point: Vec3): Point => [dot(minus(point, frame.origin), frame.u), point[2]];
  const inward = (point: Vec3) => dot(minus(point, frame.origin), frame.v);
  const flush = members.filter((member) => {
    if (!/^(wall|gable|knee|loft)/.test(member.assembly)) return false;
    const depths = corners(member).map(inward);
    return Math.min(...depths) > -NEAR && Math.min(...depths) < NEAR && Math.max(...depths) < depth + NEAR;
  });
  const points = flush.flatMap((member) => corners(member).map(toFace));
  const low = Math.min(...points.map(([, z]) => z));
  const high = Math.max(...points.map(([, z]) => z));
  const eave = wall === 'front' || wall === 'back';
  const span = eave ? config.length : config.width;
  const top = (other: Wall) =>
    Math.max(
      ...members
        .filter((member) => member.assembly === `wall.${other}` || member.assembly === `knee.${other}`)
        .flatMap((member) => corners(member).map(([, , z]) => z)),
    );
  const [near, far] = ADJACENT[wall];
  const ends: Point[] = eave
    ? [[-thick, low], [-thick, high], [span + thick, low], [span + thick, high]]
    : [[0, low], [0, top(near)], [span, low], [span, top(far)]];
  // A joint on a jack would leave a sliver of sheet beside the RO.
  const vertical = flush.filter((member) => member.role !== 'jack' && Math.abs(member.axes.length[2]) > 1 - NEAR);
  return {
    origin: frame.origin,
    u: frame.u,
    v: UP,
    region: hull([...points, ...ends]),
    supports: centers(vertical, (point) => toFace(point)[0]),
    holes: openings.filter((opening) => opening.wall === wall).map(({ left, right, bottom, top }) => ({ min: [left, bottom], max: [right, top] })),
    along: SHEET_WIDTH,
    across: SHEET_LENGTH,
    stagger: false,
    minRow: MIN_STRIP,
  };
}

// Sheets run long edge along the ridge from the lower edge up, with end joints on rafter centers.
function roofFace(plane: RoofPlane, members: readonly Member[]): Face {
  const rafters = members.filter((member) => member.role === 'rafter');
  return {
    origin: plane.origin,
    u: plane.u,
    v: plane.v,
    region: rectangle(plane.length, plane.width),
    supports: centers(rafters, (point) => dot(minus(point, plane.origin), plane.u)),
    holes: [],
    along: SHEET_LENGTH,
    across: SHEET_WIDTH,
    stagger: true,
    minRow: 0,
  };
}

function panels(face: Face, thick: number, nextId: (code: string) => string, code: string, label: string): Solid[] {
  const us = face.region.map(([u]) => u);
  const vs = face.region.map(([, v]) => v);
  const [left, right, bottom, top] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const solids: Solid[] = [];
  for (let row = 0, low = bottom; low < top - NEAR; row++, low += face.across) {
    const high = Math.min(low + face.across, top);
    const first = face.stagger && row % 2 === 1 ? face.along / 2 : face.along;
    for (const [from, to] of sheetJoints(left, right, first, face.along, face.supports)) {
      const loops = subtract({ min: [from, low], max: [to, high] }, face.holes)
        .map((loop) => clip(loop, face.region))
        .filter((loop) => loop.length >= 3);
      const holes = loops.filter((loop) => area(loop) < -NEAR);
      for (const outline of loops.filter((loop) => area(loop) > 1)) {
        const heights = outline.map(([, v]) => v);
        if (Math.max(...heights) - Math.min(...heights) < face.minRow) continue;
        solids.push({
          id: nextId(code),
          label,
          layer: 'sheathing',
          material: 'sheet',
          shape: {
            kind: 'panel',
            origin: face.origin,
            u: face.u,
            v: face.v,
            thick,
            outline,
            holes: holes.filter((hole) => contains(outline, hole[0])),
          },
        });
      }
    }
  }
  return solids;
}

/**
 * Pieces along [start, end]: the first at most `first` long, the rest at most `max`. Each joint
 * lands on the farthest support in reach, and leaves at least 12 in to the end when it can.
 */
export function sheetJoints(start: number, end: number, first: number, max: number, supports: readonly number[]): Span[] {
  const pieces: Span[] = [];
  let from = start;
  let limit = first;
  while (end - from > limit + NEAR) {
    const reach = supports.filter((joint) => joint > from + NEAR && joint <= from + limit + NEAR);
    const roomy = reach.filter((joint) => end - joint >= MIN_PIECE);
    const options = roomy.length > 0 ? roomy : reach;
    const joint = options.length > 0 ? Math.max(...options) : from + limit;
    pieces.push([from, joint]);
    from = joint;
    limit = max;
  }
  pieces.push([from, end]);
  return pieces;
}

/** A rectangle less the holes, as loops: outer loops counterclockwise, holes clockwise. */
export function subtract(rect: Rect, holes: readonly Rect[]): Point[][] {
  const cuts = holes
    .map(({ min, max }): Rect => ({
      min: [Math.max(min[0], rect.min[0]), Math.max(min[1], rect.min[1])],
      max: [Math.min(max[0], rect.max[0]), Math.min(max[1], rect.max[1])],
    }))
    .filter(({ min, max }) => max[0] - min[0] > NEAR && max[1] - min[1] > NEAR);
  const xs = distinct([rect.min[0], rect.max[0], ...cuts.flatMap(({ min, max }) => [min[0], max[0]])]);
  const ys = distinct([rect.min[1], rect.max[1], ...cuts.flatMap(({ min, max }) => [min[1], max[1]])]);
  const filled = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false;
    const [x, y] = [(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2];
    return !cuts.some(({ min, max }) => x > min[0] && x < max[0] && y > min[1] && y < max[1]);
  };

  // Grid edges between a filled cell and an empty one, with the filled cell on the left.
  const edges = new Map<string, [number, number][]>();
  const add = (from: [number, number], to: [number, number]) => {
    const key = from.join();
    edges.set(key, [...(edges.get(key) ?? []), to]);
  };
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      if (!filled(i, j)) continue;
      if (!filled(i, j - 1)) add([i, j], [i + 1, j]);
      if (!filled(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
      if (!filled(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
      if (!filled(i - 1, j)) add([i, j + 1], [i, j]);
    }
  }

  const loops: Point[][] = [];
  for (const [startKey] of edges) {
    const corners: [number, number][] = [];
    let key = startKey;
    while (edges.get(key)?.length) {
      const next = edges.get(key)!.shift()!;
      corners.push(next);
      key = next.join();
    }
    if (corners.length === 0) continue;
    const points = corners.map(([i, j]): Point => [xs[i], ys[j]]);
    // Keep the corners only: drop points between two edges in line.
    loops.push(
      points.filter((point, index) => {
        const before = points[(index + points.length - 1) % points.length];
        const after = points[(index + 1) % points.length];
        return !(before[0] === point[0] && point[0] === after[0]) && !(before[1] === point[1] && point[1] === after[1]);
      }),
    );
  }
  return loops;
}

// The part of a loop inside a convex counterclockwise region: keep the left of each region edge.
function clip(loop: Point[], region: readonly Point[]): Point[] {
  return region.reduce((kept, start, index) => {
    const end = region[(index + 1) % region.length];
    const normal: Point = [end[1] - start[1], start[0] - end[0]];
    return kept.length < 3 ? kept : clipBelow(kept, normal, normal[0] * start[0] + normal[1] * start[1]);
  }, loop);
}

/** Signed area: positive counterclockwise. */
function area(loop: readonly Point[]): number {
  return loop.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = loop[(index + 1) % loop.length];
    return sum + (x * nextY - nextX * y) / 2;
  }, 0);
}

function contains(polygon: readonly Point[], [x, y]: Point): boolean {
  let inside = false;
  polygon.forEach(([x1, y1], index) => {
    const [x2, y2] = polygon[(index + 1) % polygon.length];
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
  });
  return inside;
}
