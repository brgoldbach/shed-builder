import type { ShedConfig } from './config';
import { frameAdditions, type LeanTo } from './gen/additions';
import { frameFloor } from './gen/floor';
import { frameRamps, type RampFacts } from './gen/ramps';
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
  rafterSpans: { member: string; span: number }[]; // the main roof's rafters
  leanTos: LeanTo[];
  ramps: RampFacts[]; // one for each ramp or stairs built
}

/** Every framing member and non-lumber part of the design, and the problems found while framing it. */
export function buildModel(config: ShedConfig): Model {
  const floor = frameFloor(config);
  const walls = frameWalls(config);
  const roof = frameRoof(config);
  const shed = [...floor.members, ...walls.members, ...roof.members];
  const additions = frameAdditions(config, roof, shed);
  const ramps = frameRamps(config, shed, additions.leanTos);
  const members = [...shed, ...additions.members, ...ramps.members];
  const openings = [...walls.openings, ...roof.openings];
  const planes = [...roof.planes, ...additions.planes];
  return {
    members,
    solids: [
      ...floor.solids,
      ...walls.solids,
      ...roof.solids,
      ...additions.solids,
      ...ramps.solids,
      ...frameSheathing(config, members, openings, planes, roof.deck),
    ],
    warnings: [...walls.warnings, ...roof.warnings, ...additions.warnings, ...ramps.warnings],
    openings,
    planes,
    rafterSpans: roof.rafterSpans,
    leanTos: additions.leanTos,
    ramps: ramps.facts,
  };
}
