import { LUMBER, type LumberSize, type SheetKey } from './catalog';

export type Vec3 = readonly [number, number, number];
export type Point = readonly [number, number];

// In build order, as the 3D view's toggles show them.
export const LAYERS = {
  foundation: 'Foundation',
  floor: 'Floor',
  walls: 'Walls',
  gables: 'Gable ends',
  loft: 'Loft',
  knee: 'Knee walls',
  roof: 'Roof',
  rake: 'Rake ladders',
  additions: 'Lean-tos',
  ramps: 'Ramps',
  sheathing: 'Sheathing',
  siding: 'Siding',
  roofing: 'Roofing',
  openings: 'Doors and windows',
} as const;
export type Layer = keyof typeof LAYERS;

// Key order is the cut-list order.
export const ASSEMBLIES = {
  foundation: { label: 'Foundation', prefix: 'FD', layer: 'foundation' },
  floor: { label: 'Floor', prefix: 'FL', layer: 'floor' },
  'wall.front': { label: 'Front wall', prefix: 'FW', layer: 'walls' },
  'wall.back': { label: 'Back wall', prefix: 'BW', layer: 'walls' },
  'wall.left': { label: 'Left wall', prefix: 'LW', layer: 'walls' },
  'wall.right': { label: 'Right wall', prefix: 'RW', layer: 'walls' },
  'gable.left': { label: 'Left gable end', prefix: 'GL', layer: 'gables' },
  'gable.right': { label: 'Right gable end', prefix: 'GR', layer: 'gables' },
  roof: { label: 'Roof', prefix: 'RF', layer: 'roof' },
  loft: { label: 'Loft', prefix: 'LF', layer: 'loft' },
  'knee.front': { label: 'Front knee wall', prefix: 'KF', layer: 'knee' },
  'knee.back': { label: 'Back knee wall', prefix: 'KB', layer: 'knee' },
  'addition.front': { label: 'Front lean-to', prefix: 'AF', layer: 'additions' },
  'addition.back': { label: 'Back lean-to', prefix: 'AB', layer: 'additions' },
  'addition.left': { label: 'Left lean-to', prefix: 'AL', layer: 'additions' },
  'addition.right': { label: 'Right lean-to', prefix: 'AR', layer: 'additions' },
  ramp: { label: 'Ramps', prefix: 'RP', layer: 'ramps' },
} as const satisfies Record<string, { label: string; prefix: string; layer: Layer }>;
export type Assembly = keyof typeof ASSEMBLIES;

export const ROLES = {
  'plate.sill': 'Mud sill',
  'plate.bottom': 'Bottom plate',
  'plate.top': 'Top plate',
  'plate.cap': 'Cap plate',
  corner: 'Corner stud',
  stud: 'Stud',
  king: 'King stud',
  jack: 'Jack stud',
  header: 'Header',
  'header.plate': 'Header plate',
  sill: 'Rough sill',
  cripple: 'Cripple',
  'plate.gable': 'Gable top plate',
  'stud.gable': 'Gable stud',
  'post.ridge': 'Ridge post',
  ridge: 'Ridge board',
  rafter: 'Rafter',
  'rafter.upper': 'Upper rafter',
  'rafter.fly': 'Fly rafter',
  'rail.ladder': 'Ladder rail',
  lookout: 'Lookout',
  fascia: 'Fascia',
  'tie.rafter': 'Rafter tie',
  'tie.collar': 'Collar tie',
  'joist.loft': 'Loft joist',
  'rim.loft': 'Loft rim joist',
  'ledger.loft': 'Loft ledger',
  'edge.loft': 'Loft edge joist',
  'trimmer.loft': 'Hatch trimmer',
  'header.loft': 'Hatch header',
  'tail.loft': 'Tail joist',
  skid: 'Skid',
  girder: 'Girder ply',
  ledger: 'Ledger',
  purlin: 'Purlin',
  beam: 'Beam ply',
  post: 'Post',
  'rim.floor': 'Rim joist',
  'joist.end': 'End joist',
  'joist.floor': 'Floor joist',
  blocking: 'Blocking',
  'ledger.deck': 'Deck ledger',
  'joist.deck': 'Deck joist',
  'rim.deck': 'Deck rim joist',
  'beam.deck': 'Deck beam ply',
  decking: 'Deck board',
  stringer: 'Ramp stringer',
  'stringer.stair': 'Stair stringer',
  tread: 'Stair tread',
} as const;
export type Role = keyof typeof ROLES;

/**
 * A flat part: `outline` and `holes` in (u, v) plane coordinates from `origin`, extruded `thick`
 * along u × v.
 */
export interface Panel {
  kind: 'panel';
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  thick: number;
  outline: Point[];
  holes: Point[][];
}

/** A non-lumber part shown in 3D: concrete, sheet goods, or hardware. */
export interface Solid {
  id: string;
  label: string;
  layer: Layer;
  material: 'concrete' | 'sheet' | 'steel';
  shape: { kind: 'box'; min: Vec3; max: Vec3 } | { kind: 'cylinder'; base: Vec3; radius: number; height: number } | Panel;
  sheet?: SheetKey; // the stock sheet a panel is cut from
}

/**
 * A design problem found while framing. `source` names the opening or part. `missing` is a part
 * left out because its framing would collide: a closed loop, drawn in red in 3D and on the
 * drawings of its assembly.
 */
export interface Warning {
  source: string;
  message: string;
  missing?: { assembly: Assembly; outline: Vec3[] };
}

/** Ends the message of a warning with `missing`. */
export const LEFT_OUT = 'It is left out: red in 3D and on the drawings.';

/**
 * One piece of lumber in building coordinates (inches, x along the length, y front to back, z up
 * from the floor surface). From `origin` the piece runs `length` along `axes.length`, the lumber
 * width along `axes.width`, and the lumber thickness along `axes.thick`.
 *
 * A piece with angle cuts has a `profile`: its outline in (length, width) coordinates, extruded
 * `depth` along `axes.thick`. Its axes are right-handed: thick = length × width.
 *
 * A straight piece with its top edge ripped on a bevel has a `bevel`: at the far face, its top edge
 * (width 0) drops this far along `axes.width`.
 */
export interface Member {
  id: string;
  assembly: Assembly;
  role: Role;
  size: LumberSize;
  treated: boolean;
  length: number;
  origin: Vec3;
  axes: { length: Vec3; width: Vec3; thick: Vec3 };
  profile?: { points: readonly Point[]; depth: number };
  bevel?: number;
  note?: string; // shop instruction for the cut list
}

// The rake ladder's parts are roof members on a layer of their own.
const RAKE_ROLES = new Set<Role>(['rafter.fly', 'rail.ladder', 'lookout']);

/** The 3D layer a member shows on. */
export function layerOf(member: Member): Layer {
  return RAKE_ROLES.has(member.role) ? 'rake' : ASSEMBLIES[member.assembly].layer;
}

/** A member's corners: its profile on both faces, or its eight box corners. */
export function corners(member: Member): Vec3[] {
  const { origin, axes } = member;
  const at = (along: number, across: number, through: number): Vec3 => [
    origin[0] + axes.length[0] * along + axes.width[0] * across + axes.thick[0] * through,
    origin[1] + axes.length[1] * along + axes.width[1] * across + axes.thick[1] * through,
    origin[2] + axes.length[2] * along + axes.width[2] * across + axes.thick[2] * through,
  ];
  if (member.profile) {
    const { points, depth } = member.profile;
    return [0, depth].flatMap((through) => points.map(([along, across]) => at(along, across, through)));
  }
  const { width, thick } = LUMBER[member.size];
  const top = (through: number) => (through === thick ? (member.bevel ?? 0) : 0);
  return [0, member.length].flatMap((along) => [0, width].flatMap((across) => [0, thick].map((through) => at(along, across || top(through), through))));
}

/** A panel's outline corners on both faces. */
export function panelCorners({ origin, u, v, thick, outline }: Panel): Vec3[] {
  const normal: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return [0, thick].flatMap((through) =>
    outline.map(([a, b]): Vec3 => [
      origin[0] + u[0] * a + v[0] * b + normal[0] * through,
      origin[1] + u[1] * a + v[1] * b + normal[1] * through,
      origin[2] + u[2] * a + v[2] * b + normal[2] * through,
    ]),
  );
}
