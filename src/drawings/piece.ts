import { LUMBER } from '../core/catalog';
import { ROLES, type Member, type Point } from '../core/member';
import { LENGTH_RULE } from '../core/out/cutlist';
import { formatInches } from '../core/units';
import { memberTitle, type Dimension, type Drawing, type Shape } from './drawing';

const NEAR = 1 / 32;
const ALONG: Point = [1, 0];
const ACROSS: Point = [0, 1];
const KEY_GAP = 14; // in between the key's examples: room for their dimensions

/** A piece laid flat: its outline in inches, its length to the right and its width up. */
export function outlineOf(member: Member): Point[] {
  if (member.profile) return member.profile.points.map(([along, across]) => [along, across]);
  const { width } = LUMBER[member.size];
  return [[0, 0], [member.length, 0], [member.length, width], [0, width]];
}

// The two long edges of a flat piece: their levels and their extents along it.
function edgesOf(outline: readonly Point[]) {
  const levels = outline.map(([, across]) => across);
  const [low, high] = [Math.min(...levels), Math.max(...levels)];
  const extent = (level: number): [number, number] => {
    const on = outline.filter(([, across]) => Math.abs(across - level) < 1e-6).map(([along]) => along);
    return [Math.min(...on), Math.max(...on)];
  };
  return { low, high, bottom: extent(low), top: extent(high) };
}

const size = ([from, to]: [number, number]) => to - from;

/**
 * How a piece's ends are cut: both square, one end, both ends toward each other (one edge
 * holds both long points), or both the same way (the long points are on opposite edges).
 */
export type CutKind = 'square' | 'one-end' | 'toward' | 'parallel';

export function cutKind(outline: readonly Point[]): CutKind {
  const { bottom, top } = edgesOf(outline);
  const startCut = Math.abs(bottom[0] - top[0]) > NEAR;
  const endCut = Math.abs(bottom[1] - top[1]) > NEAR;
  if (!startCut && !endCut) return 'square';
  if (startCut !== endCut) return 'one-end';
  const holds = (outer: [number, number], inner: [number, number]) => outer[0] <= inner[0] && outer[1] >= inner[1];
  return holds(bottom, top) || holds(top, bottom) ? 'toward' : 'parallel';
}

// The cut length from long point to long point, below the piece; each edge shorter than it, on its
// side; and the board width at the right end.
function pieceDims(outline: readonly Point[]): Dimension[] {
  const { low, high, bottom, top } = edgesOf(outline);
  const first = outline.reduce((best, point) => (point[0] < best[0] ? point : best));
  const last = outline.reduce((best, point) => (point[0] > best[0] ? point : best));
  const length = last[0] - first[0];
  const edge = (extent: [number, number], level: number, offset: number): Dimension[] =>
    size(extent) > NEAR && size(extent) < length - NEAR
      ? [{ kind: 'aligned', from: [extent[0], level], to: [extent[1], level], offset, along: ALONG }]
      : [];
  return [
    { kind: 'aligned', from: first, to: last, offset: -40, along: ALONG },
    ...edge(bottom, low, -16),
    ...edge(top, high, 16),
    { kind: 'aligned', from: [bottom[1], low], to: [top[1], high], offset: -16, along: ACROSS },
  ];
}

const pieceShape = (member: Member, outline: Point[], mark?: string): Shape => ({
  outline: { kind: 'polygon', points: outline },
  kind: 'member',
  id: member.id,
  role: member.role,
  treated: member.treated,
  mark,
  title: memberTitle(member, mark),
  axis: ALONG,
});

/** One piece laid flat, dimensioned as the cut list measures it. */
export function pieceDrawing(member: Member, mark?: string): Drawing {
  const outline = outlineOf(member);
  return {
    id: `piece-${member.id}`,
    title: memberTitle(member, mark),
    shapes: [pieceShape(member, outline, mark)],
    dims: pieceDims(outline),
    labels: [],
    outlines: [],
    notes: [LENGTH_RULE, ...(member.note ? [member.note] : [])],
  };
}

const KINDS: { kind: CutKind; text: string }[] = [
  { kind: 'one-end', text: 'One end cut. The cut length is the long side.' },
  { kind: 'toward', text: 'Both ends cut toward each other. The cut length is the long edge.' },
  {
    kind: 'parallel',
    text: 'Both ends cut the same way. The long points are on opposite edges, so the cut length is longer than either edge.',
  },
];

/** One angled piece of the design for each way its ends can be cut, laid flat and dimensioned. */
export function cutLengthKey(members: readonly Member[], marks: ReadonlyMap<string, string>): Drawing | null {
  const examples = KINDS.flatMap(({ kind, text }) => {
    const matches = members.filter((member) => member.profile && cutKind(outlineOf(member)) === kind);
    // The simplest outline reads best, then the longest piece.
    const corners = (member: Member) => member.profile!.points.length;
    const best = matches.reduce<Member | undefined>(
      (pick, member) =>
        !pick || corners(member) < corners(pick) || (corners(member) === corners(pick) && member.length > pick.length + NEAR) ? member : pick,
      undefined,
    );
    return best ? [{ member: best, text }] : [];
  });
  if (!examples.length) return null;

  const shapes: Shape[] = [];
  const dims: Dimension[] = [];
  const notes = [LENGTH_RULE];
  let top = 0;
  for (const { member, text } of examples) {
    const flat = outlineOf(member);
    const width = Math.max(...flat.map(([, across]) => across));
    const outline = flat.map(([along, across]): Point => [along, across + top - width]);
    top -= width + KEY_GAP;
    const mark = marks.get(member.id);
    shapes.push(pieceShape(member, outline, mark));
    dims.push(...pieceDims(outline));
    const { bottom, top: upper } = edgesOf(outline);
    const [long, short] = [size(bottom), size(upper)].sort((one, other) => other - one);
    notes.push(
      `${mark ? `${mark}, ` : ''}${ROLES[member.role].toLowerCase()}: ${text} Here ${formatInches(member.length)}, with edges of ` +
        `${formatInches(long)} and ${formatInches(short)}.`,
    );
  }
  return { id: 'cut-lengths', title: 'Measuring cut lengths', shapes, dims, labels: [], outlines: [], notes };
}
