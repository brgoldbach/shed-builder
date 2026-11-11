import { LUMBER, SHEETS, stockFor, type LumberSize } from '../catalog';
import type { ShedConfig } from '../config';
import { corners, type Assembly, type Member, type Role, type Solid, type Vec3 } from '../member';
import { continuedDecks } from './deck';
import { idMaker, planeMember } from './section';
import { skidOutline, supportLines } from './supports';
import { splitPlate } from './walls';

const PLY = 1.5; // thickness of 2x lumber
const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const UP: Vec3 = [0, 0, 1];
const NEAR = 0.01;

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

  // Skids or girders run left to right under the joists. Under a gable-end deck that continues
  // them, a run goes on out to the deck's outer edge; the deck joists there give more splice points.
  const lines = supportLines(config)!;
  const decks = continuedDecks(config);
  const runOf = (y: number): [number, number] => {
    const reach = (side: 'left' | 'right') =>
      Math.max(0, ...decks.filter((deck) => deck.side === side && y > deck.ys[0] - NEAR && y < deck.ys[1] + NEAR).map(({ reach }) => reach));
    return [0 - reach('left'), length + reach('right')];
  };
  const deckCenters = decks.flatMap(({ side, reach, oc }) =>
    Array.from({ length: Math.floor(reach / oc) }, (_, index) => (side === 'left' ? -(index + 1) * oc : length + (index + 1) * oc)),
  );

  if (foundation.type === 'skid') {
    const { size } = foundation.skid;
    // On edge: the wider face stands. A splice in a long run stays square.
    const height = LUMBER[size].width;
    for (const y of lines.ys) {
      const [x0, x1] = runOf(y);
      for (const [from, to] of splitPlate([x0, x1], maxStock(size), [...centers, ...deckCenters])) {
        const { outline, note } = skidOutline(from, to, joistBottom - height, height, from === x0, to === x1);
        // The plane's run is along x, so the skid extrudes along x × up, toward -y, from its far face.
        const base = { id: foundationIds('SK'), assembly: 'foundation', role: 'skid', size, ...(note && { note }) } as const;
        members.push({ ...planeMember(base, { origin: [0, y + lines.across / 2, 0], h: X }, outline, [1, 0], lines.across), treated: true });
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
  // Along each run: one pier flush with each end, the rest evenly spaced at most maxSpacing.
  const piersOver = ([x0, x1]: [number, number]) => {
    const bays = Math.ceil((x1 - x0 - 2 * radius) / pier.maxSpacing);
    return Array.from({ length: bays + 1 }, (_, index) => x0 + radius + (index * (x1 - x0 - 2 * radius)) / bays);
  };
  const postLength = pier.post === 'none' ? 0 : pier.postLength;
  const postSide = pier.post === 'none' ? 0 : LUMBER[pier.post].width;
  const pierTop = girderBottom - postLength;
  for (const y of lines.ys) {
    const run = runOf(y);
    const pierXs = piersOver(run);
    for (let ply = 0; ply < pier.girderPlies; ply++) {
      for (const [from, to] of splitPlate(run, maxStock(pier.girder), pierXs)) {
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
