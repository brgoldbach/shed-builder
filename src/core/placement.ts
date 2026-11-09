import type { Opening, ShedConfig } from './config';
import { formatInches } from './units';

type Along = Opening['along'];

/** Corner-to-corner length of a wall, outside faces of the framing. */
export function wallSpan(config: Pick<ShedConfig, 'width' | 'length'>, wall: Opening['wall']): number {
  return wall === 'front' || wall === 'back' ? config.length : config.width;
}

/** The wall's left corner (viewed from outside) to the RO left edge, for a position along the wall. */
export function roOffset(along: Along, value: number, span: number, width: number): number {
  if (along === 'left') return value;
  if (along === 'right') return span - value - width;
  return (span * value) / 100 - width / 2;
}

/** The position along the wall that puts the RO left edge at `offset`. Inverse of `roOffset`. */
export function positionFor(along: Along, offset: number, span: number, width: number): number {
  if (along === 'left') return offset;
  if (along === 'right') return span - offset - width;
  return ((offset + width / 2) / span) * 100;
}

/** RO centers, in percent, for `count` openings spread evenly: each at the center of an equal share. */
export function evenPercents(count: number): number[] {
  return Array.from({ length: count }, (_, index) => ((2 * index + 1) / (2 * count)) * 100);
}

export function positionText(along: Along, value: number): string {
  return along === 'percent' ? `${value}%` : `${formatInches(value)} from ${along}`;
}
