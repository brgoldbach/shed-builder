import type { LumberSize } from './catalog';

export type Vec3 = readonly [number, number, number];

// Key order is the cut-list order.
export const ASSEMBLIES = {
  'wall.front': { label: 'Front wall', prefix: 'FW' },
  'wall.back': { label: 'Back wall', prefix: 'BW' },
  'wall.left': { label: 'Left wall', prefix: 'LW' },
  'wall.right': { label: 'Right wall', prefix: 'RW' },
} as const;
export type Assembly = keyof typeof ASSEMBLIES;

export const ROLES = {
  'plate.sill': 'Mud sill',
  'plate.bottom': 'Bottom plate',
  'plate.top': 'Top plate',
  'plate.cap': 'Cap plate',
  corner: 'Corner stud',
  stud: 'Stud',
} as const;
export type Role = keyof typeof ROLES;

/**
 * One piece of lumber, as a box in building coordinates (inches, x along the length, y front to
 * back, z up from the floor surface). From `origin` the box runs `length` along `axes.length`, the
 * lumber width along `axes.width`, and the lumber thickness along `axes.thick`.
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
}
