import type { LumberSize } from './catalog';

export type Vec3 = readonly [number, number, number];
export type Point = readonly [number, number];

export const LAYERS = { walls: 'Walls', roof: 'Roof' } as const;
export type Layer = keyof typeof LAYERS;

// Key order is the cut-list order.
export const ASSEMBLIES = {
  'wall.front': { label: 'Front wall', prefix: 'FW', layer: 'walls' },
  'wall.back': { label: 'Back wall', prefix: 'BW', layer: 'walls' },
  'wall.left': { label: 'Left wall', prefix: 'LW', layer: 'walls' },
  'wall.right': { label: 'Right wall', prefix: 'RW', layer: 'walls' },
  'gable.left': { label: 'Left gable end', prefix: 'GL', layer: 'roof' },
  'gable.right': { label: 'Right gable end', prefix: 'GR', layer: 'roof' },
  roof: { label: 'Roof', prefix: 'RF', layer: 'roof' },
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
} as const;
export type Role = keyof typeof ROLES;

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
