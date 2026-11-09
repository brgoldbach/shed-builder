import type { ShedConfig } from './config';
import { frameRoof } from './gen/roof';
import { frameWalls } from './gen/walls';
import type { Member, Warning } from './member';

export interface Model {
  members: Member[];
  warnings: Warning[];
}

/** Every framing member of the design, and the problems found while framing it. */
export function buildModel(config: ShedConfig): Model {
  const parts = [frameWalls(config), frameRoof(config)];
  return {
    members: parts.flatMap((part) => part.members),
    warnings: parts.flatMap((part) => part.warnings),
  };
}
