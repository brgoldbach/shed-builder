import type { ShedConfig } from './config';
import { frameFloor } from './gen/floor';
import { frameRoof } from './gen/roof';
import { frameSheathing } from './gen/sheathing';
import { frameWalls, type RoughOpening } from './gen/walls';
import type { Member, Solid, Warning } from './member';

export interface Model {
  members: Member[];
  solids: Solid[];
  warnings: Warning[];
  openings: RoughOpening[];
}

/** Every framing member and non-lumber part of the design, and the problems found while framing it. */
export function buildModel(config: ShedConfig): Model {
  const floor = frameFloor(config);
  const walls = frameWalls(config);
  const roof = frameRoof(config);
  const members = [...floor.members, ...walls.members, ...roof.members];
  return {
    members,
    solids: [...floor.solids, ...walls.solids, ...frameSheathing(config, members, walls.openings, roof.planes)],
    warnings: [...walls.warnings, ...roof.warnings],
    openings: walls.openings,
  };
}
