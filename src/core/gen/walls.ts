import { LUMBER, stockFor, type LumberSize, type TwoBy } from '../catalog';
import { WALLS, type Opening, type OpeningType, type ShedConfig } from '../config';
import { ASSEMBLIES, type Member, type Role, type Solid, type Vec3, type Warning } from '../member';
import { naming } from '../naming';
import { positionText, roOffset } from '../placement';
import { formatInches } from '../units';

export type Wall = (typeof WALLS)[number];
type Span = readonly [number, number];
type Axes = Member['axes'];

const PLY = 1.5; // thickness of a 2x plate or stud
const CAP_SPLICE_OFFSET = 24; // min distance from a cap-plate splice to a top-plate splice
const MIN_PLATE_PIECE = 24; // no short offcut pieces at a plate end
const MIN_CRIPPLE = 3; // a smaller gap above a header closes: the header goes tight to the plate
const BOLT_EMBED = 7; // shown embedment of the anchor bolts in the slab
const NEAR = 0.01;
const UP: Vec3 = [0, 0, 1];

type VerticalRole = Extract<Role, 'corner' | 'stud' | 'king' | 'jack' | 'cripple'>;
const VERTICAL_CODES: Record<VerticalRole, string> = { corner: 'C', stud: 'S', king: 'K', jack: 'J', cripple: 'CR' };

/**
 * Wall frame: origin at the building corner on the wall's left end, viewed from outside.
 * u runs along the wall to the right, v runs inward, z is up.
 */
export interface Frame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
}

export function wallFrames(width: number, length: number): Record<Wall, Frame> {
  return {
    front: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
    back: { origin: [length, width, 0], u: [-1, 0, 0], v: [0, -1, 0] },
    left: { origin: [0, width, 0], u: [0, -1, 0], v: [1, 0, 0] },
    right: { origin: [length, 0, 0], u: [0, 1, 0], v: [-1, 0, 0] },
  };
}

/** Walls at u = 0 and at u = span. Front and back run through; left and right fit between them. */
export const ADJACENT: Record<Wall, readonly [Wall, Wall]> = {
  front: ['left', 'right'],
  back: ['right', 'left'],
  left: ['back', 'front'],
  right: ['front', 'back'],
};

// The eave walls run through and carry the rafters.
const isThrough = (wall: Wall) => wall === 'front' || wall === 'back';

/** An end-wall row with its sill at or above the wall top: framed in the gable, not the wall. */
export const inGable = (config: ShedConfig, row: Opening) => !isThrough(row.wall) && row.sill >= wallTops(config)[row.wall] - NEAR;

const overlaps = ([low, high]: Span, [otherLow, otherHigh]: Span) => low < otherHigh && high > otherLow;

function at(frame: Frame, u: number, v: number, z: number): Vec3 {
  return [
    frame.origin[0] + frame.u[0] * u + frame.v[0] * v,
    frame.origin[1] + frame.u[1] * u + frame.v[1] * v,
    z,
  ];
}

/** On a slab, the size of the PT mud sill under each wall's bottom plate; null for none. */
export function mudSillSize(config: ShedConfig): TwoBy | null {
  const { mudSill, stud } = config.walls;
  if (config.foundation.type !== 'slab' || mudSill === 'none') return null;
  return mudSill === 'match' ? stud : mudSill;
}

// Mud sill, bottom plate, top plate, and cap plate.
const plateStack = (config: ShedConfig) => (mudSillSize(config) ? PLY : 0) + PLY * (config.walls.capPlate ? 3 : 2);

/**
 * Stud length of each wall: the precut length, or a custom wall height less its plates. On a
 * lean-to, the high wall is taller by the roof rise.
 */
export function studLengths(config: ShedConfig): Record<Wall, number> {
  const studLength = config.studHeight === 'custom' ? config.wallHeight - plateStack(config) : config.studHeight;
  const { stud } = config.walls;
  const lengths = { front: studLength, back: studLength, left: studLength, right: studLength };
  if (config.roof.style === 'lean-to') {
    // Full-width seats: the rafter underside meets the low wall's inside top corner and the
    // high wall's outside top corner, which are (width - wall depth) apart.
    lengths[config.roof.highSide] += (config.roof.pitch / 12) * (config.width - LUMBER[stud].width);
  }
  return lengths;
}

/** A fitted opening's RO: u along its wall's frame, heights from the floor surface. */
export interface RoughOpening {
  wall: Wall;
  name: string;
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Top of each wall's top plate, or cap plate: the rafter bearing height. */
export function wallTops(config: ShedConfig): Record<Wall, number> {
  const lengths = studLengths(config);
  const plates = plateStack(config);
  return {
    front: lengths.front + plates,
    back: lengths.back + plates,
    left: lengths.left + plates,
    right: lengths.right + plates,
  };
}

/** Plates, corners, layout studs, and opening framing of the four walls. */
export function frameWalls(config: ShedConfig): {
  members: Member[];
  warnings: Warning[];
  solids: Solid[];
  openings: RoughOpening[];
} {
  const heights = studLengths(config);
  const frame = wallFrames(config.width, config.length);
  const placed = placements(config);
  const warnings: Warning[] = [];
  const sillSize = mudSillSize(config);
  if (sillSize && LUMBER[sillSize].width < LUMBER[config.walls.stud].width) {
    warnings.push({ source: 'Walls', message: `The ${sillSize} mud sill is narrower than the ${config.walls.stud} walls.` });
  }
  const solids: Solid[] = [];
  const openings: RoughOpening[] = [];
  const members = WALLS.flatMap((wall) => {
    const own = placed.filter(({ row }) => row.wall === wall && !inGable(config, row));
    return frameWall(config, wall, frame[wall], heights, own, warnings, solids, openings);
  });
  return { members, warnings, solids, openings };
}

/** One opening at one position. The label names it in warnings and notes: "window 24x36 (front 50%)". */
export interface Placed {
  label: string;
  type: OpeningType;
  row: Opening;
  position: number;
}

export function placements(config: ShedConfig): Placed[] {
  const types = new Map(config.openingTypes.map((type) => [type.name, type]));
  const { side } = naming(config);
  return config.openings
    .filter((row) => row.enabled)
    .flatMap((row) =>
      row.at.map((position) => ({
        label: `${row.type} (${side(row.wall)} ${positionText(row.along, position)})`,
        type: types.get(row.type)!,
        row,
        position,
      })),
    );
}

const HEADER_PLIES: Record<OpeningType['girder'], number> = { single: 1, double: 2, triple: 3, flat: 1 };

export interface Header {
  style: OpeningType['girder'];
  size: LumberSize;
  plies: number;
  plateBelow: boolean;
  plateAbove: boolean;
  depth: number; // the whole stack, plates included
}

export function resolveHeader(type: OpeningType, walls: ShedConfig['walls']): Header {
  const { girder: style, plateBelow, plateAbove } = type;
  const size = style === 'flat' ? walls.stud : (type.header ?? walls.header);
  const { thick, width } = LUMBER[size];
  const main = style === 'flat' ? thick : width;
  const depth = main + PLY * (Number(plateBelow) + Number(plateAbove));
  return { style, size, plies: HEADER_PLIES[style], plateBelow, plateAbove, depth };
}

/** A placed opening that fits its wall or gable, with the framing positions resolved. */
export interface FittedOpening {
  label: string;
  type: OpeningType;
  offset: number; // wall's left corner to RO left edge
  sill: number; // floor to RO bottom
  jacks: number; // per side
  zone: Span; // outside face of the left king to outside face of the right king
  roTop: number; // underside of the header stack; above the placed RO top when the header is raised
  header: Header;
  sillBottom: number | null;
}

interface WallContext {
  config: ShedConfig;
  wall: Wall;
  span: number;
  start: number;
  end: number;
  depth: number;
  base: number; // top of the bottom plate
  plateUnder: number; // underside of the top plate
  wallTop: number;
}

/** Jacks per side, the king and jacks on each side, and the zone from king to king. */
export function openingZone(type: OpeningType, offset: number, walls: ShedConfig['walls']): { jacks: number; side: number; zone: Span } {
  const jacks = type.jacks === 'auto' ? (type.width > walls.doubleJackOver ? 2 : 1) : type.jacks;
  const side = (jacks + 1) * PLY;
  return { jacks, side, zone: [offset - side, offset + type.width + side] };
}

function fitOpening(
  { label, type, row, position }: Placed,
  context: WallContext,
  blocked: readonly Span[],
  warn: (message: string) => void,
): FittedOpening | null {
  const { walls } = context.config;
  const offset = roOffset(row.along, position, context.span, type.width);
  const { sill } = row;

  const { jacks, side, zone } = openingZone(type, offset, walls);
  if (zone[0] < context.start || zone[1] > context.end) {
    warn(`The framing runs past the wall end. The king and jacks need ${formatInches(side)} on each side of the RO.`);
    return null;
  }
  if (blocked.some((span) => overlaps(span, zone))) {
    warn('The framing overlaps a corner or another opening.');
    return null;
  }

  const header = resolveHeader(type, walls);
  if (header.style !== 'flat' && header.plies * LUMBER[header.size].thick > context.depth) {
    warn(`${header.plies} plies of ${header.size} are thicker than the wall.`);
    return null;
  }
  let roTop = sill + type.height;
  const gap = context.plateUnder - roTop - header.depth;
  if (gap < 0) {
    warn(
      `The header does not fit. RO top ${formatInches(roTop)} plus ${formatInches(header.depth)} of header ` +
        `is above the top plate at ${formatInches(context.plateUnder)}.`,
    );
    return null;
  }
  if (gap > 0 && gap < MIN_CRIPPLE) {
    roTop += gap;
    warn(
      `The header goes tight to the top plate, because cripples would be shorter than ${formatInches(MIN_CRIPPLE)}. ` +
        `The RO height grows by ${formatInches(gap)} to ${formatInches(roTop - sill)}.`,
    );
  }

  let sillBottom: number | null = null;
  if (sill > 0) {
    sillBottom = sill - walls.sillPlies * PLY;
    if (sillBottom < context.base) {
      warn('The rough sill is below the top of the bottom plate.');
      return null;
    }
  }

  if (header.style === 'flat' && isThrough(context.wall)) warn('A flat header is on a bearing wall.');
  const headroom = context.wallTop - roTop;
  if (type.kind === 'overhead' && headroom < type.headroom) {
    warn(`The headroom above the RO is ${formatInches(headroom)}. The door needs ${formatInches(type.headroom)}.`);
  }

  return { label, type, offset, sill, jacks, zone, roTop, header, sillBottom };
}

function frameWall(
  config: ShedConfig,
  wall: Wall,
  frame: Frame,
  heights: Record<Wall, number>,
  placed: readonly Placed[],
  warnings: Warning[],
  solids: Solid[],
  openings: RoughOpening[],
): Member[] {
  const { walls } = config;
  const assembly = `wall.${wall}` as const;
  const { prefix } = ASSEMBLIES[assembly];
  const depth = LUMBER[walls.stud].width;
  const through = isThrough(wall);
  const span = through ? config.length : config.width;
  const start = through ? 0 : depth;
  const end = span - start;
  const studLength = heights[wall];
  const sillSize = mudSillSize(config);
  const mudSillThick = sillSize ? PLY : 0;
  const base = mudSillThick + PLY; // top of the bottom plate: the studs stand here
  const plateUnder = base + studLength;

  const members: Member[] = [];
  const occupied: Span[] = []; // corners, kings, and jacks: layout studs skip these
  const centers: number[] = []; // full-height studs: plate splices land on these
  const counts = new Map<string, number>();

  function add(
    code: string,
    role: Role,
    size: LumberSize,
    length: number,
    origin: Vec3,
    axes: Axes,
    treated = false,
    note?: string,
  ) {
    members.push({ id: nextId(code), assembly, role, size, treated, length, origin, axes, ...(note && { note }) });
  }

  function nextId(code: string) {
    const count = (counts.get(code) ?? 0) + 1;
    counts.set(code, count);
    return `${prefix}-${code}${String(count).padStart(2, '0')}`;
  }

  function upright(role: VerticalRole, from: number, bottom = base, length = studLength) {
    if (role === 'corner' || role === 'king' || role === 'jack') occupied.push([from, from + PLY]);
    if (role === 'corner' || role === 'king' || role === 'stud') centers.push(from + PLY / 2);
    add(VERTICAL_CODES[role], role, walls.stud, length, at(frame, from, 0, bottom), {
      length: UP,
      width: frame.v,
      thick: frame.u,
    });
  }

  // California corner backing: turned flat on the inside edge of the end stud.
  function flat(from: number) {
    occupied.push([from, from + depth]);
    add('C', 'corner', walls.stud, studLength, at(frame, from, depth - PLY, base), {
      length: UP,
      width: frame.u,
      thick: frame.v,
    });
  }

  // A board laid flat across the wall depth: plates, rough sills, and flat headers.
  function flatBoard(code: string, role: Role, [from, to]: Span, z: number, treated = false, note?: string, size: LumberSize = walls.stud) {
    const axes = { length: frame.u, width: frame.v, thick: UP };
    add(code, role, size, to - from, at(frame, from, 0, z), axes, treated, note);
  }

  // Start positions of a piece `size` long, `inset` from each end of the wall.
  const bothEnds = (inset: number, size: number) => [inset, span - inset - size];

  if (through) {
    bothEnds(0, PLY).forEach((from) => upright('corner', from));
    if (walls.corner === 'four-stud') {
      // Solid post: end, middle, and backing studs face-nailed.
      bothEnds(PLY, PLY).forEach((from) => upright('corner', from));
      bothEnds(2 * PLY, PLY).forEach((from) => upright('corner', from));
    }
    // Backing stud just past the end wall's inside face.
    if (walls.corner === 'three-stud') bothEnds(depth, PLY).forEach((from) => upright('corner', from));
    if (walls.corner === 'california') bothEnds(PLY, depth).forEach(flat);
  } else {
    bothEnds(depth, PLY).forEach((from) => upright('corner', from));
  }

  const context: WallContext = {
    config,
    wall,
    span,
    start,
    end,
    depth,
    base,
    plateUnder,
    wallTop: plateUnder + PLY * (walls.capPlate ? 2 : 1),
  };
  const fitted: FittedOpening[] = [];
  for (const candidate of placed) {
    const blocked = [...occupied, ...fitted.map((other) => other.zone)];
    const warn = (message: string) => warnings.push({ source: candidate.label, message });
    const fit = fitOpening(candidate, context, blocked, warn);
    if (fit) fitted.push(fit);
  }

  for (const { type, offset, sill, jacks, zone, roTop, header, sillBottom } of fitted) {
    const roEnd = offset + type.width;
    openings.push({ wall, name: type.name, left: offset, right: roEnd, bottom: sill, top: roTop });
    upright('king', zone[0]);
    upright('king', zone[1] - PLY);
    for (let index = 1; index <= jacks; index++) {
      upright('jack', offset - index * PLY, base, roTop - base);
      upright('jack', roEnd + (index - 1) * PLY, base, roTop - base);
    }

    for (const board of openingBoards(frame, walls, { type, offset, zone, roTop, header, sillBottom })) {
      add(board.code, board.role, board.size, board.length, board.origin, board.axes);
    }
  }

  // Layout from the building corner, so sheet edges land on stud centers. Inside an opening,
  // the layout positions take cripples above the header and below the rough sill.
  for (let index = 1; index * walls.oc < span; index++) {
    const from = index * walls.oc - PLY / 2;
    const piece: Span = [from, from + PLY];
    if (from < start || from + PLY > end) continue;
    if (occupied.some((other) => overlaps(other, piece))) continue;
    const fit = fitted.find((candidate) => overlaps(candidate.zone, piece));
    if (!fit) {
      upright('stud', from);
      continue;
    }
    const headerTop = fit.roTop + fit.header.depth;
    if (plateUnder - headerTop > 0) upright('cripple', from, headerTop, plateUnder - headerTop);
    if (fit.sillBottom !== null && fit.sillBottom > base) upright('cripple', from, base, fit.sillBottom - base);
  }

  const maxStock = Math.max(...stockFor(config.catalog, walls.stud));
  const onSlab = config.foundation.type === 'slab';
  // The bottom plate runs through doorways so the wall goes up in one piece. The doorway part is
  // cut out after the wall is anchored.
  const doorways = fitted.filter(({ sill }) => sill === 0);
  for (const piece of splitPlate([start, end], maxStock, centers)) {
    const cuts = doorways
      .filter(({ offset, type }) => overlaps(piece, [offset, offset + type.width]))
      .map(
        ({ label, offset, type }) =>
          `cut out ${label} from ${formatInches(offset - piece[0])} ` +
          `to ${formatInches(offset + type.width - piece[0])}`,
      );
    const note = cuts.length ? `After anchoring, ${cuts.join('; ')} from the left end, viewed from outside.` : undefined;
    if (sillSize) {
      flatBoard('SL', 'plate.sill', piece, 0, true, note, sillSize);
      flatBoard('BP', 'plate.bottom', piece, mudSillThick, false, note);
    } else {
      flatBoard(onSlab ? 'SL' : 'BP', onSlab ? 'plate.sill' : 'plate.bottom', piece, 0, onSlab, note);
    }
    if (onSlab) {
      // Anchor bolts on the sill's centerline, in each part of the piece clear of doorways.
      const { anchorSpacing, anchorEndDistance } = config.foundation.slab;
      const sillWidth = LUMBER[sillSize ?? walls.stud].width;
      const doorSpans: Span[] = doorways.map(({ offset, type }) => [offset, offset + type.width]);
      for (const [low, high] of subtract(piece, doorSpans)) {
        for (const u of boltPositions(low, high, anchorEndDistance, anchorSpacing)) {
          const [x, y] = at(frame, u, sillWidth / 2, 0);
          solids.push({
            id: nextId('AB'),
            label: 'Anchor bolt, 1/2"',
            layer: 'foundation',
            material: 'steel',
            shape: { kind: 'cylinder', base: [x, y, -BOLT_EMBED], radius: 0.25, height: BOLT_EMBED + PLY + 1 },
          });
        }
      }
    }
  }
  const topPieces = splitPlate([start, end], maxStock, centers);
  topPieces.forEach((piece) => flatBoard('TP', 'plate.top', piece, plateUnder));

  if (walls.capPlate) {
    // At a level corner the end-wall cap runs to the building corner over the through-wall top
    // plate, and the through-wall cap stops short. At a step in height neither cap laps.
    const capInset = (other: Wall) => {
      const level = heights[other] === studLength;
      if (through) return level ? depth : 0;
      return level ? 0 : depth;
    };
    const [near, far] = ADJACENT[wall];
    const topSplices = topPieces.slice(1).map(([from]) => from);
    splitPlate([capInset(near), span - capInset(far)], maxStock, centers, topSplices).forEach((piece) =>
      flatBoard('CP', 'plate.cap', piece, plateUnder + PLY),
    );
  }

  return members;
}

/** A square-cut board in a wall frame, before it takes an id. */
export interface Board {
  code: string;
  role: Role;
  size: LumberSize;
  length: number;
  origin: Vec3;
  axes: Axes;
}

/** The header stack on the jacks between the kings, and the rough sill between the jacks. */
export function openingBoards(
  frame: Frame,
  walls: ShedConfig['walls'],
  { type, offset, zone, roTop, header, sillBottom }: Pick<FittedOpening, 'type' | 'offset' | 'zone' | 'roTop' | 'header' | 'sillBottom'>,
): Board[] {
  const depth = LUMBER[walls.stud].width;
  const boards: Board[] = [];
  const flat = (code: string, role: Role, [from, to]: Span, z: number) =>
    boards.push({ code, role, size: walls.stud, length: to - from, origin: at(frame, from, 0, z), axes: { length: frame.u, width: frame.v, thick: UP } });

  // Plate below, header, plate above.
  const headerSpan: Span = [zone[0] + PLY, zone[1] - PLY];
  let level = roTop;
  if (header.plateBelow) {
    flat('HP', 'header.plate', headerSpan, level);
    level += PLY;
  }
  if (header.style === 'flat') {
    flat('H', 'header', headerSpan, level);
    level += PLY;
  } else {
    // Plies start at the outside face. The last of 2 or more sits at the inside face, behind the spacer.
    const { thick, width } = LUMBER[header.size];
    for (let index = 0; index < header.plies; index++) {
      const v = index > 0 && index === header.plies - 1 ? depth - thick : index * thick;
      boards.push({
        code: 'H',
        role: 'header',
        size: header.size,
        length: headerSpan[1] - headerSpan[0],
        origin: at(frame, headerSpan[0], v, level),
        axes: { length: frame.u, width: UP, thick: frame.v },
      });
    }
    level += width;
  }
  if (header.plateAbove) flat('HP', 'header.plate', headerSpan, level);

  if (sillBottom !== null) {
    for (let index = 0; index < walls.sillPlies; index++) flat('RS', 'sill', [offset, offset + type.width], sillBottom + index * PLY);
  }
  return boards;
}

/** The parts of `span` outside the holes. */
function subtract([start, end]: Span, holes: readonly Span[]): Span[] {
  const pieces: Span[] = [];
  let from = start;
  for (const [low, high] of [...holes].sort((first, second) => first[0] - second[0])) {
    if (low > from) pieces.push([from, Math.min(low, end)]);
    from = Math.max(from, high);
  }
  if (end > from) pieces.push([from, end]);
  return pieces.filter(([low, high]) => high > low);
}

/**
 * Bolts along [low, high]: one `end` in from each end, the rest evenly spaced at most `spacing`
 * apart. A part shorter than two end distances gets one bolt at its middle.
 */
function boltPositions(low: number, high: number, end: number, spacing: number): number[] {
  const length = high - low;
  if (length <= 2 * end) return [low + length / 2];
  const count = Math.ceil((length - 2 * end) / spacing) + 1;
  return Array.from({ length: count }, (_, index) => low + end + (index * (length - 2 * end)) / (count - 1));
}

/**
 * Split a plate into stock-length pieces, with each splice on a stud center and clear of the
 * `avoid` positions. Leaves one long piece when no legal splice exists.
 */
export function splitPlate(
  [start, end]: Span,
  maxLength: number,
  studCenters: readonly number[],
  avoid: readonly number[] = [],
): Span[] {
  const pieces: Span[] = [];
  let from = start;
  while (end - from > maxLength) {
    const legal = studCenters.filter(
      (joint) =>
        joint - from >= MIN_PLATE_PIECE &&
        joint - from <= maxLength &&
        end - joint >= MIN_PLATE_PIECE &&
        avoid.every((other) => Math.abs(joint - other) >= CAP_SPLICE_OFFSET),
    );
    if (legal.length === 0) break;
    const joint = Math.max(...legal);
    pieces.push([from, joint]);
    from = joint;
  }
  pieces.push([from, end]);
  return pieces;
}
