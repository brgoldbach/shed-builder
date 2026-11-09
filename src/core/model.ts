import type { ShedConfig } from './config';
import { frameWalls } from './gen/walls';
import type { Member } from './member';

/** Every framing member of the design. */
export function buildModel(config: ShedConfig): Member[] {
  return frameWalls(config);
}
