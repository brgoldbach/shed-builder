import { LUMBER, SHEETS, stockFor, type LumberSize } from '../catalog';
import type { ShedConfig } from '../config';
import { corners, type Assembly, type Member, type Point, type Role, type Solid, type Vec3 } from '../member';
import { formatInches } from '../units';
import { idMaker, planeMember } from './section';
import { splitPlate } from './walls';

const PLY = 1.5; // thickness of 2x lumber
const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const UP: Vec3 = [0, 0, 1];

/**
 * Foundation and floor framing. The floor surface (subfloor or slab top) is z = 0, so everything
 * here is below it.
 */
export function frameFloor(config: ShedConfig): { members: Member[]; solids: Solid[] } {
  const { width, length, floor, foundation, catalog } = config;
  const members: Member[] = [];
  const solids: Solid[] = [];
  const floorIds = idMaker('FL');
  const foundationIds = idMaker('FD');
  const maxStock = (size: LumberSize) => Math.max(...stockFor(catalog, size));
  const box = (id: string, label: string, layer: Solid['layer'], material: Solid['material'], min: Vec3, max: Vec3): Solid => ({
    id,
    label,
    layer,
    material,
    shape: { kind: 'box', min, max },
  });

  if (foundation.type === 'slab') {
    const slab = foundation.slab;
    solids.push(box(foundationIds('SL'), 'Slab', 'foundation', 'concrete', [0, 0, -slab.thickness], [length, width, 0]));
    if (slab.thickenedEdge && slab.edgeDepth > slab.thickness) {
      const { edgeWidth: edge, edgeDepth: depth, thickness } = slab;
      const ring: [Vec3, Vec3][] = [
        [[0, 0, -depth], [length, edge, -thickness]],
        [[0, width - edge, -depth], [length, width, -thickness]],
        [[0, edge, -depth], [edge, width - edge, -thickness]],
        [[length - edge, edge, -depth], [length, width - edge, -thickness]],
      ];
      for (const [min, max] of ring) solids.push(box(foundationIds('TE'), 'Thickened edge', 'foundation', 'concrete', min, max));
    }
    return { members, solids };
  }

  const subfloor = SHEETS[floor.subfloor];
  const joistBottom = -subfloor.thick - LUMBER[floor.joist].width;
  const board = (assembly: Assembly, id: string, role: Role, size: LumberSize, treated: boolean, length: number, origin: Vec3, axes: Member['axes']): Member => ({
    id,
    assembly,
    role,
    size,
    treated,
    length,
    origin,
    axes,
  });

  // Joists run front to back between the rims: an end joist at each end, the rest on o.c.
  // multiples from the left corner.
  const joists = [0, length - PLY];
  for (let index = 1; index * floor.oc < length; index++) {
    const from = index * floor.oc - PLY / 2;
    if (from >= PLY && from + PLY <= length - PLY) joists.push(from);
  }
  joists.sort((first, second) => first - second);
  const centers = joists.map((x) => x + PLY / 2);
  for (const x of joists) {
    const end = x === 0 || x === length - PLY;
    members.push(
      board('floor', floorIds(end ? 'EJ' : 'J'), end ? 'joist.end' : 'joist.floor', floor.joist, floor.treated, width - 2 * PLY, [x, PLY, joistBottom], {
        length: Y,
        width: UP,
        thick: X,
      }),
    );
  }
  for (const [y, inward] of [[0, 1], [width, -1]] as const) {
    for (const [from, to] of splitPlate([0, length], maxStock(floor.joist), centers)) {
      members.push(board('floor', floorIds('R'), 'rim.floor', floor.joist, floor.treated, to - from, [from, y, joistBottom], {
        length: X,
        width: UP,
        thick: [0, inward, 0],
      }));
    }
  }
  if (floor.blocking) {
    for (let index = 1; index < joists.length; index++) {
      const from = joists[index - 1] + PLY;
      members.push(board('floor', floorIds('B'), 'blocking', floor.joist, floor.treated, joists[index] - from, [from, width / 2 - PLY / 2, joistBottom], {
        length: X,
        width: UP,
        thick: Y,
      }));
    }
  }

  // Skids or girders run left to right under the joists: evenly spaced, the outer two flush with
  // the floor edges.
  const lines = (count: number, across: number) =>
    Array.from({ length: count }, (_, index) => across / 2 + (index * (width - across)) / (count - 1));

  if (foundation.type === 'skid') {
    const { size, count } = foundation.skid;
    // On edge: the wider face stands.
    const { width: height, thick: across } = LUMBER[size];
    // Each end of a skid run is cut 45° across its bottom third, as on a sled runner, so the shed
    // rides up over the ground when it is dragged. A splice in a long run stays square.
    const cut = Math.round((height / 3) * 8) / 8;
    const [bottom, top] = [joistBottom - height, joistBottom];
    for (const y of lines(count, across)) {
      for (const [from, to] of splitPlate([0, length], maxStock(size), centers)) {
        const [start, end] = [from === 0, to === length];
        const point = (along: number, z: number): Point => [along, z];
        const outline = [
          ...(start ? [point(from, bottom + cut), point(from + cut, bottom)] : [point(from, bottom)]),
          ...(end ? [point(to - cut, bottom), point(to, bottom + cut)] : [point(to, bottom)]),
          point(to, top),
          point(from, top),
        ];
        const ends = start && end ? 'Both ends' : start || end ? 'The outer end' : null;
        const note = ends && `${ends} cut 45° across the bottom, ${formatInches(cut)} up and in, so the shed drags without digging in.`;
        // The plane's run is along x, so the skid extrudes along x × up, toward -y, from its far face.
        const base = { id: foundationIds('SK'), assembly: 'foundation', role: 'skid', size, ...(note && { note }) } as const;
        members.push({ ...planeMember(base, { origin: [0, y + across / 2, 0], h: X }, outline, [1, 0], across), treated: true });
      }
    }
    return { members, solids };
  }

  // Piers under each girder: one flush with each end, the rest evenly spaced at most maxSpacing.
  const pier = foundation.pier;
  const { thick: plyThick, width: girderDepth } = LUMBER[pier.girder];
  const girderWidth = pier.girderPlies * plyThick;
  const girderBottom = joistBottom - girderDepth;
  const radius = pier.diameter / 2;
  const bays = Math.ceil((length - 2 * radius) / pier.maxSpacing);
  const pierXs = Array.from({ length: bays + 1 }, (_, index) => radius + (index * (length - 2 * radius)) / bays);
  const postLength = pier.post === 'none' ? 0 : pier.postLength;
  const postSide = pier.post === 'none' ? 0 : LUMBER[pier.post].width;
  const pierTop = girderBottom - postLength;
  // The widest of girder, post, and pier sets the line spacing, so nothing passes the floor edge.
  for (const y of lines(pier.girderCount, Math.max(girderWidth, postSide, pier.diameter))) {
    for (let ply = 0; ply < pier.girderPlies; ply++) {
      for (const [from, to] of splitPlate([0, length], maxStock(pier.girder), pierXs)) {
        const origin: Vec3 = [from, y - girderWidth / 2 + ply * plyThick, girderBottom];
        members.push(board('foundation', foundationIds('GD'), 'girder', pier.girder, true, to - from, origin, { length: X, width: UP, thick: Y }));
      }
    }
    for (const x of pierXs) {
      if (pier.post !== 'none') {
        const origin: Vec3 = [x - postSide / 2, y - postSide / 2, pierTop];
        members.push(board('foundation', foundationIds('PS'), 'post', pier.post, true, postLength, origin, { length: UP, width: X, thick: Y }));
      }
      solids.push({
        id: foundationIds('PR'),
        label: `Pier, ${pier.diameter}" diameter`,
        layer: 'foundation',
        material: 'concrete',
        shape: { kind: 'cylinder', base: [x, y, pierTop - pier.aboveGrade - pier.depth], radius, height: pier.aboveGrade + pier.depth },
      });
    }
  }
  return { members, solids };
}

/** Ground level: the slab top, the skid bottoms, or the pier tops less their height above grade. */
export function gradeOf(config: ShedConfig, framing: readonly Member[]): number {
  if (config.foundation.type === 'slab') return 0;
  const lowest = Math.min(...framing.filter(({ assembly }) => assembly === 'foundation').flatMap((member) => corners(member).map(([, , z]) => z)));
  return config.foundation.type === 'pier' ? lowest - config.foundation.pier.aboveGrade : lowest;
}
