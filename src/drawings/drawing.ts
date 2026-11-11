import { hull } from '../core/gen/section';
import { corners, panelCorners, ROLES, type Member, type Point, type Role, type Solid, type Vec3 } from '../core/member';
import { formatInches } from '../core/units';

/** Drawing x runs along `right` and drawing y along `up`. The viewer looks along `forward`. */
export interface View {
  origin: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

export type Outline = { kind: 'polygon'; points: Point[] } | { kind: 'circle'; center: Point; radius: number };

/** One member or non-lumber part, projected into a drawing. */
export interface Shape {
  outline: Outline;
  kind: 'member' | 'context' | Solid['material'];
  id?: string;
  role?: Role;
  treated?: boolean;
  mark?: string;
  title: string;
  /** Member length direction in the drawing; none when the member points at the viewer. */
  axis?: Point;
  /** Cut by the section plane: drawn with an X. */
  cut?: boolean;
}

export type Side = 'bottom' | 'top' | 'left' | 'right';

/**
 * - chain: consecutive dimensions between positions along the side's axis, outside the drawing.
 * - running: the distance from `origin` to each position, as a tape reads it.
 * - aligned: one dimension from `from` to `to`, `offset` px to the left of that direction. With
 *   `along`, it measures only the distance along that direction, on a line `offset` px beyond the
 *   farther of the two points.
 * `tier` 1 is nearest the drawing.
 */
export type Dimension =
  | { kind: 'chain'; side: Side; tier: number; at: number[]; feet?: boolean }
  | { kind: 'running'; side: Side; tier: number; origin: number; at: number[] }
  | { kind: 'aligned'; from: Point; to: Point; offset: number; along?: Point };

/** One framing drawing in inches, drawing y up. */
export interface Drawing {
  id: string;
  title: string;
  shapes: Shape[]; // back to front
  dims: Dimension[];
  labels: { at: Point; text: string; room: number }[]; // room: inches of width the label may take
  outlines: Point[][]; // dashed references, such as the footprint
  missing: Point[][]; // parts left out because their framing would collide, drawn in red
  notes: string[];
  wireframe?: boolean; // outlines only, so lower parts show through
}

const EPSILON = 1e-6;

const dot = (first: Vec3, second: Vec3) => first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
const cross = (first: Vec3, second: Vec3): Vec3 => [
  first[1] * second[2] - first[2] * second[1],
  first[2] * second[0] - first[0] * second[2],
  first[0] * second[1] - first[1] * second[0],
];
const relative = (view: View, point: Vec3): Vec3 => [
  point[0] - view.origin[0],
  point[1] - view.origin[1],
  point[2] - view.origin[2],
];

export const project = (view: View, point: Vec3): Point => [
  dot(relative(view, point), view.right),
  dot(relative(view, point), view.up),
];

/** Distance from the view origin along the line of sight. */
export const depthOf = (view: View, point: Vec3) => dot(relative(view, point), view.forward);

function solidCorners(view: View, solid: Solid): Vec3[] {
  const { shape } = solid;
  if (shape.kind === 'panel') return panelCorners(shape);
  if (shape.kind === 'box') {
    const { min, max } = shape;
    return [min[0], max[0]].flatMap((x) => [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z): Vec3 => [x, y, z])));
  }
  // The axis is vertical, and `right` is level in every view that sees the cylinder from the side.
  const { base, radius, height } = shape;
  return [0, height].flatMap((rise) =>
    [-radius, radius].map((side): Vec3 => [base[0] + view.right[0] * side, base[1] + view.right[1] * side, base[2] + rise]),
  );
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export const memberTitle = (member: Member, mark?: string) =>
  `${mark ? `${mark} ` : ''}${ROLES[member.role]}, ${member.size}${member.treated ? ' PT' : ''}, ${formatInches(member.length)}`;

/**
 * Members and parts projected and sorted back to front. A profile or a panel seen square to its
 * face keeps its exact outline; anything else takes the convex hull of its corners. `context` members are
 * drawn first, faint, for reference.
 */
export function shapesOf(
  view: View,
  members: readonly Member[],
  solids: readonly Solid[],
  marks: ReadonlyMap<string, string>,
  { context = [], section = false }: { context?: readonly Member[]; section?: boolean } = {},
): Shape[] {
  const plan = Math.abs(view.forward[2]) > 1 - EPSILON;
  const memberShape = (member: Member, kind: 'member' | 'context') => {
    const points3 = corners(member);
    const projected = points3.map((point) => project(view, point));
    const facing = member.profile && Math.abs(dot(member.axes.thick, view.forward)) > 1 - EPSILON;
    const along: Point = [dot(member.axes.length, view.right), dot(member.axes.length, view.up)];
    const norm = Math.hypot(along[0], along[1]);
    const axis: Point | undefined = norm > 0.01 ? [along[0] / norm, along[1] / norm] : undefined;
    const mark = kind === 'member' ? marks.get(member.id) : undefined;
    const shape: Shape = {
      outline: { kind: 'polygon', points: facing ? projected.slice(0, member.profile!.points.length) : hull(projected) },
      kind,
      id: kind === 'member' ? member.id : undefined,
      role: member.role,
      treated: member.treated,
      mark,
      title: memberTitle(member, mark),
      axis,
      cut: section && !axis,
    };
    return { shape, depth: mean(points3.map((point) => depthOf(view, point))) };
  };
  const solidShape = (solid: Solid) => {
    const { shape: part } = solid;
    const points3 = solidCorners(view, solid);
    const projected = points3.map((point) => project(view, point));
    const facing = part.kind === 'panel' && Math.abs(dot(cross(part.u, part.v), view.forward)) > 1 - EPSILON;
    const outline: Outline =
      part.kind === 'cylinder' && plan
        ? { kind: 'circle', center: project(view, part.base), radius: part.radius }
        : { kind: 'polygon', points: facing ? projected.slice(0, part.outline.length) : hull(projected) };
    const shape: Shape = { outline, kind: solid.material, title: solid.label };
    return { shape, depth: mean(points3.map((point) => depthOf(view, point))) };
  };
  const sorted = [...members.map((member) => memberShape(member, 'member')), ...solids.map(solidShape)].sort(
    (first, second) => second.depth - first.depth,
  );
  return [...context.map((member) => memberShape(member, 'context').shape), ...sorted.map(({ shape }) => shape)];
}

/** Lower-left and upper-right corners around the shapes and the `loops`. */
export function bounds(shapes: readonly Shape[], loops: readonly (readonly Point[])[] = []): { min: Point; max: Point } {
  const points = shapes.flatMap(({ outline }) =>
    outline.kind === 'polygon'
      ? outline.points
      : [
          [outline.center[0] - outline.radius, outline.center[1] - outline.radius] as const,
          [outline.center[0] + outline.radius, outline.center[1] + outline.radius] as const,
        ],
  );
  points.push(...loops.flat());
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}
