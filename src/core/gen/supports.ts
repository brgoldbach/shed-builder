import { LUMBER, SHEETS } from '../catalog';
import type { ShedConfig } from '../config';
import type { Point } from '../member';
import { formatInches } from '../units';

/** The lines a framed floor stands on: their kind, y centers, width, and top. */
export interface SupportLines {
  kind: 'skid' | 'pier';
  ys: number[];
  across: number;
  top: number;
}

/**
 * The lines the shed's floor stands on, left to right under the joists: skids, or pier girders.
 * Their y centers (the outer two flush with the floor edges), their width, and their top, the joist
 * bottom. Null on a slab. Lean-to decks on the shed's foundation stand on the same lines.
 */
export function supportLines(config: ShedConfig): SupportLines | null {
  const { foundation, floor, width } = config;
  if (foundation.type === 'slab') return null;
  const top = -SHEETS[floor.subfloor].thick - LUMBER[floor.joist].width;
  const { pier } = foundation;
  // The widest of girder, post, and pier sets the pier lines, so nothing passes the floor edge.
  const across =
    foundation.type === 'skid'
      ? LUMBER[foundation.skid.size].thick
      : Math.max(pier.girderPlies * LUMBER[pier.girder].thick, pier.post === 'none' ? 0 : LUMBER[pier.post].width, pier.diameter);
  const count = foundation.type === 'skid' ? foundation.skid.count : pier.girderCount;
  const ys = Array.from({ length: count }, (_, index) => across / 2 + (index * (width - across)) / (count - 1));
  return { kind: foundation.type, ys, across, top };
}

/**
 * A skid's outline in its vertical plane, `from` to `to` along it: each outer end (`start`, `end`)
 * cut 45° across the bottom third, as on a sled runner, so it rides up over the ground when dragged.
 * A splice in a long run stays square.
 */
export function skidOutline(from: number, to: number, bottom: number, height: number, start: boolean, end: boolean): { outline: Point[]; note?: string } {
  const cut = Math.round((height / 3) * 8) / 8;
  const top = bottom + height;
  const outline: Point[] = [
    ...(start ? ([[from, bottom + cut], [from + cut, bottom]] as Point[]) : ([[from, bottom]] as Point[])),
    ...(end ? ([[to - cut, bottom], [to, bottom + cut]] as Point[]) : ([[to, bottom]] as Point[])),
    [to, top],
    [from, top],
  ];
  const ends = start && end ? 'Both ends' : start || end ? 'The outer end' : null;
  return { outline, ...(ends && { note: `${ends} cut 45° across the bottom, ${formatInches(cut)} up and in, so the shed drags without digging in.` }) };
}
