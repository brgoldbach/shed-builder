import { LUMBER, stockLengths, type LumberSize } from '../catalog';
import type { ShedConfig } from '../config';
import type { Assembly, Member, Point, Role, Vec3, Warning } from '../member';
import { formatInches } from '../units';
import { clipBelow, degrees, idMaker, planeMember, type Slope } from './section';
import { splitPlate } from './walls';

const PLY = 1.5; // thickness of 2x lumber
const X: Vec3 = [1, 0, 0];
const UP: Vec3 = [0, 0, 1];

/**
 * Rafter ties, collar ties, the loft floor, and knee walls of a gable roof. `rafters` holds each
 * rafter's start x, gable-end rafters first and last. `wallTop` is the top of the eave walls.
 * `kneeBase` is where knee walls stand when they carry the rafters, else null.
 */
export function frameAttic(
  config: ShedConfig,
  slope: Slope,
  rafters: readonly number[],
  ridgeBottom: number,
  wallDepth: number,
  wallTop: number,
  kneeBase: number | null,
): { members: Member[]; warnings: Warning[] } {
  const { width, length, roof } = config;
  const { pitch } = slope;
  const members: Member[] = [];
  const warnings: Warning[] = [];
  const warn = (message: string) => warnings.push({ source: 'Roof', message });
  const plate = slope.bottom(slope.seat); // where the rafters bear
  const ridgeTop = slope.top(width / 2 - PLY / 2);
  // The gable-end rafter pairs stand on the gable framing and get no ties.
  const commons = rafters.slice(1, -1);
  const roofIds = idMaker('RF');

  // A level piece across the building at `bottom`, `inset` in from each wall face, lapping the
  // rafter sides up to the roof line. Its ends are trimmed where they would rise above the rafters.
  function tie(base: { id: string; assembly: Assembly; role: Role; size: LumberSize }, x: number, bottom: number, inset = 0) {
    const depth = LUMBER[base.size].width;
    const start = Math.max(inset, (bottom - slope.top(0)) / pitch.rise);
    const end = width - start;
    if (end - start < PLY) return null;
    const box: Point[] = [[start, bottom], [end, bottom], [end, bottom + depth], [start, bottom + depth]];
    const outline = clipBelow(clipBelow(box, [-pitch.rise, 1], slope.top(0)), [pitch.rise, 1], slope.top(width));
    const trimmed = slope.top(start) < bottom + depth;
    const note = trimmed ? `Ends cut ${degrees(pitch)} to the roof line.` : 'Square ends.';
    return planeMember({ ...base, note }, { origin: [x, 0, 0], h: [0, 1, 0] }, outline, [1, 0]);
  }

  if (!roof.loft.enabled && roof.rafterTies.enabled) {
    const ties = roof.rafterTies;
    const lowerThird = (ridgeTop - plate) / 3;
    if (ties.height > lowerThird) {
      warn(
        `Rafter ties ${formatInches(ties.height)} above the plate are above the lower third of the roof ` +
          `(${formatInches(lowerThird)}).`,
      );
    }
    commons.forEach((x, index) => {
      if (index % ties.every !== 0) return;
      const base = { id: roofIds('RT'), assembly: 'roof', role: 'tie.rafter', size: ties.size } as const;
      const member = tie(base, x + PLY, plate + ties.height);
      if (member) members.push(member);
    });
  }

  if (roof.collarTies.enabled) {
    const collar = roof.collarTies;
    const depth = LUMBER[collar.size].width;
    // Auto: at the bottom of the upper third, kept under the ridge board.
    const auto = Math.min(plate + ((ridgeTop - plate) * 2) / 3, ridgeBottom - depth);
    const bottom = collar.height === 'auto' ? auto : plate + collar.height;
    if (bottom + depth > ridgeBottom + 1e-9) {
      warn(`Collar ties ${formatInches(bottom - plate)} above the plate hit the ridge board. Lower them.`);
    } else {
      commons.forEach((x, index) => {
        if (index % collar.every !== 0) return;
        const base = { id: roofIds('CT'), assembly: 'roof', role: 'tie.collar', size: collar.size } as const;
        const member = tie(base, x + PLY, bottom);
        if (member) members.push(member);
      });
    }
  }

  if (roof.loft.enabled) {
    const { loft } = roof;
    const loftIds = idMaker('LF');
    const raised = kneeBase !== null;
    const hung = loft.support === 'hung';
    // Hung joists hang in hangers between ledgers on the eave walls' inside faces, tops flush with
    // the walls. Joists on the plates run between rim joists when knee walls stand on them;
    // otherwise they lap the rafters, moving beside any rafter they land on.
    const bottom = hung ? wallTop - LUMBER[loft.joist].width : wallTop;
    const inset = hung ? wallDepth + PLY : raised ? PLY : 0;
    const starts = loftJoistStarts(length, loft.oc, raised || hung ? [] : rafters, wallDepth);
    for (const x of starts) {
      const member = tie({ id: loftIds('J'), assembly: 'loft', role: 'joist.loft', size: loft.joist }, x, bottom, inset);
      if (member) members.push(hung ? { ...member, note: 'Square ends. Joist hangers at both ends.' } : member);
    }

    const edge: { code: string; role: Role; y: number; span: readonly [number, number] } | null = hung
      ? { code: 'L', role: 'ledger.loft', y: wallDepth, span: [wallDepth, length - wallDepth] }
      : raised
        ? { code: 'R', role: 'rim.loft', y: 0, span: [0, length] }
        : null;
    if (edge) {
      const maxStock = Math.max(...stockLengths(config.catalog.stock, loft.joist));
      for (const [y, inward] of [[edge.y, 1], [width - edge.y, -1]] as const) {
        for (const [from, to] of splitPlate(edge.span, maxStock, starts.map((x) => x + PLY / 2))) {
          members.push({
            id: loftIds(edge.code),
            assembly: 'loft',
            role: edge.role,
            size: loft.joist,
            treated: false,
            length: to - from,
            origin: [from, y, bottom],
            axes: { length: X, width: UP, thick: [0, inward, 0] },
          });
        }
      }
    }
    if (kneeBase !== null) members.push(...frameKneeWalls(config, kneeBase));
  }

  return { members, warnings };
}

// Loft joists: one inside the gable studs at each end, the rest on o.c. multiples. A joist that
// lands on one of `rafters` moves to the rafter's +x side.
function loftJoistStarts(length: number, oc: number, rafters: readonly number[], wallDepth: number): number[] {
  const starts = [wallDepth, length - wallDepth - PLY];
  const overlaps = (start: number, other: number) => start < other + PLY && start + PLY > other;
  for (let index = 1; index * oc < length; index++) {
    let start = index * oc - PLY / 2;
    const rafter = rafters.find((other) => overlaps(start, other));
    if (rafter !== undefined) start = rafter + PLY;
    if (start < wallDepth + PLY || start + PLY > length - wallDepth - PLY) continue;
    if (starts.some((other) => overlaps(start, other))) continue;
    starts.push(start);
  }
  return starts.sort((first, second) => first - second);
}

/**
 * A knee wall at each eave, standing at `base`, outside face flush with the wall below, full
 * length. Its height runs from its base to the top of its plates, where the rafters bear. Studs
 * follow the wall layout from each wall's left corner, viewed from outside.
 */
function frameKneeWalls(config: ShedConfig, base: number): Member[] {
  const { width, length, walls, roof, catalog } = config;
  const knee = roof.kneeWalls;
  const plateCount = walls.capPlate ? 3 : 2;
  const studLength = knee.height - PLY * plateCount;
  const maxStock = Math.max(...stockLengths(catalog.stock, knee.stud));

  const sides = [
    { assembly: 'knee.front', prefix: 'KF', y: 0, inward: 1, toX: (u: number) => u },
    { assembly: 'knee.back', prefix: 'KB', y: width, inward: -1, toX: (u: number) => length - u - PLY },
  ] as const;

  const members: Member[] = [];
  for (const side of sides) {
    const nextId = idMaker(side.prefix);
    const board = (code: string, role: Role, length: number, origin: Vec3, axes: Member['axes']): Member => ({
      id: nextId(code),
      assembly: side.assembly,
      role,
      size: knee.stud,
      treated: false,
      length,
      origin,
      axes,
    });

    // Layout positions (u) from the wall's left corner: an end stud at each end, the rest on o.c.
    const layout = [0, length - PLY];
    for (let index = 1; index * walls.oc < length; index++) {
      const from = index * walls.oc - PLY / 2;
      if (from >= PLY && from + PLY <= length - PLY) layout.push(from);
    }
    const studs = layout.map(side.toX).sort((first, second) => first - second);
    for (const x of studs) {
      members.push(board('S', 'stud', studLength, [x, side.y, base + PLY], { length: UP, width: [0, side.inward, 0], thick: X }));
    }

    const centers = studs.map((x) => x + PLY / 2);
    const plateAxes = { length: X, width: [0, side.inward, 0] as Vec3, thick: UP };
    const topPieces = splitPlate([0, length], maxStock, centers);
    const levels: [string, Role, ReturnType<typeof splitPlate>, number][] = [
      ['BP', 'plate.bottom', splitPlate([0, length], maxStock, centers), base],
      ['TP', 'plate.top', topPieces, base + PLY + studLength],
    ];
    if (walls.capPlate) {
      const avoid = topPieces.slice(1).map(([from]) => from);
      const capPieces = splitPlate([0, length], maxStock, centers, avoid);
      levels.push(['CP', 'plate.cap', capPieces, base + 2 * PLY + studLength]);
    }
    for (const [code, role, pieces, z] of levels) {
      for (const [from, to] of pieces) members.push(board(code, role, to - from, [from, side.y, z], plateAxes));
    }
  }
  return members;
}
