import type { ShedConfig } from './config';
import { frameAdditions, type LeanTo } from './gen/additions';
import { frameFloor } from './gen/floor';
import { frameRoof, type RoofPlane } from './gen/roof';
import { frameSheathing } from './gen/sheathing';
import { frameWalls, type RoughOpening } from './gen/walls';
import type { Member, Solid, Warning } from './member';

export interface Model {
  members: Member[];
  solids: Solid[];
  warnings: Warning[];
  openings: RoughOpening[];
  planes: RoofPlane[];
  rafterSpan: number;
  leanTos: LeanTo[];
}

/** Every framing member and non-lumber part of the design, and the problems found while framing it. */
export function buildModel(config: ShedConfig): Model {
  const floor = frameFloor(config);
  const walls = frameWalls(config);
  const roof = frameRoof(config);
  const shed = [...floor.members, ...walls.members, ...roof.members];
  const additions = frameAdditions(config, roof, shed);
  const members = [...shed, ...additions.members];
  const openings = [...walls.openings, ...roof.openings];
  const planes = [...roof.planes, ...additions.planes];
  return {
    members,
    solids: [...floor.solids, ...walls.solids, ...additions.solids, ...frameSheathing(config, members, openings, planes, roof.deck)],
    warnings: [...walls.warnings, ...roof.warnings, ...additions.warnings],
    openings,
    planes,
    rafterSpan: roof.rafterSpan,
    leanTos: additions.leanTos,
  };
}
