import { LUMBER, stockFor, type LumberSize } from '../catalog';
import { OPPOSITE, type Addition, type ShedConfig } from '../config';
import type { Assembly, Member, Point, Role, Solid, Vec3 } from '../member';
import { formatInches } from '../units';
import { planeMember } from './section';
import { skidOutline, supportLines, type SupportLines } from './supports';
import { splitPlate, type Frame, type Wall } from './walls';

const PLY = 1.5;
const GAP = 0.25; // between deck boards
const MIN_PIECE = 3; // shortest deck board piece worth cutting
const NEAR = 0.01;
const UP: Vec3 = [0, 0, 1];

type Span = readonly [number, number];

const cross = (first: Vec3, second: Vec3): Vec3 => [
  first[1] * second[2] - first[2] * second[1],
  first[2] * second[0] - first[0] * second[2],
  first[0] * second[1] - first[1] * second[0],
];
const dot = (first: Vec3, second: Vec3) => first[0] * second[0] + first[1] * second[1] + first[2] * second[2];

/** Plies in a deck beam: enough to bear the full width of a `post` (4x4: 3, 6x6: 4). */
export const deckPlies = (post: Addition['post']) => Math.max(2, Math.ceil(LUMBER[post].width / PLY - NEAR));

/** A lean-to's deck stands on the shed's skids or girders: not on a slab shed. */
export const onShed = (config: ShedConfig, addition: Addition) =>
  addition.floor === 'deck' && addition.deck.support === 'shed' && config.foundation.type !== 'slab';

/** Out from the wall to the outer face of the deck beam. */
export const deckReach = ({ depth, post }: Addition) => depth - LUMBER[post].width / 2 + (deckPlies(post) * PLY) / 2;

/** A lean-to's extent along its wall from the wall's left corner, viewed from outside, clamped to the wall. */
export function leanToSpan(config: ShedConfig, addition: Addition, side: Addition['side'], center: number): [number, number] {
  const span = side === 'front' || side === 'back' ? config.length : config.width;
  if (addition.length === 'full') return [0, span];
  const middle = (center / 100) * span;
  return [Math.max(0, middle - addition.length / 2), Math.min(span, middle + addition.length / 2)];
}

/**
 * For each gable end, the decks that continue the shed's skids or girders: how far out they reach,
 * the y range they cover, and their joist spacing. A run at y in that range runs on out by `reach`.
 */
export function continuedDecks(config: ShedConfig): { side: 'left' | 'right'; reach: number; ys: [number, number]; oc: number }[] {
  return config.additions.flatMap((addition) => {
    if (!onShed(config, addition) || addition.deck.join !== 'continue') return [];
    const sides = addition.mirror ? [addition.side, OPPOSITE[addition.side]] : [addition.side];
    return sides.flatMap((side) => {
      if (side !== 'left' && side !== 'right') return [];
      const center = side === addition.side ? addition.center : 100 - addition.center;
      const [u0, u1] = leanToSpan(config, addition, side, center);
      // The left wall's u runs from the back (y = width) to the front; the right wall's from the front.
      const ys: [number, number] = side === 'left' ? [config.width - u1, config.width - u0] : [u0, u1];
      return [{ side, reach: deckReach(addition), ys, oc: addition.deck.oc }];
    });
  });
}

/** A deck's heights, up from the floor surface at z = 0, and the shed's lines it may stand on. */
export interface DeckHeights {
  supports: SupportLines | null;
  top: number; // the deck surface
  joistTop: number;
  joistBottom: number; // under any notch
  notch: number; // cut up from a joist bottom at each bearing on the shed's lines
}

/**
 * The deck surface is the drop below the floor. On the shed's lines the joists sit on their top;
 * where that would set the deck higher, the joists are notched at their bearings. Null without a deck.
 */
export function deckHeights(config: ShedConfig, addition: Addition): DeckHeights | null {
  if (addition.floor !== 'deck') return null;
  const supports = onShed(config, addition) ? supportLines(config) : null;
  const joistDepth = LUMBER[addition.deck.joist].width;
  const board = LUMBER[addition.deck.boards].thick;
  const onLines = supports ? supports.top + joistDepth + board : Infinity;
  const top = Math.min(onLines, -addition.deck.drop);
  const joistTop = top - board;
  return { supports, top, joistTop, joistBottom: joistTop - joistDepth, notch: supports ? onLines - top : 0 };
}

/** What the span checks and the BOM need from a deck. */
export interface DeckFacts {
  joist: LumberSize;
  plies: number;
  joistSpan: number; // the joists' longest bay between bearings
  beamSpan: number; // between supports; 0 on a continuous skid or girder
  beamTributary: number; // deck carried per unit length of beam
  seats: number; // piers under the beam
  hangers: number; // joist hangers of the joist size
  ledgerLags: number;
}

/** A lean-to's deck site: where it goes, and where its parts go. */
export interface DeckSite {
  config: ShedConfig;
  addition: Addition;
  side: Wall;
  frame: Frame;
  span: Span; // along the wall from its left corner, viewed from outside
  line: number; // the post line, out from the wall's outside face
  posts: readonly number[]; // post centers along the wall
  grade: number;
  pierTop: number; // on piers: the pier tops
  heights: DeckHeights;
  assembly: Assembly;
  nextId: (code: string) => string;
  members: Member[];
  solids: Solid[];
  warn: (message: string) => void;
}

// A piece runs along the wall, or out from it.
type Run = 'along' | 'out';

/**
 * A lean-to's deck: boards over joists between the wall and the post line, its beam on the post
 * line, and the lean-to posts on the beam.
 *
 * - On piers, or on an eave side on the shed's foundation: a ledger on the floor framing and joists
 *   in hangers out to a flush beam. On piers the beam bears on the piers, or on deck posts on them.
 *   On the shed's foundation it bears on the outer of the deck's own skids or girders, which run
 *   along the wall, with more lines under the joists between.
 * - On a gable end on the shed's foundation: the shed's skids or girders run out from the wall,
 *   continued or in line, so the joists and beam run along the wall on them, between rim joists.
 */
export function frameDeck(site: DeckSite): DeckFacts {
  const { config, addition, side, frame, line, posts, pierTop, heights, assembly, nextId, members, solids, warn } = site;
  const [u0, u1] = site.span;
  const { joist, oc, boards } = addition.deck;
  const { supports, top, joistTop, joistBottom, notch } = heights;
  const joistDepth = LUMBER[joist].width;
  const post = LUMBER[addition.post].width;
  const plies = deckPlies(addition.post);
  const [beamInner, beamOuter] = [line - (plies * PLY) / 2, line + (plies * PLY) / 2];
  const maxStock = (size: LumberSize) => Math.max(...stockFor(config.catalog, size));
  const lineName = supports?.kind === 'skid' ? 'skid' : 'girder';

  // Points and axes for a piece that runs along the wall or out from it: `along` its length,
  // `across` it, both from the wall's left corner and outside face.
  const outward: Vec3 = [-frame.v[0], -frame.v[1], 0];
  const lengthAxis = (run: Run): Vec3 => (run === 'along' ? frame.u : outward);
  const acrossAxis = (run: Run): Vec3 => (run === 'along' ? outward : frame.u);
  const point = (run: Run, along: number, across: number, z: number): Vec3 => {
    const [u, x] = run === 'along' ? [along, across] : [across, along];
    return [frame.origin[0] + frame.u[0] * u + outward[0] * x, frame.origin[1] + frame.u[1] * u + outward[1] * x, z];
  };
  const push = (member: Omit<Member, 'id' | 'assembly' | 'treated'> & { code: string }) => {
    const { code, ...rest } = member;
    members.push({ id: nextId(code), assembly, treated: true, ...rest });
  };

  /**
   * A piece on edge over `[from, to]` along `run`, from `low` to `low + thick` across it, its bottom
   * at `bottom`, as deep as its lumber. `notches` cut `notch` up from its bottom at bearings; `rip`
   * takes `notch` off the bottom of a piece that rests on a line all along.
   */
  const onEdge = (code: string, role: Role, size: LumberSize, run: Run, [from, to]: Span, low: number, bottom: number, note?: string, notches: Span[] = [], rip = false) => {
    const { thick, width: depth } = LUMBER[size];
    const length = lengthAxis(run);
    // Right-handed axes: thick = length × up, which points one way or the other across the run.
    const thickAxis = cross(length, UP);
    const near = dot(thickAxis, acrossAxis(run)) > 0 ? low : low + thick;
    const cut = rip ? ` Rip to ${formatInches(depth - notch)}.` : notches.length ? ` Notch ${formatInches(notch)} at each bearing.` : '';
    const outline: Point[] | null = rip
      ? [[0, 0], [to - from, 0], [to - from, depth - notch], [0, depth - notch]]
      : notches.length
        ? notchedOutline(to - from, depth, notch, true, notches)
        : null;
    push({
      code,
      role,
      size,
      length: to - from,
      origin: point(run, from, near, rip ? bottom + notch : bottom),
      axes: { length, width: UP, thick: thickAxis },
      ...(outline && { profile: { points: outline, depth: thick } }),
      ...((note || cut) && { note: `${note ?? ''}${cut}`.trim() }),
    });
  };

  /**
   * A row of boards over `[from, to]` along `run`, `low` to `low + width` across it, its top the
   * deck surface. Where the posts reach one edge it is notched; where they cover or stand inside it,
   * it is cut between them, with no piece under MIN_PIECE.
   */
  const boardRow = (run: Run, [from, to]: Span, low: number, postsAcross: Span[], postsAlong: Span[]) => {
    const { width, thick } = LUMBER[boards];
    const length = lengthAxis(run);
    const across = acrossAxis(run);
    // Right-handed axes: thick = length × across, up or down. A board facing down starts at the top.
    const normal = cross(length, across);
    const z = normal[2] > 0 ? joistTop : top;
    const board = (start: number, end: number, note?: string, outline?: Point[]) =>
      push({
        code: 'DK',
        role: 'decking',
        size: boards,
        length: end - start,
        origin: point(run, start, low, z),
        axes: { length, width: across, thick: normal },
        ...(outline && { profile: { points: outline, depth: thick } }),
        ...(note && { note }),
      });
    const reach = postsAcross.map(([start, end]): Span => [Math.max(start, low) - low, Math.min(end, low + width) - low]).filter(([start, end]) => end - start > NEAR);
    const hits = reach.length ? postsAlong.filter(([start, end]) => start < to - NEAR && end > from + NEAR) : [];
    if (hits.length === 0) {
      board(from, to);
      return;
    }
    const [lowest, highest] = [Math.min(...reach.map(([start]) => start)), Math.max(...reach.map(([, end]) => end))];
    const [inner, outer] = [lowest <= NEAR, highest >= width - NEAR];
    if (inner !== outer) {
      const notches = hits.map(([start, end]): Span => [Math.max(start, from) - from, Math.min(end, to) - from]);
      board(from, to, 'Notch around the posts.', notchedOutline(to - from, width, highest - lowest, inner, notches));
      return;
    }
    let start = from;
    for (const [left, right] of [...hits].sort((first, second) => first[0] - second[0])) {
      if (left - start >= MIN_PIECE) board(start, left, 'Cut to fit between the posts.');
      start = Math.max(start, right);
    }
    if (to - start >= MIN_PIECE) board(start, to, 'Cut to fit between the posts.');
  };

  /**
   * One of the deck's own skid or girder lines, centered `center` across `run`, over `[from, to]`
   * along it, its top at the shed's line top. Skids get a cut outer end, or both ends along the wall;
   * girders get the shed's piers and posts.
   */
  const supportLine = (run: Run, center: number, [from, to]: Span) => {
    if (!supports) return;
    const length = lengthAxis(run);
    if (supports.kind === 'skid') {
      const size = config.foundation.skid.size;
      const height = LUMBER[size].width;
      const { outline, note } = skidOutline(from, to, supports.top - height, height, run === 'along' || from > NEAR, true);
      // The skid extrudes along length × up from its plane: start at the face that extrusion leaves.
      const forward = dot(cross(length, UP), acrossAxis(run)) > 0;
      const origin = point(run, 0, forward ? center - supports.across / 2 : center + supports.across / 2, 0);
      const base = { id: nextId('SK'), assembly, role: 'skid', size, ...(note && { note }) } as const;
      members.push({ ...planeMember(base, { origin, h: length }, outline, [1, 0], supports.across), treated: true });
      return;
    }
    const { pier } = config.foundation;
    const { thick: plyThick, width: girderDepth } = LUMBER[pier.girder];
    const girderBottom = supports.top - girderDepth;
    const radius = pier.diameter / 2;
    const bays = Math.max(1, Math.ceil((to - from - 2 * radius) / pier.maxSpacing));
    const pierAt = Array.from({ length: bays + 1 }, (_, index) => from + radius + (index * (to - from - 2 * radius)) / bays);
    for (let ply = 0; ply < pier.girderPlies; ply++) {
      const low = center - (pier.girderPlies * plyThick) / 2 + ply * plyThick;
      for (const span of splitPlate([from, to], maxStock(pier.girder), pierAt)) onEdge('GD', 'girder', pier.girder, run, span, low, girderBottom);
    }
    const postLength = pier.post === 'none' ? 0 : pier.postLength;
    const top = girderBottom - postLength;
    for (const along of pierAt) {
      if (pier.post !== 'none') {
        const half = LUMBER[pier.post].width / 2;
        push({
          code: 'PS',
          role: 'post',
          size: pier.post,
          length: postLength,
          origin: point(run, along - half, center - half, top),
          axes: { length: UP, width: length, thick: acrossAxis(run) },
          note: 'Under the deck girder.',
        });
      }
      solids.push({
        id: nextId('PR'),
        label: `Pier, ${pier.diameter}" diameter`,
        layer: 'foundation',
        material: 'concrete',
        shape: { kind: 'cylinder', base: point(run, along, center, top - pier.aboveGrade - pier.depth), radius, height: pier.aboveGrade + pier.depth },
      });
    }
  };

  // The notch at each bearing of a piece over `[from, to]` on lines centered at `centers`.
  const bearings = (from: number, to: number, centers: readonly number[]): Span[] =>
    supports && notch > NEAR
      ? centers.flatMap((center): Span[] => {
          const [start, end] = [center - supports.across / 2, center + supports.across / 2];
          return start < to - NEAR && end > from + NEAR ? [[Math.max(start, from) - from, Math.min(end, to) - from]] : [];
        })
      : [];

  if (joistBottom < site.grade) warn(`The deck framing runs ${formatInches(site.grade - joistBottom)} below grade.`);
  if (notch > joistDepth / 4 + NEAR) {
    warn(`The deck joists are notched ${formatInches(notch)} at their bearings, more than 1/4 of their depth. A smaller deck joist needs less.`);
  }
  // IRC R507.7: 5/4 decking spans 16 in, 2x6 decking 24 in.
  const boardSpan = boards === '5/4x6' ? 16 : 24;
  if (oc > boardSpan) warn(`${boards} deck boards span ${boardSpan}" at most; the joists are ${oc}" apart.`);
  const postsAlongWall: Span[] = posts.map((u) => [u - post / 2, u + post / 2]);
  const postsOut: Span = [line - post / 2, line + post / 2];
  const { width: boardWidth } = LUMBER[boards];

  if (supports && (side === 'left' || side === 'right')) {
    const toU = (y: number) => (side === 'left' ? config.width - y : y);
    const shedLines = supports.ys.map(toU).filter((u) => u > u0 - NEAR && u < u1 + NEAR);
    if (shedLines.length === 0) warn(`No shed ${lineName}s run under the deck. It gets its own at its ends.`);
    const centers = (shedLines.length > 0 ? shedLines : [u0 + supports.across / 2, u1 - supports.across / 2]).sort((first, second) => first - second);
    if (addition.deck.join === 'separate' || shedLines.length === 0) {
      for (const center of centers) supportLine('out', center, [0, beamOuter]);
    }
    // Rim joists close each end, from the wall out past the beam. One over a line rests on it all along.
    const overLine = (u: number) => centers.some((center) => Math.abs(center - u) < supports.across / 2 + PLY / 2);
    for (const low of [u0, u1 - PLY]) {
      onEdge('DR', 'rim.deck', joist, 'out', [0, beamOuter], low, joistBottom, 'Closes the end of the deck.', [], notch > NEAR && overLine(low + PLY / 2));
    }
    const inside: Span = [u0 + PLY, u1 - PLY];
    const joistsOut = [0];
    for (let index = 1; index * oc + PLY / 2 <= beamInner; index++) joistsOut.push(index * oc - PLY / 2);
    for (const low of joistsOut) {
      for (const span of splitPlate(inside, maxStock(joist), centers)) {
        onEdge('DJ', 'joist.deck', joist, 'along', span, low, joistBottom, `On the ${lineName}s.`, bearings(span[0], span[1], centers));
      }
    }
    for (let ply = 0; ply < plies; ply++) {
      for (const span of splitPlate(inside, maxStock(joist), centers)) {
        onEdge('DB', 'beam.deck', joist, 'along', span, beamInner + ply * PLY, joistBottom, `On the ${lineName}s; the posts stand on it.`, bearings(span[0], span[1], centers));
      }
    }
    // Boards out from the wall across the joists, 1/4 in apart.
    const rows = Math.ceil((u1 - u0 + GAP) / (boardWidth + GAP));
    for (let row = 0; row < rows; row++) boardRow('out', [0, beamOuter], u0 + row * (boardWidth + GAP), postsAlongWall, [postsOut]);
    const gaps = centers.slice(1).map((center, index) => center - centers[index]);
    const span = Math.max(centers[0] - u0, u1 - centers[centers.length - 1], ...gaps);
    return { joist, plies, joistSpan: span, beamSpan: span, beamTributary: oc / 2 + (beamOuter - beamInner), seats: 0, hangers: 0, ledgerLags: 0 };
  }

  // The ledger bears on the floor framing: the wall sheathing starts above it.
  const ledgerFace = PLY;
  const joists = [u0, u1 - PLY];
  for (let index = 1; u0 + index * oc < u1; index++) {
    const from = u0 + index * oc - PLY / 2;
    if (from >= u0 + PLY && from + PLY <= u1 - PLY) joists.push(from);
  }
  joists.sort((first, second) => first - second);
  const joistCenters = joists.map((u) => u + PLY / 2);
  // On the shed's foundation: lines along the wall no farther apart than the shed's, the outer one
  // under the beam.
  let lineXs: number[] = [];
  if (supports) {
    const spacing = supports.ys.length > 1 ? supports.ys[1] - supports.ys[0] : line;
    const count = Math.max(1, Math.ceil(line / spacing - NEAR));
    lineXs = Array.from({ length: count }, (_, index) => (line * (index + 1)) / count);
    for (const x of lineXs) supportLine('along', x, [u0, u1]);
  }
  for (const span of splitPlate([u0, u1], maxStock(joist), joistCenters)) {
    onEdge('DL', 'ledger.deck', joist, 'along', span, 0, joistBottom, 'Lag-bolt into the floor framing, two at each joist.');
  }
  const joistNote = supports && lineXs.length > 1 ? `Joist hangers at both ends; bears on the ${lineName}s between.` : 'Joist hangers at both ends.';
  for (const low of joists) {
    onEdge('DJ', 'joist.deck', joist, 'out', [ledgerFace, beamInner], low, joistBottom, joistNote, bearings(ledgerFace, beamInner, lineXs.slice(0, -1)));
  }
  const seated = !supports && pierTop === joistBottom;
  const beamNote = supports
    ? `On the outer ${lineName}; the posts stand on it.`
    : seated
      ? 'Bears on the piers; the posts stand on it.'
      : 'Bears on the deck posts; the posts above stand on it.';
  for (let ply = 0; ply < plies; ply++) {
    // On the outer line all along: ripped when the joists are notched.
    for (const span of splitPlate([u0, u1], maxStock(joist), supports ? joistCenters : posts)) {
      onEdge('DB', 'beam.deck', joist, 'along', span, beamInner + ply * PLY, joistBottom, beamNote, [], notch > NEAR);
    }
  }
  if (!supports && !seated) {
    for (const u of posts) {
      push({
        code: 'DP',
        role: 'post',
        size: addition.post,
        length: joistBottom - pierTop,
        origin: point('along', u - post / 2, line + post / 2, pierTop),
        axes: { length: UP, width: frame.u, thick: frame.v },
        note: 'Under the deck beam.',
      });
    }
  }
  // Boards along the wall from the floor framing out past the beam, 1/4 in apart.
  const rows = Math.ceil((beamOuter + GAP) / (boardWidth + GAP));
  for (let row = 0; row < rows; row++) {
    for (const span of splitPlate([u0, u1], maxStock(boards), joistCenters)) boardRow('along', span, row * (boardWidth + GAP), [postsOut], postsAlongWall);
  }
  const bearingsOut = [ledgerFace, ...lineXs.slice(0, -1), beamInner];
  const joistSpan = Math.max(...bearingsOut.slice(1).map((x, index) => x - bearingsOut[index]));
  return {
    joist,
    plies,
    joistSpan,
    beamSpan: supports ? 0 : (u1 - u0 - post) / (posts.length - 1),
    beamTributary: joistSpan / 2 + (beamOuter - beamInner),
    seats: seated ? posts.length : 0,
    hangers: 2 * joists.length,
    ledgerLags: 2 * joists.length,
  };
}

/**
 * The outline of a piece `length` long and `width` wide, with `notches` (spans along it) cut `depth`
 * in from its inner edge (width 0), or its outer edge. Points on a straight run go, so a notch at an
 * end leaves no sliver.
 */
export function notchedOutline(length: number, width: number, depth: number, inner: boolean, notches: readonly Span[]): Point[] {
  const sorted = [...notches].sort((first, second) => first[0] - second[0]);
  const points: Point[] = inner
    ? [[0, 0], ...sorted.flatMap(([from, to]): Point[] => [[from, 0], [from, depth], [to, depth], [to, 0]]), [length, 0], [length, width], [0, width]]
    : [[0, 0], [length, 0], [length, width], ...[...sorted].reverse().flatMap(([from, to]): Point[] => [[to, width], [to, width - depth], [from, width - depth], [from, width]]), [0, width]];
  const straight = (list: Point[], index: number) => {
    const [before, point, after] = [list[(index + list.length - 1) % list.length], list[index], list[(index + 1) % list.length]];
    return Math.abs((point[0] - before[0]) * (after[1] - point[1]) - (point[1] - before[1]) * (after[0] - point[0])) < 1e-9;
  };
  let result = points;
  for (let index = result.findIndex((_, at) => straight(result, at)); index >= 0; index = result.findIndex((_, at) => straight(result, at))) {
    result = result.filter((_, at) => at !== index);
  }
  return result;
}
