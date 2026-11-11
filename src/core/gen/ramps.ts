import { LUMBER, stockFor } from '../catalog';
import type { Opening, Ramp, ShedConfig } from '../config';
import { ASSEMBLIES, LEFT_OUT, type Member, type Point, type Solid, type Vec3, type Warning } from '../member';
import { naming } from '../naming';
import { openingLabel, roOffset, wallSpan } from '../placement';
import { formatInches } from '../units';
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

/**
 * The design without opening row `index`. A ramp that follows an opening in that row stays where
 * it stands, placed on its own; a ramp that follows a later row keeps following it.
 */
export function withoutOpeningRow(config: ShedConfig, index: number): ShedConfig {
  const ramps = config.ramps.map((ramp): Ramp => {
    if (!ramp.opening || ramp.opening.row < index) return ramp;
    if (ramp.opening.row > index) return { ...ramp, opening: { ...ramp.opening, row: ramp.opening.row - 1 } };
    const { wall, left, right } = rampPlace(config, ramp);
    return { ...ramp, opening: null, wall, along: 'left', at: left, width: right - left };
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
    return { ...ramp, opening: null, wall, along: 'left', at: left, width: right - left };
  });
  return { ...config, openings, ramps };
}

/**
 * Ramps from the floor surface down to their foot, at or below grade. Wood: 2x6 deck boards across
 * stringers that butt the floor framing outside the wall sheathing. Concrete: a wedge from the
 * foundation's edge.
 */
export function frameRamps(config: ShedConfig, framing: readonly Member[]): { members: Member[]; solids: Solid[]; warnings: Warning[] } {
  const members: Member[] = [];
  const solids: Solid[] = [];
  const warnings: Warning[] = [];
  const nextId = idMaker(ASSEMBLIES.ramp.prefix);
  const frames = wallFrames(config.width, config.length);
  const grade = gradeOf(config, framing);
  // The ramp butts the floor framing, or the slab edge: the wall sheathing starts above them.
  const face = 0;
  const butts = config.foundation.type === 'slab' ? 'the slab edge, anchored to it' : 'the floor framing, lagged to it';
  const maxStock = (size: Member['size']) => Math.max(...stockFor(config.catalog, size));
  const boardWidth = LUMBER['2x6'].width;

  config.ramps.forEach((ramp, index) => {
    const source = `Ramp ${index + 1}`;
    const { wall, left, right, lost } = rampPlace(config, ramp);
    if (lost) warnings.push({ source, message: 'The opening it follows is gone. It stands at its own position.' });
    const frame = frames[wall];
    const outward: Vec3 = [-frame.v[0], -frame.v[1], 0];
    // A point `x` out from the wall's outside face, at `u` along it.
    const at = (u: number, x: number, z: number): Vec3 => [
      frame.origin[0] + frame.u[0] * u + outward[0] * x,
      frame.origin[1] + frame.u[1] * u + outward[1] * x,
      z,
    ];
    // The floor surface is at z = 0.
    const foot = grade - ramp.belowGrade;
    const rise = -foot;
    const angle = Math.atan(1 / ramp.slope);
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    // The plane extrudes along outward × up; start each part at the end that extrusion leaves from.
    const along = outward[1] * frame.u[0] - outward[0] * frame.u[1];
    const concrete = ramp.material === 'concrete';
    if (rise < (concrete ? NEAR : PLY / cos + NEAR)) {
      const outline = [at(left, face, 0), at(right, face, 0), at(right, face + 24, 0), at(left, face + 24, 0)];
      const reason = concrete ? 'so the ramp has no rise' : 'too low for stringers under the boards';
      warnings.push({
        source,
        message: `The floor is ${formatInches(Math.max(rise, 0))} above the ramp's foot, ${reason}. ${LEFT_OUT}`,
        missing: { assembly: 'ramp', outline },
      });
      return;
    }
    if (concrete) {
      // In the plane square to the wall, from the foundation's edge: the surface falls 1 in `slope`
      // to the foot, over a flat base `thickness` under the foot.
      const run = rise * ramp.slope;
      const base = foot - ramp.thickness;
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
          outline: [[0, 0], [run, foot], [run, base], [0, base]],
          holes: [],
        },
      });
      return;
    }

    // In the plane square to the wall: x out from the wall face, z up. The stringer top runs a
    // board's thickness under the ramp surface, which falls 1 in `slope` from the floor.
    const top = (x: number) => -(x - face) / ramp.slope - PLY / cos;
    const toe = face + ramp.slope * (rise - PLY / cos);
    const deep = LUMBER[ramp.stringer].width / cos;
    const board: Point[] = [[face, top(face)], [toe, foot], [toe, foot - deep], [face, top(face) - deep]];
    const outline = clipBelow(board, [0, -1], -foot);
    const degrees = `${((angle * 180) / Math.PI).toFixed(1)}°`;
    const seat = ramp.belowGrade > 0 ? `on the foot, ${formatInches(ramp.belowGrade)} below grade` : 'on grade';
    const note = `Plumb cut ${degrees} at ${butts}. Level cut ${seat}.`;
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
    const slopeLength = (ramp.slope * rise) / cos;
    const rows = Math.floor((slopeLength + GAP) / (boardWidth + GAP));
    const centers = starts.map((u) => u + PLY / 2);
    for (let row = 0; row < rows; row++) {
      const down = row * (boardWidth + GAP);
      for (const [from, to] of splitPlate([left, right], maxStock('2x6'), centers)) {
        const surface = at(from, face + down * cos, -down * sin);
        const origin: Vec3 = [surface[0] - PLY * normal[0], surface[1] - PLY * normal[1], surface[2] - PLY * normal[2]];
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
  });
  return { members, solids, warnings };
}
