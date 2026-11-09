import type { LumberSize } from './catalog';

export type Vec3 = readonly [number, number, number];
export type Point = readonly [number, number];

export const LAYERS = {
  foundation: 'Foundation',
  floor: 'Floor',
  walls: 'Walls',
  roof: 'Roof',
  loft: 'Loft',
  sheathing: 'Sheathing',
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
  'gable.left': { label: 'Left gable end', prefix: 'GL', layer: 'roof' },
  'gable.right': { label: 'Right gable end', prefix: 'GR', layer: 'roof' },
  roof: { label: 'Roof', prefix: 'RF', layer: 'roof' },
  loft: { label: 'Loft', prefix: 'LF', layer: 'loft' },
  'knee.front': { label: 'Front knee wall', prefix: 'KF', layer: 'loft' },
  'knee.back': { label: 'Back knee wall', prefix: 'KB', layer: 'loft' },
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
  'rafter.fly': 'Fly rafter',
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
  post: 'Post',
  'rim.floor': 'Rim joist',
  'joist.end': 'End joist',
  'joist.floor': 'Floor joist',
  blocking: 'Blocking',
} as const;
export type Role = keyof typeof ROLES;

/** A non-lumber part shown in 3D: concrete, sheet goods, or hardware. */
export interface Solid {
  id: string;
  label: string;
  layer: Layer;
  material: 'concrete' | 'sheet' | 'steel';
  shape: { kind: 'box'; min: Vec3; max: Vec3 } | { kind: 'cylinder'; base: Vec3; radius: number; height: number };
}

/** A design problem found while framing. `source` names the opening or part. */
export interface Warning {
  source: string;
  message: string;
}

/**
 * One piece of lumber in building coordinates (inches, x along the length, y front to back, z up
 * from the floor surface). From `origin` the piece runs `length` along `axes.length`, the lumber
 * width along `axes.width`, and the lumber thickness along `axes.thick`.
 *
 * A piece with angle cuts has a `profile`: its outline in (length, width) coordinates, extruded
 * `depth` along `axes.thick`. Its axes are right-handed: thick = length × width.
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
  note?: string; // shop instruction for the cut list
}
