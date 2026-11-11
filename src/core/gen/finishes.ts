import { LUMBER, SHEETS } from '../catalog';
import { WALLS, type ShedConfig } from '../config';
import { corners, type Layer, type Panel, type Point, type Vec3 } from '../member';
import type { Model } from '../model';
import { hull } from './section';
import { wallFace, type Rect } from './sheathing';
import { wallFrames, type Frame, type RoughOpening } from './walls';

/** How a finish surface looks: a texture, or a plain color, glass, or metal. */
export type Look = 'lap' | 't1-11' | 'board-batten' | 'shingles' | 'planks' | 'garage' | 'plain' | 'glass' | 'metal';

/** Corrugated metal: one panel from `origin`, `length` along u (across the waves), `width` along v. */
export interface Corrugated {
  kind: 'corrugated';
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  length: number;
  width: number;
}

/** A part of the finished look in 3D. `tile` is the texture's repeat in inches, along u and v. */
export interface FinishPart {
  layer: Extract<Layer, 'siding' | 'roofing' | 'openings'>;
  look: Look;
  color: string;
  tile?: Point;
  shape: Panel | { kind: 'box'; min: Vec3; max: Vec3 } | Corrugated;
}

const SIDING = 0.5; // siding thickness
const TRIM = 0.75; // corner boards and casings
const CASING = 3.5; // casing width
const CORNER = [4.25, 3.5]; // corner board widths: the overlapping one, the butted one
const JAMB = 0.75;
const SLAB = 1.75; // door thickness
const SASH = 2; // window frame width
const PAIR = 50; // a door RO wider than this takes a pair of leaves
const SHINGLE = 0.3;
const CAP = 6; // ridge cap reach down each slope
const FLASH = 4; // gambrel break flashing reach down or up each slope
const COVER = 24; // corrugated panel coverage; the panel is 2 in wider, for the side lap
const PANEL = 26;
const END_LAP = 6;
export const WAVE = COVER / 9; // corrugation pitch: 9 waves per panel cover
export const DEPTH = 0.5; // corrugation depth
// A vented metal ridge cap, in its cross-section, horizontal from the ridge: flanges on the panels
// out to `reach`, a riser at `riser` with the vent gap under the cap, `vent` tall.
const RIDGE = { reach: 8, riser: 3, vent: 1.25, thick: 0.125 };
const VENT = '#262626';
const KNOB = '#3a3a3a';
const GLASS = '#9fc3d6';
const UP: Vec3 = [0, 0, 1];

const TILES: Partial<Record<Look, Point>> = {
  lap: [48, 6],
  't1-11': [8, 8],
  'board-batten': [12, 12],
  shingles: [36, 10],
  planks: [6, 12],
};

const add = (first: Vec3, second: Vec3, by = 1): Vec3 => [first[0] + second[0] * by, first[1] + second[1] * by, first[2] + second[2] * by];
const cross = (first: Vec3, second: Vec3): Vec3 => [
  first[1] * second[2] - first[2] * second[1],
  first[2] * second[0] - first[0] * second[2],
  first[0] * second[1] - first[1] * second[0],
];
const loop = ({ min, max }: Rect): Point[] => [min, [max[0], min[1]], max, [min[0], max[1]]];
const unit = (vector: Vec3): Vec3 => {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
};

/**
 * Siding, roofing, doors, and windows for the 3D view, in the chosen colors. They are for the look
 * only: none reaches the cut list, BOM, or drawings.
 */
export function buildFinishes(config: ShedConfig, model: Model): FinishPart[] {
  return [...siding(config, model), ...roofing(config, model), ...openings(config, model)];
}

// A flat part in a wall's plane, `out` inches outside the framing face, `thick` deep toward the outside.
const inWall = (frame: Frame, out: number, thick: number, outline: Point[], holes: Point[][] = []): Panel => ({
  kind: 'panel',
  origin: add(frame.origin, frame.v, -out),
  u: frame.u,
  v: UP,
  thick,
  outline,
  holes,
});

// A box from wall coordinates (u, z, depth outside the framing face) to an axis-aligned world box.
function wallBox(frame: Frame, [u0, z0, out0]: Vec3, [u1, z1, out1]: Vec3): { kind: 'box'; min: Vec3; max: Vec3 } {
  const at = (u: number, z: number, out: number) => add(add(add(frame.origin, frame.u, u), UP, z), frame.v, -out);
  const [first, second] = [at(u0, z0, out0), at(u1, z1, out1)];
  const low = (axis: number) => Math.min(first[axis], second[axis]);
  const high = (axis: number) => Math.max(first[axis], second[axis]);
  return { kind: 'box', min: [low(0), low(1), low(2)], max: [high(0), high(1), high(2)] };
}

const sheathing = (config: ShedConfig) => (config.walls.sheathing === 'none' ? 0 : SHEETS[config.walls.sheathing].thick);

function siding(config: ShedConfig, model: Model): FinishPart[] {
  const { siding: look, sidingColor, trimColor } = config.finishes;
  if (look === 'none') return [];
  const sheath = sheathing(config);
  const face = sheath + SIDING;
  const frames = wallFrames(config.width, config.length);
  // The siding laps down over the floor framing.
  const floor = model.members.filter((member) => member.assembly === 'floor').flatMap((member) => corners(member).map(([, , z]) => z));
  const bottom = Math.min(0, ...floor);
  const parts: FinishPart[] = [];
  const tops: Record<string, number> = {};
  for (const wall of WALLS) {
    const frame = frames[wall];
    const { region, holes } = wallFace(config, wall, frame, model.members, model.openings, face);
    const us = region.map(([u]) => u);
    const outline = hull([...region, [Math.min(...us), bottom], [Math.max(...us), bottom]]);
    tops[wall] = Math.max(...region.map(([, z]) => z));
    parts.push({ layer: 'siding', look, color: sidingColor, tile: TILES[look], shape: inWall(frame, sheath, SIDING, outline, holes.map(loop)) });
  }
  // Corner boards: an L of two boards at each corner, as tall as the eave wall there.
  const [overlap, butt] = CORNER;
  for (const [x, y, top] of [
    [0, 0, tops.front],
    [config.length, 0, tops.front],
    [0, config.width, tops.back],
    [config.length, config.width, tops.back],
  ]) {
    const [sx, sy] = [x === 0 ? -1 : 1, y === 0 ? -1 : 1];
    const [outX, outY] = [x + sx * face, y + sy * face];
    const box = (x0: number, x1: number, y0: number, y1: number) => ({
      kind: 'box' as const,
      min: [Math.min(x0, x1), Math.min(y0, y1), bottom] as Vec3,
      max: [Math.max(x0, x1), Math.max(y0, y1), top] as Vec3,
    });
    parts.push(
      { layer: 'siding', look: 'plain', color: trimColor, shape: box(outX + sx * TRIM, outX + sx * TRIM - sx * overlap, outY, outY + sy * TRIM) },
      { layer: 'siding', look: 'plain', color: trimColor, shape: box(outX, outX + sx * TRIM, outY, outY - sy * butt) },
    );
  }
  // Casings around each opening; a door's stops at the floor.
  for (const opening of model.openings) {
    const frame = frames[opening.wall];
    const door = kindOf(config, opening) !== 'window' && kindOf(config, opening) !== 'custom';
    const { left, right, bottom: low, top } = opening;
    const outer: Rect = { min: [left - CASING, door ? low : low - CASING], max: [right + CASING, top + CASING] };
    const shape = door
      ? inWall(frame, face, TRIM, [[outer.min[0], low], [left, low], [left, top], [right, top], [right, low], [outer.max[0], low], outer.max, [outer.min[0], outer.max[1]]])
      : inWall(frame, face, TRIM, loop(outer), [loop({ min: [left, low], max: [right, top] })]);
    parts.push({ layer: 'siding', look: 'plain', color: trimColor, shape });
  }
  return parts;
}

const kindOf = (config: ShedConfig, opening: RoughOpening) => config.openingTypes.find(({ name }) => name === opening.name)?.kind ?? 'custom';

function roofing(config: ShedConfig, model: Model): FinishPart[] {
  const { roof, finishes } = config;
  const parts: FinishPart[] = [];
  const sheath = roof.sheathing === 'none' ? 0 : SHEETS[roof.sheathing].thick;
  let capped = false;
  for (const plane of model.planes) {
    const main = plane.assembly === 'roof';
    const metal = main ? roof.roofing !== 'shingles' : !plane.sheathed;
    const addition = model.leanTos.find(({ side }) => plane.assembly === `addition.${side}`)?.addition;
    const purlin = main ? roof.purlin : (addition?.purlin ?? roof.purlin);
    const out = cross(plane.u, plane.v);
    const lift = (plane.sheathed ? sheath : 0) + (metal ? LUMBER[purlin].thick : 0);
    if (metal) {
      // Columns from the rake along the eave; rows up the slope from past the eave, each lapping
      // the one below. A plane that runs on into a lean-to extension has no eave to overhang.
      const overhang = plane.eaves > 0 ? finishes.metalOverhang : 0;
      for (let column = 0; column * COVER < plane.length - 0.01; column++) {
        const across = column * COVER;
        for (let row = 0, up = -overhang; up < plane.width - 0.01; row++) {
          const width = Math.min(finishes.panelLength, plane.width - up);
          // Each lap sits a little above the panel it covers.
          const origin = add(add(add(plane.origin, plane.u, across), plane.v, up), out, lift + 0.02 * (column % 2) + 0.06 * row);
          parts.push({
            layer: 'roofing',
            look: 'metal',
            color: finishes.roofColor,
            shape: { kind: 'corrugated', origin, u: plane.u, v: plane.v, length: Math.min(PANEL, plane.length - across), width },
          });
          if (up + width >= plane.width - 0.01) break;
          up += width - END_LAP;
        }
      }
    } else {
      parts.push({
        layer: 'roofing',
        look: 'shingles',
        color: finishes.roofColor,
        tile: TILES.shingles,
        shape: { kind: 'panel', origin: add(plane.origin, out, lift), u: plane.u, v: plane.v, thick: SHINGLE, outline: loop({ min: [0, 0], max: [plane.length, plane.width] }), holes: [] },
      });
    }
    // A ridge cap where a gable or gambrel roof's two planes meet: one vented metal cap, or a
    // shingle cap on each plane.
    if (plane.ridge && metal && !capped) {
      // Above the ridge line, where the two slopes' panel crests meet.
      const ridge = add(add(plane.origin, plane.v, plane.width), UP, (lift + DEPTH) / out[2]);
      parts.push(...ridgeVent(ridge, plane.u, plane.length, unit([-plane.v[0], -plane.v[1], 0]), roof.pitch / 12, finishes.roofColor));
      capped = true;
    }
    // At a gambrel's break: a flashing strip over the roofing on each plane.
    if (plane.breakEdge) {
      const [from, to] = plane.breakEdge === 'high' ? [plane.width - FLASH, plane.width] : [0, FLASH];
      parts.push({
        layer: 'roofing',
        look: 'plain',
        color: finishes.roofColor,
        shape: {
          kind: 'panel',
          origin: add(plane.origin, out, lift + (metal ? DEPTH : SHINGLE)),
          u: plane.u,
          v: plane.v,
          thick: 0.0625,
          outline: loop({ min: [0, from], max: [plane.length, to] }),
          holes: [],
        },
      });
    }
    if (plane.ridge && !metal) {
      parts.push({
        layer: 'roofing',
        look: 'plain',
        color: finishes.roofColor,
        shape: {
          kind: 'panel',
          origin: add(plane.origin, out, lift + SHINGLE),
          u: plane.u,
          v: plane.v,
          thick: 0.25,
          outline: loop({ min: [0, plane.width - CAP], max: [plane.length, plane.width] }),
          holes: [],
        },
      });
    }
  }
  return parts;
}

/**
 * A vented ridge cap from `ridge`, at one rake, `length` along `along`. Its cross-section lies in
 * the plane of `down` (level, from the ridge toward one eave) and up, at `rise` per unit run.
 */
function ridgeVent(ridge: Vec3, along: Vec3, length: number, down: Vec3, rise: number, color: string): FinishPart[] {
  const { reach, riser, vent, thick } = RIDGE;
  const roof = (run: number) => -rise * run;
  const outline: Point[] = [
    [reach, roof(reach)],
    [reach, roof(reach) + thick],
    [riser, roof(riser) + thick],
    [riser, roof(riser) + vent],
    [0, vent],
    [-riser, roof(riser) + vent],
    [-riser, roof(riser) + thick],
    [-reach, roof(reach) + thick],
    [-reach, roof(reach)],
    [0, 0],
  ];
  // The cross-section extrudes along down × up; start at whichever rake that runs away from.
  const extrude = cross(down, UP);
  const origin = extrude[0] * along[0] + extrude[1] * along[1] > 0 ? ridge : add(ridge, along, length);
  const section = (shape: Point[]): Panel => ({ kind: 'panel', origin, u: down, v: UP, thick: length, outline: shape, holes: [] });
  // The dark vent gap under the cap, on each riser's face.
  const gap = (side: number): Point[] => loop({ min: [side * riser, roof(riser) + thick], max: [side * (riser + 0.05), roof(riser) + vent - 0.1] });
  return [
    { layer: 'roofing', look: 'metal', color, shape: section(outline) },
    ...[1, -1].map((side): FinishPart => ({ layer: 'roofing', look: 'plain', color: VENT, shape: section(gap(side)) })),
  ];
}

function openings(config: ShedConfig, model: Model): FinishPart[] {
  const { trimColor, doorColor } = config.finishes;
  const frames = wallFrames(config.width, config.length);
  const depth = LUMBER[config.walls.stud].width;
  const sheath = sheathing(config);
  const parts: FinishPart[] = [];
  const part = (look: Look, color: string, shape: FinishPart['shape'], tile?: Point) => parts.push({ layer: 'openings', look, color, shape, ...(tile && { tile }) });
  for (const opening of model.openings) {
    const frame = frames[opening.wall];
    const kind = kindOf(config, opening);
    const { left, right, bottom, top } = opening;
    // Jambs and frames run through the wall, from its inside face to the sheathing's face.
    const through = (outline: Point[], holes: Point[][] = []) => inWall(frame, -depth, depth + sheath, outline, holes);
    if (kind === 'window' || kind === 'custom') {
      part('plain', trimColor, through(loop({ min: [left, bottom], max: [right, top] }), [loop({ min: [left + SASH, bottom + SASH], max: [right - SASH, top - SASH] })]));
      part('glass', GLASS, inWall(frame, -1, 0.125, loop({ min: [left + SASH, bottom + SASH], max: [right - SASH, top - SASH] })));
      const middle = (bottom + top) / 2;
      part('plain', trimColor, inWall(frame, -1.5, 1.5, loop({ min: [left + SASH, middle - 0.75], max: [right - SASH, middle + 0.75] })));
      continue;
    }
    for (const outline of [
      loop({ min: [left, bottom], max: [left + JAMB, top] }),
      loop({ min: [right - JAMB, bottom], max: [right, top] }),
      loop({ min: [left + JAMB, top - JAMB], max: [right - JAMB, top] }),
    ]) {
      part('plain', trimColor, through(outline));
    }
    const [from, to, high] = [left + JAMB + 0.125, right - JAMB - 0.125, top - JAMB - 0.125];
    if (kind === 'overhead') {
      part('garage', doorColor, inWall(frame, -SLAB, SLAB, loop({ min: [from, bottom], max: [to, high] })), [(to - from) / 4, (high - bottom) / 4]);
      continue;
    }
    // A door: one leaf, or a pair over a wide RO, each with a knob by its latch edge.
    const leaves: [number, number][] = right - left > PAIR ? [[from, (from + to) / 2 - 0.0625], [(from + to) / 2 + 0.0625, to]] : [[from, to]];
    leaves.forEach(([start, end], index) => {
      part('planks', doorColor, inWall(frame, -SLAB, SLAB, loop({ min: [start, bottom + 0.5], max: [end, high] })), TILES.planks);
      const latch = leaves.length === 2 && index === 1 ? start + 3 : end - 3;
      part('plain', KNOB, wallBox(frame, [latch - 0.75, bottom + 36, 0], [latch + 0.75, bottom + 37.5, 2]));
    });
  }
  return parts;
}
