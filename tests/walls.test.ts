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

  it('frames the front wall: 6 corner studs, 7 layout studs, full-length plates, short cap', () => {
    const front = wall(members, 'front');
    expect(ofRole(front, 'corner')).toHaveLength(6);
    expect(ofRole(front, 'stud')).toHaveLength(7);
    expect(lengths(ofRole(front, 'plate.bottom', 'plate.top'))).toEqual([120, 120]);
    expect(lengths(ofRole(front, 'plate.cap'))).toEqual([113]);
  });

  it('fits the end walls between the eave walls; their caps lap to the corners', () => {
    const left = wall(members, 'left');
    expect(ofRole(left, 'corner')).toHaveLength(2);
    expect(ofRole(left, 'stud')).toHaveLength(5);
    expect(lengths(ofRole(left, 'plate.bottom', 'plate.top'))).toEqual([89, 89]);
    expect(lengths(ofRole(left, 'plate.cap'))).toEqual([96]);
  });

  it('puts layout stud centers on 16 in multiples from each wall’s left corner', () => {
    const centers = (name: string, axis: 0 | 1, sign: number) =>
      ofRole(wall(members, name), 'stud').map((stud) => corners(stud).reduce((sum, point) => sum + point[axis], 0) / 8 * sign);
    expect(centers('front', 0, 1)).toEqual([16, 32, 48, 64, 80, 96, 112]);
    expect(centers('back', 0, -1).map((x) => x + 120)).toEqual([16, 32, 48, 64, 80, 96, 112]);
    expect(centers('left', 1, -1).map((y) => y + 96)).toEqual([16, 32, 48, 64, 80]);
  });

  it('builds each eave-wall corner post from 3 face-nailed studs', () => {
    const posts = ofRole(wall(members, 'front'), 'corner').map((stud) => stud.origin[0]);
    expect(posts.sort((first, second) => first - second)).toEqual([0, 1.5, 3, 115.5, 117, 118.5]);
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
    const posts = ofRole(wall(build({ walls: { corner: 'three-stud' } }), 'front'), 'corner').map((stud) => stud.origin[0]);
    expect(posts.sort((first, second) => first - second)).toEqual([0, 3.5, 115, 118.5]);
  });

  it('builds a California corner from an end stud and a flat backing stud', () => {
    const front = wall(build({ walls: { corner: 'california' } }), 'front');
    const flat = ofRole(front, 'corner').filter((stud) => stud.axes.thick[1] !== 0);
    expect(ofRole(front, 'corner')).toHaveLength(4);
    expect(flat).toHaveLength(2);
    expect(flat[0].origin).toEqual([1.5, 2, 1.5]);
  });

  it('builds a 2-stud corner from the end studs only', () => {
    expect(ofRole(wall(build({ walls: { corner: 'two-stud' } }), 'front'), 'corner')).toHaveLength(2);
  });

  it('lays a treated mud sill on a slab, with the bottom plate on top', () => {
    const members = build({ foundation: { type: 'slab' } });
    const sills = ofRole(members, 'plate.sill');
    expect(sills).toHaveLength(4);
    expect(sills.every((sill) => sill.treated && sill.origin[2] === 0)).toBe(true);
    const plates = ofRole(members, 'plate.bottom');
    expect(plates).toHaveLength(4);
    expect(plates.every((plate) => !plate.treated && plate.origin[2] === 1.5)).toBe(true);
    // Studs stand on the bottom plate at 3 in. The 97-1/8 wall height holds, so the studs are
    // 97-1/8 - 3 x 1-1/2 - 1-1/2 = 91-1/8.
    const studs = ofRole(members, 'stud');
    expect(studs.every((stud) => stud.origin[2] === 3 && stud.length === 91.125)).toBe(true);
    expect(wallTops(shedSchema.parse({ ...base, foundation: { type: 'slab' } })).front).toBe(97.125);
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
    expect(ofRole(members, 'stud').every((stud) => stud.length === 91.125)).toBe(true);
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
    const front = wall(build({ length: 288 }), 'front');
    expect(lengths(ofRole(front, 'plate.top'))).toEqual([240, 48]);
    // Cap runs 3-1/2 to 284-1/2. The 224 stud is 16 in from the top splice, so the splice drops to 208.
    expect(lengths(ofRole(front, 'plate.cap'))).toEqual([204.5, 76.5]);
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

  it('laps caps only at the level corners', () => {
    const members = frameWalls(config).members;
    expect(lengths(ofRole(wall(members, 'front'), 'plate.cap'))).toEqual([144]);
    expect(lengths(ofRole(wall(members, 'back'), 'plate.cap'))).toEqual([137]);
    expect(lengths(ofRole(wall(members, 'left'), 'plate.cap'))).toEqual([116.5]);
    expect(lengths(ofRole(wall(members, 'right'), 'plate.cap'))).toEqual([116.5]);
  });
});
