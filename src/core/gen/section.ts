import { LUMBER, type LumberSize } from '../catalog';
import type { Assembly, Member, Point, Role, Vec3 } from '../member';

/** A vertical drawing plane. Plane point (a, z) sits at origin + a·h + z·up. Members extrude along h × up. */
export interface Plane {
  origin: Vec3;
  h: Vec3;
}

export interface MemberBase {
  id: string;
  assembly: Assembly;
  role: Role;
  size: LumberSize;
  note?: string;
}

const EPSILON = 1e-9;

export interface Pitch {
  rise: number; // per 1 of run
  cos: number;
  sin: number;
  degrees: number;
}

export const degrees = (pitch: Pitch) => `${pitch.degrees.toFixed(1)}°`;

/**
 * The rafter in a section across the building, drawn for a side whose eave is at y = 0 and that
 * rises toward +y. The bottom edge passes through the inner end of the seat, at the plate top.
 */
export interface Slope {
  pitch: Pitch;
  depth: number;
  seat: number;
  bottom: (y: number) => number;
  top: (y: number) => number;
}

/**
 * A member from its outline in a vertical plane. `dir` is the length direction in plane
 * coordinates; the width axis is `dir` turned 90° toward +z, so the axes stay right-handed.
 */
export function planeMember(
  base: MemberBase,
  plane: Plane,
  outline: readonly Point[],
  dir: Point,
  depth = LUMBER[base.size].thick,
): Member {
  const norm = Math.hypot(dir[0], dir[1]);
  const along: Point = [dir[0] / norm, dir[1] / norm];
  const across: Point = [-along[1], along[0]];
  const points = dedupe(outline);
  const alongs = points.map(([a, z]) => a * along[0] + z * along[1]);
  const acrosses = points.map(([a, z]) => a * across[0] + z * across[1]);
  const minAlong = Math.min(...alongs);
  const minAcross = Math.min(...acrosses);

  const { h } = plane;
  const toSpace = ([a, z]: Point): Vec3 => [h[0] * a, h[1] * a, h[2] * a + z];
  const start = toSpace([minAlong * along[0] + minAcross * across[0], minAlong * along[1] + minAcross * across[1]]);
  return {
    ...base,
    treated: false,
    length: Math.max(...alongs) - minAlong,
    origin: [plane.origin[0] + start[0], plane.origin[1] + start[1], plane.origin[2] + start[2]],
    axes: { length: toSpace(along), width: toSpace(across), thick: [h[1], -h[0], 0] },
    profile: {
      points: points.map((_, index) => [alongs[index] - minAlong, acrosses[index] - minAcross] as const),
      depth,
    },
  };
}

/** The part of a convex polygon where k·(a, z) ≤ limit. */
export function clipBelow(polygon: readonly Point[], k: Point, limit: number): Point[] {
  const excess = ([a, z]: Point) => k[0] * a + k[1] * z - limit;
  const result: Point[] = [];
  polygon.forEach((current, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const currentExcess = excess(current);
    const nextExcess = excess(next);
    if (currentExcess <= EPSILON) result.push(current);
    if ((currentExcess > EPSILON) !== (nextExcess > EPSILON)) {
      const fraction = currentExcess / (currentExcess - nextExcess);
      result.push([current[0] + fraction * (next[0] - current[0]), current[1] + fraction * (next[1] - current[1])]);
    }
  });
  return result;
}

/** Consecutive duplicate points removed, including a last point equal to the first. */
function dedupe(outline: readonly Point[]): Point[] {
  const same = (first: Point, second: Point) =>
    Math.abs(first[0] - second[0]) < EPSILON && Math.abs(first[1] - second[1]) < EPSILON;
  const points = outline.filter((point, index) => index === 0 || !same(point, outline[index - 1]));
  return points.length > 1 && same(points[0], points[points.length - 1]) ? points.slice(0, -1) : points;
}

/** Next id for a code within a prefix: RF-R01, RF-R02, ... */
export function idMaker(prefix: string) {
  const counts = new Map<string, number>();
  return (code: string) => {
    const count = (counts.get(code) ?? 0) + 1;
    counts.set(code, count);
    return `${prefix}-${code}${String(count).padStart(2, '0')}`;
  };
}
