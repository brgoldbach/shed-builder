import { LUMBER, SHEETS, stockFor } from '../catalog';
import { MIN_RAMP_WIDTH, type Addition, type Opening, type Ramp, type ShedConfig } from '../config';
import { ASSEMBLIES, LEFT_OUT, type Member, type Point, type Solid, type Vec3, type Warning } from '../member';
import { naming } from '../naming';
import { openingLabel, roOffset, wallSpan } from '../placement';
import { formatInches } from '../units';
import type { LeanTo } from './additions';
import { leanToFloorOn } from './deck';
import { gradeOf } from './floor';
import { clipBelow, idMaker, planeMember } from './section';
import { splitPlate, wallFrames, type Wall } from './walls';

const PLY = 1.5;
const GAP = 0.25; // between deck boards
const NEAR = 0.01;
const UP: Vec3 = [0, 0, 1];

/**
 * Where a ramp stands: its wall, and its edges along the wall from the wall's left corner, viewed
 * from outside. `opening` names the opening it follows. `lost`: the opening it follows is gone.
 */
export interface RampPlace {
  wall: Wall;
  left: number;
  right: number;
  opening: string | null;
  lost: boolean;
}

/** A ramp that follows an opening takes that opening's wall and RO, `margin` wider on each side. */
export function rampPlace(config: ShedConfig, ramp: Ramp): RampPlace {
  const row = ramp.opening ? config.openings[ramp.opening.row] : undefined;
  const position = ramp.opening ? row?.at[ramp.opening.index] : undefined;
  const type = row && config.openingTypes.find(({ name }) => name === row.type);
  if (row && position !== undefined && type) {
    const left = roOffset(row.along, position, wallSpan(config, row.wall), type.width);
    const opening = openingLabel(naming(config), row, position);
    return { wall: row.wall, left: left - ramp.margin, right: left + type.width + ramp.margin, opening, lost: false };
  }
  const left = roOffset(ramp.along, ramp.at, wallSpan(config, ramp.wall), ramp.width);
  return { wall: ramp.wall, left, right: left + ramp.width, opening: null, lost: ramp.opening !== null };
}

/** The lean-to deck or slab on the ramp's wall that its span meets, from the design alone. Null when none does. */
export function rampLeanToFloor(config: ShedConfig, ramp: Ramp): { addition: Addition; span: [number, number]; wall: Wall } | null {
  const { wall, left, right } = rampPlace(config, ramp);
  const floor = leanToFloorOn(config, wall);
  return floor && floor.span[0] < right - NEAR && floor.span[1] > left + NEAR ? { ...floor, wall } : null;
}

/**
 * The design without opening row `index`. A ramp that follows an opening in that row stays where
 * it stands, placed on its own; a ramp that follows a later row keeps following it.
 */
export function withoutOpeningRow(config: ShedConfig, index: number): ShedConfig {
  const ramps = config.ramps.map((ramp): Ramp => {
    if (!ramp.opening || ramp.opening.row < index) return ramp;
    if (ramp.opening.row > index) return { ...ramp, opening: { ...ramp.opening, row: ramp.opening.row - 1 } };
    const { wall, left, right } = rampPlace(config, ramp);
    return { ...ramp, opening: null, wall, along: 'left', at: left, width: Math.max(MIN_RAMP_WIDTH, right - left) };
  });
  return { ...config, openings: config.openings.filter((_, at) => at !== index), ramps };
}

/**
 * The design with opening row `index` replaced by `next`. A ramp that follows a position in that row
 * keeps following it: by its value when positions come or go, else by its place in the row. A ramp
 * whose position is gone stays where it stands, placed on its own.
 */
export function withOpeningRow(config: ShedConfig, index: number, next: Opening): ShedConfig {
  const before = config.openings[index];
  const openings = config.openings.map((row, at) => (at === index ? next : row));
  const ramps = config.ramps.map((ramp): Ramp => {
    if (!ramp.opening || ramp.opening.row !== index || next.at.length === before.at.length) return ramp;
    const moved = next.at.indexOf(before.at[ramp.opening.index]);
    const kept = moved >= 0 ? moved : ramp.opening.index < next.at.length ? ramp.opening.index : -1;
    if (kept >= 0) return { ...ramp, opening: { row: index, index: kept } };
    const { wall, left, right } = rampPlace(config, ramp);
    return { ...ramp, opening: null, wall, along: 'left', at: left, width: Math.max(MIN_RAMP_WIDTH, right - left) };
  });
  return { ...config, openings, ramps };
}

/** What the BOM needs from each ramp or stairs that was built. */
export interface RampFacts {
  kind: Ramp['kind'];
  stringers: number;
  top: 'framing' | 'deck' | 'slab'; // what the stringer tops fasten to: the shed's floor framing, a lean-to deck beam, or a slab edge
  hangerBoard: number; // the length of a hanger board under the floor framing or deck beam, for stair hangers; 0 for none
  summary: string; // for the drawings
}

// Stairs take a fixed step. A riser of at most 7-1/2 in keeps the 5 in throat of a 2x12 cut stringer
// at an 11-1/4 in run (DCA6 Figure 28); IRC R311.7.5.1 allows 7-3/4 in. Each tread is two 5/4x6, an
// 11-1/4 in tread and unit run with no nosing (R311.7.5.2, R311.7.5.3).
const MAX_RISER = 7.5;
const TREAD_BOARDS = 2;
const STAIR_STRINGER = '2x12'; // DCA6: the smallest stair stringer
const STAIR_SPACING = 18; // DCA6 Figure 29: cut stringers under 5/4 treads
const MIN_THROAT = 5; // DCA6 Figure 28
const MAX_STAIR_SPAN = 72; // DCA6 Figure 28, horizontal
const MIN_STAIR_WIDTH = 36; // IRC R311.7.1
const HANDRAIL_RISERS = 4; // IRC R311.7.8
const GUARD_RISE = 30; // DCA6 Figure 30; IRC R312.1. Also open risers above it, R311.7.5.1.

/**
 * Ramps and stairs down from the shed floor at a wall, or from the outer edge of a lean-to's deck or
 * slab, to the lean-to floor in their way or to their foot, at or below grade. A wood ramp is 2x6
 * boards across stringers; a concrete ramp is a wedge. Stairs are cut 2x12 stringers with open
 * risers and 5/4x6 treads.
 */
export function frameRamps(
  config: ShedConfig,
  framing: readonly Member[],
  leanTos: readonly LeanTo[],
): { members: Member[]; solids: Solid[]; warnings: Warning[]; facts: RampFacts[] } {
  const members: Member[] = [];
  const solids: Solid[] = [];
  const warnings: Warning[] = [];
  const facts: RampFacts[] = [];
  const nextId = idMaker(ASSEMBLIES.ramp.prefix);
  const frames = wallFrames(config.width, config.length);
  const names = naming(config);
  const grade = gradeOf(config, framing);
  const maxStock = (size: Member['size']) => Math.max(...stockFor(config.catalog, size));

  config.ramps.forEach((ramp, index) => {
    const stairs = ramp.kind === 'stairs';
    const source = `${stairs ? 'Stairs' : 'Ramp'} ${index + 1}`;
    const warn = (message: string) => warnings.push({ source, message });
    const { wall, left, right, lost } = rampPlace(config, ramp);
    if (lost) warn('The opening it follows is gone. It stands at its own position.');
    const frame = frames[wall];
    const outward: Vec3 = [-frame.v[0], -frame.v[1], 0];
    // A point `x` out from the wall's outside face, at `u` along it. The shed floor surface is z = 0.
    const at = (u: number, x: number, z: number): Vec3 => [
      frame.origin[0] + frame.u[0] * u + outward[0] * x,
      frame.origin[1] + frame.u[1] * u + outward[1] * x,
      z,
    ];
    // The plane extrudes along outward × up; start each part at the end that extrusion leaves from.
    const along = outward[1] * frame.u[0] - outward[0] * frame.u[1];

    // The lean-to on this wall, and its deck or slab where it meets this span.
    const leanTo = leanTos.find(({ side }) => side === wall);
    const floor = leanTo?.floor && leanTo.floor.span[0] < right - NEAR && leanTo.floor.span[1] > left + NEAR ? leanTo.floor : null;
    const floorName = floor && `the ${names.side(wall)} lean-to ${floor.kind}`;
    if (ramp.from === 'lean-to' && !floor) warn('No lean-to deck or slab meets it, so it starts at the shed floor.');
    if (floor && (floor.span[0] > left + NEAR || floor.span[1] < right - NEAR)) warn(`It runs past the end of ${floorName}.`);
    // Where it starts: `face` takes the stringers, or the wedge; the surface starts at `edge`, at `top`.
    // Between them a stringer stays under `under`, the underside of an outer deck board that runs past its beam.
    const fromLeanTo = ramp.from === 'lean-to' && floor !== null;
    // `low` is the underside of what the stringers fasten to: the floor framing, the deck beam, or the slab.
    const slabShed = config.foundation.type === 'slab';
    const floorLow = slabShed ? -config.foundation.slab.thickness : -SHEETS[config.floor.subfloor].thick - LUMBER[config.floor.joist].width;
    const upper = fromLeanTo
      ? { face: floor.face, edge: floor.edge, top: floor.top, under: floor.under, low: floor.bottom, name: floorName!, fasten: floor.kind }
      : { face: 0, edge: 0, top: 0, under: 0, low: floorLow, name: 'the floor', fasten: slabShed ? ('slab' as const) : ('framing' as const) };
    const holder = upper.fasten === 'slab' ? 'the slab' : upper.fasten === 'deck' ? 'the deck beam' : 'the floor framing';
    // Down to the lean-to floor in its way, which it must fit on, short of the posts; else to its foot.
    const lower = !fromLeanTo && floor ? { z: floor.top, limit: floor.inner } : { z: grade - ramp.belowGrade, limit: Infinity };
    const foot = lower.z;
    const rise = upper.top - foot;
    const upperName = `${upper.name.charAt(0).toUpperCase()}${upper.name.slice(1)}`;
    const footName = stairs ? 'the foot of the stairs' : "the ramp's foot";
    const footText = lower.limit < Infinity ? `on the ${floor!.kind}` : ramp.belowGrade > 0 ? `on the foot, ${formatInches(ramp.belowGrade)} below grade` : 'on grade';
    const lowerName = lower.limit < Infinity ? floorName! : ramp.belowGrade > 0 ? `its foot, ${formatInches(ramp.belowGrade)} below grade` : 'grade';
    const levels = `${source}, from ${upper.name} down to ${lowerName}`;
    const leaveOut = (message: string) => {
      const outline = [at(left, upper.edge, upper.top), at(right, upper.edge, upper.top), at(right, upper.edge + 24, upper.top), at(left, upper.edge + 24, upper.top)];
      warnings.push({ source, message: `${message} ${LEFT_OUT}`, missing: { assembly: 'ramp', outline } });
    };
    // It must stop short of the lean-to posts when it lands on the lean-to floor, and it should miss an open lean-to's posts.
    const fits = (end: number) => {
      if (end > lower.limit + NEAR) {
        leaveOut(`It does not fit on ${floorName}: it reaches ${formatInches(end)} out from the wall, and the posts stand ${formatInches(lower.limit)} out.`);
        return false;
      }
      const posts = leanTo && !floor && !fromLeanTo ? leanTo.posts : null;
      if (posts && end > posts.x - posts.width / 2 && posts.us.some((u) => u + posts.width / 2 > left && u - posts.width / 2 < right)) {
        warn(`It meets a post of the ${names.side(wall)} lean-to.`);
      }
      return true;
    };
    const butts = (hanger: boolean) =>
      upper.fasten === 'slab'
        ? 'the slab edge, anchored to it'
        : `${upper.fasten === 'deck' ? 'the deck beam' : 'the floor framing'}, ${hanger ? 'in a sloped hanger' : 'lagged to it'}`;

    if (stairs) {
      const risers = Math.ceil(rise / MAX_RISER - NEAR);
      if (risers < 2) {
        warn(`${upperName} is ${formatInches(Math.max(rise, 0))} above ${footName}: one step at most, so the app builds no stairs.`);
        return;
      }
      const riser = rise / risers;
      const treads = risers - 1;
      const { thick: treadThick, width: boardWidth } = LUMBER['5/4x6'];
      const unit = TREAD_BOARDS * boardWidth + (TREAD_BOARDS - 1) * GAP;
      const end = upper.edge + treads * unit;
      if (!fits(end)) return;
      // In the plane square to the wall: tread k (1 to n − 1) tops at `top − k riser`, from
      // `edge + (k − 1) unit` out to `edge + k unit`. The stringer seats sit a tread thickness lower.
      const seat = (k: number) => upper.top - k * riser - treadThick;
      const angle = Math.atan(riser / unit);
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      const depth = LUMBER[STAIR_STRINGER].width;
      // The board's top edge runs through each seat's outer corner.
      const bottom = (x: number) => seat(1) - ((x - upper.edge - unit) * riser) / unit - depth / cos;
      const profile: Point[] = [[upper.face, seat(1)]];
      for (let k = 1; k <= treads; k++) {
        profile.push([upper.edge + k * unit, seat(k)]);
        if (k < treads) profile.push([upper.edge + k * unit, seat(k + 1)]);
      }
      profile.push([end, bottom(end)], [upper.face, bottom(upper.face)]);
      const outline = clipBelow(profile, [0, -1], -foot);
      // A sloped hanger needs wood behind the whole plumb cut. Below the floor framing or deck beam,
      // a hanger board under it takes the hangers; below a slab, nothing takes the anchors.
      const below = upper.low - bottom(upper.face);
      const short = below > NEAR;
      const hangerBoard = short && upper.fasten !== 'slab' ? right - left : 0;
      const fastened = hangerBoard ? `${holder}, in a sloped hanger on a PT 2x12 hanger board under it` : butts(true);
      const width = right - left;
      const count = Math.max(3, Math.ceil((width - PLY) / STAIR_SPACING - NEAR) + 1);
      const starts = Array.from({ length: count }, (_, i) => left + (i * (width - PLY)) / (count - 1));
      const treadCount = `${treads} tread${treads === 1 ? '' : 's'}`;
      const note = `Cut stringer: ${risers} risers of ${formatInches(riser)}, ${treadCount} of ${formatInches(unit)}. Plumb cut ${((angle * 180) / Math.PI).toFixed(1)}° at ${fastened}. Level cut ${footText}.`;
      for (const u of starts) {
        const plane = { origin: at(along > 0 ? u : u + PLY, 0, 0), h: outward };
        const stringer = planeMember({ id: nextId('S'), assembly: 'ramp', role: 'stringer.stair', size: STAIR_STRINGER, note }, plane, outline, [cos, -sin]);
        members.push({ ...stringer, treated: true });
      }
      const centers = starts.map((u) => u + PLY / 2);
      for (let k = 1; k <= treads; k++) {
        for (let board = 0; board < TREAD_BOARDS; board++) {
          const x = upper.edge + (k - 1) * unit + board * (boardWidth + GAP);
          for (const [from, to] of splitPlate([left, right], maxStock('5/4x6'), centers)) {
            const axes = { length: frame.u, width: outward, thick: UP };
            members.push({ id: nextId('T'), assembly: 'ramp', role: 'tread', size: '5/4x6', treated: true, length: to - from, origin: at(from, x, seat(k)), axes });
          }
        }
      }
      if (width < MIN_STAIR_WIDTH - NEAR) warn(`It is ${formatInches(width)} wide. Stairs need 36" (IRC R311.7.1).`);
      if (risers >= HANDRAIL_RISERS) warn(`${risers} risers need a handrail on one side (IRC R311.7.8). The app does not build it.`);
      if (rise >= GUARD_RISE - NEAR) warn(`A total rise of ${formatInches(rise)} needs a stair guard (DCA6 Figure 30). The app does not build it.`);
      if (rise - riser > GUARD_RISE + NEAR) warn('Open risers more than 30" above the ground below must stop a 4" sphere (IRC R311.7.5.1). Add riser boards or fillers.');
      if (end - upper.face > MAX_STAIR_SPAN + NEAR) warn(`The stringers span ${formatInches(end - upper.face)}. A cut stringer spans at most 6' 0" (DCA6 Figure 28).`);
      // The throat is square to the stringer.
      const topDepth = (seat(1) - bottom(upper.face)) * cos;
      if (topDepth < MIN_THROAT - NEAR) warn(`The stringers are ${formatInches(topDepth)} deep at their top, under ${upper.name}'s outer board. A cut stringer keeps 5" (DCA6 Figure 28).`);
      if (hangerBoard) {
        warn(`The stringers' plumb cuts reach ${formatInches(below)} below ${holder}. Their sloped hangers go on a PT 2x12 hanger board under it, across the stairs (DCA6 Figure 31). The app counts the board but does not draw it.`);
      } else if (short) {
        warn(`The stringers' plumb cuts reach ${formatInches(below)} below ${holder}, where anchors cannot hold them. Set their tops on a block or footing.`);
      }
      const spacing = formatInches((width - PLY) / (count - 1));
      const summary = `${levels}: ${risers} risers of ${formatInches(riser)}, ${treadCount} of two 5/4x6, PT 2x12 cut stringers, ${count} at ${spacing} o.c.`;
      facts.push({ kind: 'stairs', stringers: count, top: upper.fasten, hangerBoard, summary });
      return;
    }

    const angle = Math.atan(1 / ramp.slope);
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const concrete = ramp.material === 'concrete';
    if (rise < (concrete ? NEAR : PLY / cos + NEAR)) {
      const reason = concrete ? 'so the ramp has no rise' : 'too low for stringers under the boards';
      leaveOut(`${upperName} is ${formatInches(Math.max(rise, 0))} above ${footName}, ${reason}.`);
      return;
    }
    // In the plane square to the wall: x out from the wall face, z up. The surface falls 1 in `slope`
    // from `top` at `edge`. Between `face` and `edge` nothing may rise above `under`.
    const surface = (x: number) => upper.top - (x - upper.edge) / ramp.slope;
    const knee = (lift: number) => upper.edge + ramp.slope * (upper.top - lift - upper.under);
    const run = upper.edge + rise * ramp.slope;
    if (!fits(run)) return;
    if (concrete) {
      // Over a flat base `thickness` under the foot.
      const base = foot - ramp.thickness;
      // Under an outer deck board that runs past the beam, the wedge stops at the board's underside.
      const top: Point[] = upper.edge > upper.face + NEAR ? [[upper.face, upper.under], [upper.edge, upper.under], [upper.edge, upper.top]] : [[upper.face, upper.top]];
      solids.push({
        id: nextId('C'),
        label: 'Concrete ramp',
        layer: 'ramps',
        material: 'concrete',
        shape: {
          kind: 'panel',
          origin: at(along > 0 ? left : right, 0, 0),
          u: outward,
          v: UP,
          thick: right - left,
          outline: [...top, [run, foot], [run, base], [upper.face, base]],
          holes: [],
        },
      });
      facts.push({ kind: 'ramp', stringers: 0, top: upper.fasten, hangerBoard: 0, summary: `${levels}: concrete, 1 in ${ramp.slope}, over a ${formatInches(ramp.thickness)} base.` });
      return;
    }

    // Whole boards down the slope from the top; with none, the stringers would carry nothing.
    const boardWidth = LUMBER['2x6'].width;
    const slopeLength = (ramp.slope * rise) / cos;
    const rows = Math.floor((slopeLength + GAP) / (boardWidth + GAP));
    if (rows < 1) {
      leaveOut(`${upperName} is ${formatInches(rise)} above ${footName}, too low for one whole board down the slope.`);
      return;
    }
    // The stringer top runs a board's thickness under the surface.
    const lift = PLY / cos;
    const top = (x: number) => surface(x) - lift;
    const toe = upper.edge + ramp.slope * (rise - lift);
    const deep = LUMBER[ramp.stringer].width / cos;
    const capped = top(upper.face) > upper.under + NEAR;
    const upperEnd: Point[] = capped ? [[upper.face, upper.under], [knee(lift), upper.under]] : [[upper.face, top(upper.face)]];
    const board: Point[] = [...upperEnd, [toe, foot], [toe, foot - deep], [upper.face, top(upper.face) - deep]];
    const outline = clipBelow(board, [0, -1], -foot);
    const degrees = `${((angle * 180) / Math.PI).toFixed(1)}°`;
    const cap = capped ? ` Top cut level ${formatInches(knee(lift) - upper.face)} from the plumb cut, under the deck boards.` : '';
    const note = `Plumb cut ${degrees} at ${butts(false)}.${cap} Level cut ${footText}.`;
    const starts = [left, right - PLY];
    for (let count = 1; left + count * ramp.oc < right; count++) {
      const from = left + count * ramp.oc - PLY / 2;
      if (from >= left + PLY && from + PLY <= right - PLY) starts.push(from);
    }
    starts.sort((first, second) => first - second);
    for (const u of starts) {
      const plane = { origin: at(along > 0 ? u : u + PLY, 0, 0), h: outward };
      const stringer = planeMember({ id: nextId('S'), assembly: 'ramp', role: 'stringer', size: ramp.stringer, note }, plane, outline, [cos, -sin]);
      members.push({ ...stringer, treated: true });
    }

    // Boards across the stringers, from the top down the slope.
    const downSlope: Vec3 = [outward[0] * cos, outward[1] * cos, -sin];
    const normal: Vec3 = [outward[0] * sin, outward[1] * sin, cos];
    const centers = starts.map((u) => u + PLY / 2);
    for (let row = 0; row < rows; row++) {
      const down = row * (boardWidth + GAP);
      for (const [from, to] of splitPlate([left, right], maxStock('2x6'), centers)) {
        const point = at(from, upper.edge + down * cos, upper.top - down * sin);
        const origin: Vec3 = [point[0] - PLY * normal[0], point[1] - PLY * normal[1], point[2] - PLY * normal[2]];
        members.push({
          id: nextId('B'),
          assembly: 'ramp',
          role: 'decking',
          size: '2x6',
          treated: true,
          length: to - from,
          origin,
          axes: { length: frame.u, width: downSlope, thick: normal },
        });
      }
    }
    const summary = `${levels}: PT ${ramp.stringer} stringers at ${ramp.oc}" o.c., 1 in ${ramp.slope}, 2x6 deck boards.`;
    facts.push({ kind: 'ramp', stringers: starts.length, top: upper.fasten, hangerBoard: 0, summary });
  });
  return { members, solids, warnings, facts };
}
