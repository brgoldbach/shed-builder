import { describe, expect, it } from 'vitest';
import { LUMBER } from '../src/core/catalog';
import { shedSchema } from '../src/core/config';
import { frameWalls, studLengths, wallTops } from '../src/core/gen/walls';
import type { Member, Role } from '../src/core/member';

// 8 x 10 ft, 2x4 at 16 in o.c., 92-5/8 in studs, cap plate, 4-stud corners.
const base = { schemaVersion: 1, width: 96, length: 120 };
const build = (overrides: object = {}) => frameWalls(shedSchema.parse({ ...base, ...overrides })).members;

const wall = (members: Member[], name: string) => members.filter((member) => member.assembly === `wall.${name}`);
const ofRole = (members: Member[], ...roles: Role[]) => members.filter((member) => roles.includes(member.role));
const lengths = (members: Member[]) => members.map((member) => member.length);

function corners(member: Member): number[][] {
  const { width, thick } = LUMBER[member.size];
  const result: number[][] = [];
  for (const along of [0, member.length])
    for (const across of [0, width])
      for (const through of [0, thick])
        result.push(
          [0, 1, 2].map(
            (axis) =>
              member.origin[axis] +
              member.axes.length[axis] * along +
              member.axes.width[axis] * across +
              member.axes.thick[axis] * through,
          ),
        );
  return result;
}

describe('frameWalls, 8x10 with 4-stud corners', () => {
  const members = build();

  it('runs the gable-end walls through: 6 corner studs, 5 layout studs, full-length plates, short cap', () => {
    const left = wall(members, 'left');
    expect(ofRole(left, 'corner')).toHaveLength(6);
    expect(ofRole(left, 'stud')).toHaveLength(5);
    expect(lengths(ofRole(left, 'plate.bottom', 'plate.top'))).toEqual([96, 96]);
    expect(lengths(ofRole(left, 'plate.cap'))).toEqual([89]);
  });

  it('fits the eave walls between the end walls; their caps lap to the corners', () => {
    const front = wall(members, 'front');
    expect(ofRole(front, 'corner')).toHaveLength(2);
    expect(ofRole(front, 'stud')).toHaveLength(7);
    expect(lengths(ofRole(front, 'plate.bottom', 'plate.top'))).toEqual([113, 113]);
    expect(lengths(ofRole(front, 'plate.cap'))).toEqual([120]);
  });

  it('puts layout stud centers on 16 in multiples from each wall’s left corner', () => {
    const centers = (name: string, axis: 0 | 1, sign: number) =>
      ofRole(wall(members, name), 'stud').map((stud) => corners(stud).reduce((sum, point) => sum + point[axis], 0) / 8 * sign);
    expect(centers('front', 0, 1)).toEqual([16, 32, 48, 64, 80, 96, 112]);
    expect(centers('back', 0, -1).map((x) => x + 120)).toEqual([16, 32, 48, 64, 80, 96, 112]);
    expect(centers('left', 1, -1).map((y) => y + 96)).toEqual([16, 32, 48, 64, 80]);
  });

  it('builds each end-wall corner post from 3 face-nailed studs', () => {
    const posts = ofRole(wall(members, 'right'), 'corner').map((stud) => stud.origin[1]);
    expect(posts.sort((first, second) => first - second)).toEqual([0, 1.5, 3, 91.5, 93, 94.5]);
  });

  it('keeps every member inside the footprint and the wall height', () => {
    const top = 1.5 + 92.625 + 3;
    for (const point of members.flatMap(corners)) {
      expect(point[0]).toBeGreaterThanOrEqual(-1e-9);
      expect(point[0]).toBeLessThanOrEqual(120 + 1e-9);
      expect(point[1]).toBeGreaterThanOrEqual(-1e-9);
      expect(point[1]).toBeLessThanOrEqual(96 + 1e-9);
      expect(point[2]).toBeGreaterThanOrEqual(-1e-9);
      expect(point[2]).toBeLessThanOrEqual(top + 1e-9);
    }
  });
});

describe('frameWalls options', () => {
  it('builds a 3-stud corner from an end stud and a backing stud at the wall depth', () => {
    const posts = ofRole(wall(build({ walls: { corner: 'three-stud' } }), 'right'), 'corner').map((stud) => stud.origin[1]);
    expect(posts.sort((first, second) => first - second)).toEqual([0, 3.5, 91, 94.5]);
  });

  it('builds a California corner from an end stud and a flat backing stud', () => {
    const right = wall(build({ walls: { corner: 'california' } }), 'right');
    const flat = ofRole(right, 'corner').filter((stud) => stud.axes.thick[0] !== 0);
    expect(ofRole(right, 'corner')).toHaveLength(4);
    expect(flat).toHaveLength(2);
    expect(flat[0].origin).toEqual([118, 1.5, 1.5]);
  });

  it('builds a 2-stud corner from the end studs only', () => {
    expect(ofRole(wall(build({ walls: { corner: 'two-stud' } }), 'right'), 'corner')).toHaveLength(2);
  });

  it('puts the corner posts on the eave walls when chosen', () => {
    const members = build({ walls: { through: 'eaves' } });
    expect(ofRole(wall(members, 'front'), 'corner')).toHaveLength(6);
    expect(lengths(ofRole(wall(members, 'front'), 'plate.bottom', 'plate.cap'))).toEqual([120, 113]);
    expect(lengths(ofRole(wall(members, 'left'), 'plate.bottom', 'plate.cap'))).toEqual([89, 96]);
  });

  it('lays a treated mud sill on a slab, with the bottom plate on top', () => {
    const members = build({ foundation: { type: 'slab' } });
    const sills = ofRole(members, 'plate.sill');
    expect(sills).toHaveLength(4);
    expect(sills.every((sill) => sill.treated && sill.origin[2] === 0)).toBe(true);
    const plates = ofRole(members, 'plate.bottom');
    expect(plates).toHaveLength(4);
    expect(plates.every((plate) => !plate.treated && plate.origin[2] === 1.5)).toBe(true);
    // Studs stand on the bottom plate at 3 in and stay 92-5/8 precuts, so the wall grows by the
    // sill: 92-5/8 + 4 x 1-1/2 = 98-5/8.
    const studs = ofRole(members, 'stud');
    expect(studs.every((stud) => stud.origin[2] === 3 && stud.length === 92.625)).toBe(true);
    expect(wallTops(shedSchema.parse({ ...base, foundation: { type: 'slab' } })).front).toBe(98.625);
  });

  it('holds a custom wall height over a mud sill', () => {
    // 97-1/8 - 3 x 1-1/2 plates - 1-1/2 sill = 91-1/8.
    const custom = { foundation: { type: 'slab' }, studHeight: 'custom', wallHeight: 97.125 };
    expect(ofRole(build(custom), 'stud').every((stud) => stud.length === 91.125)).toBe(true);
    expect(wallTops(shedSchema.parse({ ...base, ...custom })).front).toBe(97.125);
  });

  it('stands 9 and 10 ft walls on their precuts', () => {
    expect(studLengths(shedSchema.parse({ ...base, studHeight: 104.625 })).front).toBe(104.625);
    expect(wallTops(shedSchema.parse({ ...base, studHeight: 116.625 })).front).toBe(121.125); // + 3 plates
  });

  it('uses the treated mud sill as the bottom plate when the mud sill option is off', () => {
    const members = build({ foundation: { type: 'slab' }, walls: { mudSill: 'none' } });
    expect(ofRole(members, 'plate.sill')).toHaveLength(4);
    expect(ofRole(members, 'plate.bottom')).toHaveLength(0);
    expect(ofRole(members, 'stud').every((stud) => stud.origin[2] === 1.5)).toBe(true);
  });

  it('ignores the mud sill option on a framed floor', () => {
    expect(ofRole(build({ walls: { mudSill: 'match' } }), 'plate.sill')).toHaveLength(0);
  });

  it('lays a mud sill of the chosen size, flush with the outside face', () => {
    const members = build({ foundation: { type: 'slab' }, walls: { mudSill: '2x6' } });
    const sills = ofRole(members, 'plate.sill');
    expect(sills.every((sill) => sill.size === '2x6')).toBe(true);
    // Same 1-1/2 in thickness, so the studs do not change.
    expect(ofRole(members, 'stud').every((stud) => stud.length === 92.625)).toBe(true);
  });

  it('warns when the mud sill is narrower than the walls', () => {
    const { warnings } = frameWalls(
      shedSchema.parse({ ...base, foundation: { type: 'slab' }, walls: { stud: '2x6', mudSill: '2x4' } }),
    );
    expect(warnings).toEqual([{ source: 'Walls', message: 'The 2x4 mud sill is narrower than the 2x6 walls.' }]);
  });

  it('omits the cap plate when disabled', () => {
    expect(ofRole(build({ walls: { capPlate: false } }), 'plate.cap')).toHaveLength(0);
  });

  it('splices a 24 ft plate on a stud, with the cap splice 24 in or more from the top splice', () => {
    const right = wall(build({ width: 288, catalog: { maxLength: 240 } }), 'right');
    expect(lengths(ofRole(right, 'plate.top'))).toEqual([240, 48]);
    // Cap runs 3-1/2 to 284-1/2. The 224 stud is 16 in from the top splice, so the splice drops to 208.
    expect(lengths(ofRole(right, 'plate.cap'))).toEqual([204.5, 76.5]);
  });

  it('splices at the longest stock, 16 ft by default', () => {
    const right = wall(build({ width: 288 }), 'right');
    expect(lengths(ofRole(right, 'plate.top'))).toEqual([192, 96]);
    // Cap from 3-1/2: the 192 and 176 studs are within 24 in of the top splice, so it drops to 160.
    expect(lengths(ofRole(right, 'plate.cap'))).toEqual([156.5, 124.5]);
  });
});

describe('lean-to walls', () => {
  // 10 x 12 ft, 3/12, high side front.
  const config = shedSchema.parse({
    schemaVersion: 1,
    width: 120,
    length: 144,
    roof: { style: 'lean-to', pitch: 3, highSide: 'front' },
  });

  it('raises the high wall by the rise between the bearing lines', () => {
    // 92-5/8 + 3/12 x (120 - 3-1/2) = 121-3/4
    expect(studLengths(config)).toEqual({ front: 121.75, back: 92.625, left: 92.625, right: 92.625 });
  });

  it('runs the eave walls through', () => {
    const members = frameWalls(config).members;
    expect(lengths(ofRole(wall(members, 'back'), 'plate.bottom'))).toEqual([144]);
    expect(lengths(ofRole(wall(members, 'left'), 'plate.bottom'))).toEqual([113]);
  });

  it('laps caps only at the level corners', () => {
    const members = frameWalls(config).members;
    expect(lengths(ofRole(wall(members, 'front'), 'plate.cap'))).toEqual([144]);
    expect(lengths(ofRole(wall(members, 'back'), 'plate.cap'))).toEqual([137]);
    expect(lengths(ofRole(wall(members, 'left'), 'plate.cap'))).toEqual([116.5]);
    expect(lengths(ofRole(wall(members, 'right'), 'plate.cap'))).toEqual([116.5]);
  });
});

describe('anchor bolts and stud heights', () => {
  // On a slab, a 36 in door placed `at` from the left end of the front wall, which starts inside the
  // left end wall at 3-1/2.
  const door = { name: 'door', kind: 'door', width: 36, height: 80 };
  const slab = (at: number) =>
    frameWalls(shedSchema.parse({ ...base, foundation: { type: 'slab' }, openingTypes: [door], openings: [{ type: 'door', wall: 'front', sill: 0, along: 'left', at: [at] }] }));
  const frontBolts = (at: number) =>
    slab(at)
      .solids.filter(({ label, shape }) => label.startsWith('Anchor bolt') && shape.kind === 'cylinder' && shape.base[1] < 10 && shape.base[0] < at)
      .map(({ shape }) => (shape.kind === 'cylinder' ? shape.base[0] : NaN));

  it('sets two bolts in a short plate part, a quarter of its length in from each end (IRC R403.1.6)', () => {
    // 3-1/2 to 22: 18-1/2 in long, bolts 4-5/8 in from each end.
    expect(frontBolts(22)).toEqual([8.125, 17.375]);
    expect(slab(22).warnings).toEqual([]);
  });

  it('sets one bolt, and warns, in a plate part too short for two', () => {
    // 3-1/2 to 12: 8-1/2 in, under 3 × 3-1/2.
    expect(frontBolts(12)).toEqual([7.75]);
    expect(slab(12).warnings.map(({ message }) => message)).toEqual([
      'Front wall: the 8-1/2" plate part from 3-1/2" has room for one anchor bolt, not two (IRC R403.1.6). Add a strap or hold-down there.',
    ]);
  });

  it('warns about studs taller than IRC Table R602.3(5) allows: 10 ft in the bearing eave walls', () => {
    // 140 in to the plate tops less 4-1/2 in of plates: 135-1/2 in studs, under the 14 ft of the end walls.
    const { warnings } = frameWalls(shedSchema.parse({ ...base, studHeight: 'custom', wallHeight: 140 }));
    expect(warnings.map(({ message }) => message.split(':')[0])).toEqual(['Front wall', 'Back wall']);
    expect(warnings[0].message).toBe(
      'Front wall: its 135-1/2" 2x4 studs are taller than the 10 ft that IRC Table R602.3(5) allows in a bearing wall. Have the wall engineered, or meet an exception of IRC R602.3.1.',
    );
  });
});
