import { LUMBER, stockLengths, type LumberSize } from '../catalog';
import { WALLS, type Opening, type OpeningType, type ShedConfig } from '../config';
import { ASSEMBLIES, type Member, type Role, type Vec3, type Warning } from '../member';
import { positionText, roOffset } from '../placement';
import { formatInches } from '../units';

export type Wall = (typeof WALLS)[number];
type Span = readonly [number, number];
type Axes = Member['axes'];

const PLY = 1.5; // thickness of a 2x plate or stud
const CAP_SPLICE_OFFSET = 24; // min distance from a cap-plate splice to a top-plate splice
const MIN_PLATE_PIECE = 24; // no short offcut pieces at a plate end
const MIN_CRIPPLE = 3; // a smaller gap above a header closes: the header goes tight to the plate
const UP: Vec3 = [0, 0, 1];

type VerticalRole = Extract<Role, 'corner' | 'stud' | 'king' | 'jack' | 'cripple'>;
const VERTICAL_CODES: Record<VerticalRole, string> = { corner: 'C', stud: 'S', king: 'K', jack: 'J', cripple: 'CR' };

// Wall frame: origin at the building corner on the wall's left end, viewed from outside.
// u runs along the wall to the right, v runs inward, z is up.
interface Frame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
}

function frames(width: number, length: number): Record<Wall, Frame> {
  return {
    front: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
    back: { origin: [length, width, 0], u: [-1, 0, 0], v: [0, -1, 0] },
    left: { origin: [0, width, 0], u: [0, -1, 0], v: [1, 0, 0] },
    right: { origin: [length, 0, 0], u: [0, 1, 0], v: [-1, 0, 0] },
  };
}

// Walls at u = 0 and at u = span. Front and back run through; left and right fit between them.
const ADJACENT: Record<Wall, readonly [Wall, Wall]> = {
  front: ['left', 'right'],
  back: ['right', 'left'],
  left: ['back', 'front'],
  right: ['front', 'back'],
};

// The eave walls run through and carry the rafters.
const isThrough = (wall: Wall) => wall === 'front' || wall === 'back';

const overlaps = ([low, high]: Span, [otherLow, otherHigh]: Span) => low < otherHigh && high > otherLow;

function at(frame: Frame, u: number, v: number, z: number): Vec3 {
  return [
    frame.origin[0] + frame.u[0] * u + frame.v[0] * v,
    frame.origin[1] + frame.u[1] * u + frame.v[1] * v,
    z,
  ];
}

/** Stud length of each wall. On a lean-to, the high wall is taller by the roof rise. */
export function studLengths(config: ShedConfig): Record<Wall, number> {
  const { studLength, stud } = config.walls;
  const lengths = { front: studLength, back: studLength, left: studLength, right: studLength };
  if (config.roof.style === 'lean-to') {
    // Full-width seats: the rafter underside meets the low wall's inside top corner and the
    // high wall's outside top corner, which are (width - wall depth) apart.
    lengths[config.roof.highSide] += (config.roof.pitch / 12) * (config.width - LUMBER[stud].width);
  }
  return lengths;
}

/** Top of each wall's top plate, or cap plate: the rafter bearing height. */
export function wallTops(config: ShedConfig): Record<Wall, number> {
  const lengths = studLengths(config);
  const plates = PLY * (config.walls.capPlate ? 3 : 2);
  return {
    front: lengths.front + plates,
    back: lengths.back + plates,
    left: lengths.left + plates,
    right: lengths.right + plates,
  };
}

/** Plates, corners, layout studs, and opening framing of the four walls. */
export function frameWalls(config: ShedConfig): { members: Member[]; warnings: Warning[] } {
  const heights = studLengths(config);
  const frame = frames(config.width, config.length);
  const placed = placements(config);
  const warnings: Warning[] = [];
  const members = WALLS.flatMap((wall) =>
    frameWall(config, wall, frame[wall], heights, placed.filter(({ row }) => row.wall === wall), warnings),
  );
  return { members, warnings };
}

// One opening at one position. The label names it in warnings and notes: "window 24x36 (front 50%)".
interface Placed {
  label: string;
  type: OpeningType;
  row: Opening;
  position: number;
}

function placements(config: ShedConfig): Placed[] {
  const types = new Map(config.openingTypes.map((type) => [type.name, type]));
  return config.openings
    .filter((row) => row.enabled)
    .flatMap((row) =>
      row.at.map((position) => ({
        label: `${row.type} (${row.wall} ${positionText(row.along, position)})`,
        type: types.get(row.type)!,
        row,
        position,
      })),
    );
}

const HEADER_PLIES: Record<OpeningType['girder'], number> = { single: 1, double: 2, triple: 3, flat: 1 };

interface Header {
  style: OpeningType['girder'];
  size: LumberSize;
  plies: number;
  plateBelow: boolean;
  plateAbove: boolean;
  depth: number; // the whole stack, plates included
}

function resolveHeader(type: OpeningType, walls: ShedConfig['walls']): Header {
  const { girder: style, plateBelow, plateAbove } = type;
  const size = style === 'flat' ? walls.stud : (type.header ?? walls.header);
  const { thick, width } = LUMBER[size];
  const main = style === 'flat' ? thick : width;
  const depth = main + PLY * (Number(plateBelow) + Number(plateAbove));
  return { style, size, plies: HEADER_PLIES[style], plateBelow, plateAbove, depth };
}

// A placed opening that fits its wall, with the framing positions resolved.
interface FittedOpening {
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
  plateUnder: number; // underside of the top plate
  wallTop: number;
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

  const jacks = type.jacks === 'auto' ? (type.width > walls.doubleJackOver ? 2 : 1) : type.jacks;
  const side = (jacks + 1) * PLY;
  const zone: Span = [offset - side, offset + type.width + side];
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
    if (sillBottom < PLY) {
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
  const plateUnder = PLY + studLength;

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
    const count = (counts.get(code) ?? 0) + 1;
    counts.set(code, count);
    const id = `${prefix}-${code}${String(count).padStart(2, '0')}`;
    members.push({ id, assembly, role, size, treated, length, origin, axes, ...(note && { note }) });
  }

  function upright(role: VerticalRole, from: number, bottom = PLY, length = studLength) {
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
    add('C', 'corner', walls.stud, studLength, at(frame, from, depth - PLY, PLY), {
      length: UP,
      width: frame.u,
      thick: frame.v,
    });
  }

  // A board laid flat across the wall depth: plates, rough sills, and flat headers.
  function flatBoard(code: string, role: Role, [from, to]: Span, z: number, treated = false, note?: string) {
    const axes = { length: frame.u, width: frame.v, thick: UP };
    add(code, role, walls.stud, to - from, at(frame, from, 0, z), axes, treated, note);
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

  for (const { type, offset, jacks, zone, roTop, header, sillBottom } of fitted) {
    const roEnd = offset + type.width;
    upright('king', zone[0]);
    upright('king', zone[1] - PLY);
    for (let index = 1; index <= jacks; index++) {
      upright('jack', offset - index * PLY, PLY, roTop - PLY);
      upright('jack', roEnd + (index - 1) * PLY, PLY, roTop - PLY);
    }

    // Header stack on the jacks, between the kings: plate below, header, plate above.
    const headerSpan: Span = [zone[0] + PLY, zone[1] - PLY];
    let level = roTop;
    if (header.plateBelow) {
      flatBoard('HP', 'header.plate', headerSpan, level);
      level += PLY;
    }
    if (header.style === 'flat') {
      flatBoard('H', 'header', headerSpan, level);
      level += PLY;
    } else {
      // Plies start at the outside face. The last of 2 or more sits at the inside face, behind the spacer.
      const { thick, width } = LUMBER[header.size];
      for (let index = 0; index < header.plies; index++) {
        const v = index > 0 && index === header.plies - 1 ? depth - thick : index * thick;
        add('H', 'header', header.size, headerSpan[1] - headerSpan[0], at(frame, headerSpan[0], v, level), {
          length: frame.u,
          width: UP,
          thick: frame.v,
        });
      }
      level += width;
    }
    if (header.plateAbove) flatBoard('HP', 'header.plate', headerSpan, level);

    if (sillBottom !== null) {
      for (let index = 0; index < walls.sillPlies; index++) {
        flatBoard('RS', 'sill', [offset, roEnd], sillBottom + index * PLY);
      }
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
    if (fit.sillBottom !== null && fit.sillBottom > PLY) upright('cripple', from, PLY, fit.sillBottom - PLY);
  }

  const maxStock = Math.max(...stockLengths(config.catalog.stock, walls.stud));
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
    flatBoard(onSlab ? 'SL' : 'BP', onSlab ? 'plate.sill' : 'plate.bottom', piece, 0, onSlab, note);
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
