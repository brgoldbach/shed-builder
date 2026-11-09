import { LUMBER, SHEETS } from '../core/catalog';
import type { ShedConfig } from '../core/config';
import { wallFrames, type Wall } from '../core/gen/walls';
import { corners, panelCorners, type Assembly, type Member, type Point, type Role, type Solid, type Vec3 } from '../core/member';
import type { Model } from '../core/model';
import type { Naming } from '../core/naming';
import { formatInches } from '../core/units';
import { depthOf, project, shapesOf, type Dimension, type Drawing, type View } from './drawing';

const UP: Vec3 = [0, 0, 1];
const DOWN: Vec3 = [0, 0, -1];
const INSIDE = -14; // px: RO dimensions sit inside the opening
const NEAR = 0.01;

interface Context {
  config: ShedConfig;
  model: Model;
  names: Naming;
  marks: ReadonlyMap<string, string>;
}

// The assemblies seen in each wall's elevation.
const ELEVATION: Record<Wall, Assembly[]> = {
  front: ['wall.front', 'knee.front'],
  back: ['wall.back', 'knee.back'],
  left: ['wall.left', 'gable.left'],
  right: ['wall.right', 'gable.right'],
};
const LAYOUT = new Set<Role>(['stud', 'king', 'cripple']);

/** Every framing drawing of the design, in sheet order. `marks` maps member ids to cut-list marks. */
export function buildDrawings(
  config: ShedConfig,
  model: Model,
  names: Naming,
  marks: ReadonlyMap<string, string>,
): Drawing[] {
  const context: Context = { config, model, names, marks };
  const drawings = [
    foundationPlan(context),
    floorPlan(context),
    ...names.sides.map((wall) => wallElevation(context, wall)),
    loftPlan(context),
    roofPlan(context),
    buildingSection(context),
    rafterDetail(context),
  ];
  return drawings.filter((drawing) => drawing !== null);
}

/** Positions in order, without repeats. */
const distinct = (values: number[]) =>
  [...values].sort((first, second) => first - second).filter((value, index, sorted) => index === 0 || value - sorted[index - 1] > NEAR);

function boxOf(points: readonly Point[]): { min: Point; max: Point } {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

const extentOf = (view: View, members: readonly Member[]) =>
  boxOf(members.flatMap((member) => corners(member).map((point) => project(view, point))));

const pitchText = ({ roof }: ShedConfig) => `Pitch ${roof.pitch}/12 (${((Math.atan(roof.pitch / 12) * 180) / Math.PI).toFixed(1)}°).`;

function makeDrawing(id: string, title: string, parts: Partial<Drawing> & Pick<Drawing, 'shapes'>): Drawing {
  return { id, title, dims: [], labels: [], outlines: [], notes: [], ...parts };
}

// Plans look down with the user's front at the bottom.
function planView({ front, width }: ShedConfig): View {
  return front === 'gable'
    ? { origin: [0, width, 0], right: [0, -1, 0], up: [1, 0, 0], forward: DOWN }
    : { origin: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], forward: DOWN };
}

function footprint({ width, length }: ShedConfig, view: View): Point[] {
  const corners: Vec3[] = [[0, 0, 0], [length, 0, 0], [length, width, 0], [0, width, 0]];
  return corners.map((corner) => project(view, corner));
}

const overall = ({ min, max }: { min: Point; max: Point }, tier: number): Dimension[] => [
  { kind: 'chain', side: 'bottom', tier, at: [min[0], max[0]], feet: true },
  { kind: 'chain', side: 'right', tier, at: [min[1], max[1]], feet: true },
];

/** Drawing axis (0 for x, 1 for y) that members advance along: across their length. */
function across(view: View, member: Member): 0 | 1 {
  const { length } = member.axes;
  const along = (axis: Vec3) => Math.abs(length[0] * axis[0] + length[1] * axis[1] + length[2] * axis[2]);
  return along(view.right) > along(view.up) ? 1 : 0;
}

/** Tape positions of the near edge of each member, from `origin`, along the axis across them. */
function runningLayout(view: View, members: readonly Member[], origin: Point): Dimension[] {
  if (members.length === 0) return [];
  const axis = across(view, members[0]);
  const at = distinct(members.map((member) => extentOf(view, [member]).min[axis])).filter((value) => value > origin[axis] + NEAR);
  return [{ kind: 'running', side: axis === 0 ? 'bottom' : 'left', tier: 1, origin: origin[axis], at }];
}

function foundationPlan({ config, model, marks }: Context): Drawing {
  const view = planView(config);
  const members = model.members.filter((member) => member.assembly === 'foundation');
  const solids = model.solids.filter((solid) => solid.layer === 'foundation');
  const outline = footprint(config, view);
  const box = boxOf(outline);
  const dims: Dimension[] = [];
  const { foundation } = config;
  const notes: string[] = [];

  if (foundation.type === 'slab') {
    const { slab } = foundation;
    const edge = slab.thickenedEdge
      ? `, with a thickened edge ${formatInches(slab.edgeWidth)} wide and ${formatInches(slab.edgeDepth)} deep`
      : '';
    notes.push(`${formatInches(slab.thickness)} slab${edge}.`);
    notes.push(
      `1/2" anchor bolts on each sill: ${formatInches(slab.anchorEndDistance)} from each end and at most ` +
        `${formatInches(slab.anchorSpacing)} apart, none in doorways.`,
    );
  } else {
    const lines = members.filter((member) => member.role === 'skid' || member.role === 'girder');
    const side = across(view, lines[0]);
    const along = side === 0 ? 1 : 0;
    // The shed's own piers; lean-to piers stand outside the footprint.
    const piers = solids.flatMap((solid) =>
      solid.shape.kind === 'cylinder' && solid.material === 'concrete' && solid.id.startsWith('FD') ? [project(view, solid.shape.base)] : [],
    );
    const centers =
      foundation.type === 'pier'
        ? piers.map((center) => center[side])
        : lines.map((member) => {
            const { min, max } = extentOf(view, [member]);
            return (min[side] + max[side]) / 2;
          });
    const sideOf = (axis: 0 | 1) => (axis === 0 ? 'bottom' : 'right');
    dims.push({ kind: 'chain', side: sideOf(side), tier: 1, at: distinct([box.min[side], ...centers, box.max[side]]) });
    if (foundation.type === 'pier') {
      const { pier } = foundation;
      dims.push({ kind: 'chain', side: sideOf(along), tier: 1, at: distinct([box.min[along], ...piers.map((center) => center[along]), box.max[along]]) });
      notes.push(
        `${pier.diameter}" concrete piers, ${formatInches(pier.depth)} below grade and ${formatInches(pier.aboveGrade)} above, ` +
          `at most ${formatInches(pier.maxSpacing)} apart.`,
      );
      notes.push(`${pier.girderCount} girders of ${pier.girderPlies} PT ${pier.girder}.`);
      if (pier.post !== 'none') notes.push(`PT ${pier.post} posts, ${formatInches(pier.postLength)} long.`);
    } else {
      notes.push(`${foundation.skid.count} PT ${foundation.skid.size} skids on edge, the full length.`);
    }
    notes.push('Dimensions run to the centers of the lines and piers.');
  }
  dims.push(...overall(box, 2));
  return makeDrawing('foundation', 'Foundation plan', {
    shapes: shapesOf(view, members, solids, marks),
    dims,
    outlines: [outline],
    notes,
    wireframe: true,
  });
}

function floorPlan({ config, model, marks }: Context): Drawing | null {
  const members = model.members.filter((member) => member.assembly === 'floor');
  if (members.length === 0) return null;
  const view = planView(config);
  const { floor } = config;
  const box = extentOf(view, members);
  const joists = members.filter((member) => member.role === 'joist.floor' || member.role === 'joist.end');
  const notes = [
    `${floor.treated ? 'PT ' : ''}${floor.joist} joists at ${floor.oc}" o.c., ${SHEETS[floor.subfloor].label} subfloor.`,
    'Layout runs to the near edge of each joist.',
  ];
  if (floor.blocking) notes.push('Blocking at mid-span.');
  return makeDrawing('floor', 'Floor framing plan', {
    shapes: shapesOf(view, members, [], marks),
    dims: [...runningLayout(view, joists, box.min), ...overall(box, 2)],
    notes,
  });
}

function wallElevation({ config, model, names, marks }: Context, wall: Wall): Drawing {
  const frame = wallFrames(config.width, config.length)[wall];
  const view: View = { origin: frame.origin, right: frame.u, up: UP, forward: frame.v };
  const own = model.members.filter((member) => ELEVATION[wall].includes(member.assembly));
  const framing = own.filter((member) => member.assembly === `wall.${wall}`);
  // The end rafter over a gable-end wall, for reference.
  const wallDepth = LUMBER[config.walls.stud].width;
  const context = model.members.filter(
    (member) =>
      member.role === 'rafter' &&
      corners(member).every((point) => {
        const depth = depthOf(view, point);
        return depth > -NEAR && depth < wallDepth + NEAR;
      }),
  );

  const plates = extentOf(view, framing.filter((member) => member.role === 'plate.bottom' || member.role === 'plate.sill'));
  const [start, end] = [plates.min[0], plates.max[0]];
  const walls = extentOf(view, framing);
  const all = extentOf(view, own);
  const openings = model.openings.filter((opening) => opening.wall === wall).sort((first, second) => first.left - second.left);
  const layout = distinct(
    framing.filter((member) => LAYOUT.has(member.role)).map((member) => extentOf(view, [member]).min[0]),
  ).filter((value) => value > start + NEAR);

  const dims: Dimension[] = [{ kind: 'running', side: 'bottom', tier: 1, origin: start, at: layout }];
  if (openings.length > 0) {
    dims.push({ kind: 'chain', side: 'bottom', tier: 2, at: [start, ...openings.flatMap(({ left, right }) => [left, right]), end] });
  }
  dims.push({ kind: 'chain', side: 'bottom', tier: openings.length > 0 ? 3 : 2, at: [start, end], feet: true });
  dims.push({ kind: 'chain', side: 'right', tier: 1, at: [walls.min[1], walls.max[1]], feet: true });
  if (all.max[1] > walls.max[1] + NEAR) dims.push({ kind: 'chain', side: 'right', tier: 2, at: [walls.min[1], all.max[1]], feet: true });
  for (const { left, right, bottom, top } of openings) {
    dims.push({ kind: 'aligned', from: [left, top], to: [right, top], offset: INSIDE });
    if (bottom > 0) dims.push({ kind: 'aligned', from: [left, 0], to: [left, bottom], offset: INSIDE });
    dims.push({ kind: 'aligned', from: [left, bottom], to: [left, top], offset: INSIDE });
  }

  const notes = [
    `${config.walls.stud} studs at ${config.walls.oc}" o.c.`,
    'Layout and RO (rough opening) positions run from the left end of the bottom plate, viewed from outside.',
  ];
  return makeDrawing(`wall-${wall}`, `${names.assembly(`wall.${wall}`).label}, from outside`, {
    shapes: shapesOf(view, own, [], marks, { context }),
    dims,
    labels: openings.map(({ name, left, right, bottom, top }) => ({ at: [(left + right) / 2, (bottom + top) / 2], text: name, room: right - left })),
    notes,
  });
}

function loftPlan({ config, model, marks }: Context): Drawing | null {
  const members = model.members.filter((member) => member.assembly === 'loft' || member.assembly.startsWith('knee.'));
  if (!members.some((member) => member.assembly === 'loft')) return null;
  const view = planView(config);
  const { loft } = config.roof;
  const box = extentOf(view, members);
  const joists = members.filter((member) => member.role === 'joist.loft');
  return makeDrawing('loft', 'Loft framing plan', {
    shapes: shapesOf(view, members, [], marks),
    dims: [...runningLayout(view, joists, boxOf(footprint(config, view)).min), ...overall(box, 2)],
    outlines: [footprint(config, view)],
    notes: [`${loft.joist} loft joists at ${loft.oc}" o.c.`, 'Layout runs to the near edge of each joist. The dashed line is the outside of the walls.'],
  });
}

function roofPlan({ config, model, marks }: Context): Drawing {
  const view = planView(config);
  const members = model.members.filter((member) => member.assembly === 'roof' || member.assembly.startsWith('addition'));
  const { roof } = config;
  const box = extentOf(view, members);
  const outline = footprint(config, view);
  const walls = boxOf(outline);
  const rafters = members.filter((member) => member.role === 'rafter' && member.assembly === 'roof');
  return makeDrawing('roof', 'Roof framing plan', {
    shapes: shapesOf(view, members, [], marks),
    dims: [
      ...runningLayout(view, rafters, walls.min),
      { kind: 'chain', side: 'bottom', tier: 2, at: distinct([box.min[0], walls.min[0], walls.max[0], box.max[0]]) },
      { kind: 'chain', side: 'right', tier: 2, at: distinct([box.min[1], walls.min[1], walls.max[1], box.max[1]]) },
      ...overall(box, 3),
    ],
    outlines: [outline],
    notes: [
      `${roof.rafter} rafters at ${roof.oc}" o.c. ${pitchText(config)}`,
      'Layout runs from the end wall to the near edge of each rafter. The dashed line is the outside of the walls.',
    ],
  });
}

// A slice across the building at the rafter pair nearest the middle, viewed from the model's left end.
function buildingSection({ config, model, names, marks }: Context): Drawing {
  const { width, length, roof } = config;
  const view: View = { origin: [0, width, 0], right: [0, -1, 0], up: UP, forward: [1, 0, 0] };
  const xRange = (points: Vec3[]) => [Math.min(...points.map(([x]) => x)), Math.max(...points.map(([x]) => x))] as const;
  const middle = (member: Member) => {
    const [low, high] = xRange(corners(member));
    return (low + high) / 2;
  };
  const rafters = model.members.filter((member) => member.role === 'rafter');
  const cut = rafters.length
    ? rafters.map(middle).reduce((best, x) => (Math.abs(x - length / 2) < Math.abs(best - length / 2) ? x : best))
    : length / 2;
  const [low, high] = [cut - roof.oc / 2, cut + roof.oc / 2];
  const inSlice = ([from, to]: readonly [number, number]) => to > low && from < high;
  const members = model.members.filter((member) => inSlice(xRange(corners(member))));
  const solidRange = ({ shape }: Solid): readonly [number, number] => {
    if (shape.kind === 'panel') return xRange(panelCorners(shape));
    if (shape.kind === 'box') return [shape.min[0], shape.max[0]];
    return [shape.base[0] - shape.radius, shape.base[0] + shape.radius];
  };
  const solids = model.solids.filter((solid) => inSlice(solidRange(solid)));

  const box = extentOf(view, members);
  const wallTop = (wall: Wall) => extentOf(view, model.members.filter((member) => member.assembly === `wall.${wall}`)).max[1];
  const [front, back] = [wallTop('front'), wallTop('back')];
  const dims: Dimension[] = [
    { kind: 'chain', side: 'right', tier: 1, at: distinct([Math.min(box.min[1], 0), 0, front, box.max[1]]) },
    { kind: 'chain', side: 'top', tier: 1, at: distinct([box.min[0], 0, width, box.max[0]]) },
  ];
  if (Math.abs(back - front) > NEAR) dims.push({ kind: 'chain', side: 'left', tier: 1, at: [0, back] });
  return makeDrawing('section', 'Building section', {
    shapes: shapesOf(view, members, solids, marks, { section: true }),
    dims,
    notes: [
      `Through the rafters ${formatInches(cut)} from the ${names.side('left')} end, viewed from the ${names.side('left')} end. ${pitchText(config)}`,
      'Members cut by the section show an X.',
    ],
  });
}

// One common rafter, low end on the left, with its cuts dimensioned along the top edge.
function rafterDetail({ config, model, marks }: Context): Drawing | null {
  const rafters = model.members.filter((member) => member.role === 'rafter' && member.assembly === 'roof');
  if (!rafters.length) return null;
  // The one nearest the middle: on a raised roof the gable-end rafters have no birdsmouth.
  const offMiddle = (member: Member) => Math.abs(corners(member)[0][0] - config.length / 2);
  const rafter = rafters.reduce((best, member) => (offMiddle(member) < offMiddle(best) ? member : best));
  // right = forward × up
  const facing = (forward: Vec3): View => ({ origin: [0, 0, 0], right: [forward[1], -forward[0], 0], up: UP, forward });
  let view = facing([-1, 0, 0]);
  const points3 = corners(rafter);
  const lowest = points3.reduce((best, point) => (point[2] < best[2] ? point : best));
  const highest = points3.reduce((best, point) => (point[2] > best[2] ? point : best));
  if (project(view, lowest)[0] > project(view, highest)[0]) view = facing([1, 0, 0]);
  const shapes = shapesOf(view, [rafter], [], marks);
  const outline = shapes[0].outline;
  const points = outline.kind === 'polygon' ? outline.points : [];

  const edges = points.map((point, index) => [point, points[(index + 1) % points.length]] as const);
  const size = ([from, to]: readonly [Point, Point]) => Math.hypot(to[0] - from[0], to[1] - from[1]);
  const top = edges.reduce((best, edge) => (size(edge) > size(best) ? edge : best));
  const [left, right] = top[0][0] < top[1][0] ? [top[0], top[1]] : [top[1], top[0]];
  const onTop = (x: number): Point => [x, left[1] + ((x - left[0]) * (right[1] - left[1])) / (right[0] - left[0])];
  const level = ([from, to]: readonly [Point, Point]) => Math.abs(to[1] - from[1]) < NEAR && size([from, to]) > NEAR;
  const plumb = ([from, to]: readonly [Point, Point]) => Math.abs(to[0] - from[0]) < NEAR && size([from, to]) > NEAR;
  const seats = edges.filter(level);
  const shares = (first: readonly [Point, Point], second: readonly [Point, Point]) => first.some((point) => second.includes(point));
  const heels = edges.filter((edge) => plumb(edge) && seats.some((seat) => shares(seat, edge)));

  const marksOnTop = [left, ...heels.map(([from]) => onTop(from[0])).sort((first, second) => first[0] - second[0]), right];
  const dims: Dimension[] = [
    ...marksOnTop.slice(1).map((point, index): Dimension => ({ kind: 'aligned', from: marksOnTop[index], to: point, offset: 16 })),
    ...seats.map(([from, to]): Dimension => {
      const [start, finish] = from[0] < to[0] ? [from, to] : [to, from];
      return { kind: 'aligned', from: start, to: finish, offset: -30 };
    }),
    // On the tail side of the heel, clear of the seat dimension.
    ...heels.map(([from, to]): Dimension => {
      const [start, finish] = from[1] < to[1] ? [from, to] : [to, from];
      return { kind: 'aligned', from: start, to: finish, offset: 16 };
    }),
  ];
  const mark = marks.get(rafter.id);
  return makeDrawing('rafter', 'Common rafter', {
    shapes,
    dims,
    notes: [
      `${mark ? `${mark}: ` : ''}${rafter.size}, ${formatInches(rafter.length)} long point to long point. ${pitchText(config)}`,
      ...(rafter.note ? [rafter.note] : []),
      'Top-edge dimensions run from each end of the top edge to the heel lines.',
    ],
  });
}
