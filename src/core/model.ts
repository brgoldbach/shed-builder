import type { ShedConfig } from './config';
import { frameWalls } from './gen/walls';
import type { Member, Warning } from './member';

export interface Model {
  members: Member[];
  warnings: Warning[];
}

/** Every framing member of the design, and the problems found while framing it. */
export function buildModel(config: ShedConfig): Model {
  return frameWalls(config);
}
