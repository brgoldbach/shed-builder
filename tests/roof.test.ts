import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { frameRoof } from '../src/core/gen/roof';
import { corners, type Member, type Role } from '../src/core/member';

// 8 x 10 ft, 2x4 walls with 92-5/8 in studs and a cap plate: plate tops at 97-1/8 in.
// Gable 6/12, 2x6 rafters at 24 in, 2x8 ridge, 12 in eaves, 8 in rakes, 2x6 fascia.
const gableRoof = { style: 'gable', pitch: 6, rafter: '2x6', oc: 24, ridge: '2x8' };
const roofOf = (roof: object, overrides: object = {}) =>
  frameRoof(shedSchema.parse({ schemaVersion: 1, width: 96, length: 120, roof, ...overrides }));

const ofRole = (members: Member[], role: Role) => members.filter((member) => member.role === role);
const lengths = (members: Member[]) => members.map((member) => member.length).sort((first, second) => first - second);

// A profile's corners in building (y, z), at the piece's near face.
function sectionCorners(member: Member): number[][] {
  return member.profile!.points.map(([along, across]) => [1, 2].map(
    (axis) => member.origin[axis] + member.axes.length[axis] * along + member.axes.width[axis] * across,
  ));
}

const hasCorner = (corners: number[][], y: number, z: number) =>
  corners.some(([cornerY, cornerZ]) => Math.abs(cornerY - y) < 1e-9 && Math.abs(cornerZ - z) < 1e-9);

const cross = (first: readonly number[], second: readonly number[]) => [
  first[1] * second[2] - first[2] * second[1],
  first[2] * second[0] - first[0] * second[2],
  first[0] * second[1] - first[1] * second[0],
];

describe('gable roof', () => {
  const { members, warnings } = roofOf(gableRoof);
  const rafters = ofRole(members, 'rafter');

  it('frames a rafter pair at each gable end and on 24 in centers', () => {
    expect(rafters).toHaveLength(12); // x = 0, 24, 48, 72, 96, 118-1/2 on each side
    expect(warnings).toEqual([]);
  });

  it('cuts the rafter long point to long point', () => {
    // Run from the tail to the ridge face: 12 + 48 - 3/4 = 59-1/4. 59-1/4 / cos + 5-1/2 x tan = 68.99.
    for (const rafter of rafters) expect(rafter.length).toBeCloseTo(68.9937, 3);
  });

  it('seats the birdsmouth on the full plate, 1-3/4 in deep, heel at the outside face', () => {
    expect(rafters[0].note).toBe(
      'Plumb cut 26.6° at the ridge. Birdsmouth: heel line 52-13/16" from the ridge long point on the top edge; ' +
        'seat 3-1/2", heel 1-3/4". Tail 13-7/16" past the heel line on the top edge, plumb cut.',
    );
    const front = sectionCorners(rafters.find((rafter) => rafter.axes.length[1] > 0)!);
    expect(hasCorner(front, 0, 97.125)).toBe(true);
    expect(hasCorner(front, 3.5, 97.125)).toBe(true);
  });

  it('runs the ridge board past both rakes, its top level with the rafter plumb cuts', () => {
    const [ridge] = ofRole(members, 'ridge');
    expect(ridge.length).toBe(136);
    // Plate 97-1/8 + 1/2 x (47-1/4 - 3-1/2) + 5-1/2 / cos = 125.149; minus the 7-1/4 ridge.
    expect(ridge.origin[2]).toBeCloseTo(117.899, 3);
  });

  it('builds a rake ladder that goes up in one piece: fly rafter, 5 in lookouts, and a rail', () => {
    expect(ofRole(members, 'rafter.fly')).toHaveLength(4);
    // The rail: a 2x4 on edge against the gable-end rafter's outside face (x -1-1/2 to 0), tops flush.
    // Tail to ridge face along the top edge: 59-1/4 / cos, plus the 1-3/4 in plumb tail long point.
    const rails = ofRole(members, 'rail.ladder');
    expect(rails).toHaveLength(4);
    const [left] = rails;
    expect([Math.min(...corners(left).map(([x]) => x)), Math.max(...corners(left).map(([x]) => x))]).toEqual([-1.5, 0]);
    const zs = (member: Member, y: number) => corners(member).filter(([, cornerY]) => Math.abs(cornerY - y) < 1e-9).map(([, , z]) => z);
    const [rafter] = ofRole(members, 'rafter');
    expect(Math.max(...zs(left, 47.25))).toBeCloseTo(Math.max(...zs(rafter, 47.25)), 9);
    expect(Math.max(...zs(left, 47.25)) - Math.min(...zs(left, 47.25))).toBeCloseTo(3.5 * Math.hypot(1, 0.5), 9);
    expect(left.note).toMatch(/face-nail this rail to the gable-end rafter, tops flush\.$/);
    // Lookouts fit between the rail and the fly rafter: 8 - 2 x 1-1/2 = 5. Reach 59-1/4 / cos - 1-1/2
    // - 3-1/2 x 1/2 = 62.99: 3 gaps of 21.0 in, at most 24 in. The fascia ties the tail and the ridge
    // board takes the top rung, so 2 lookouts per ladder, 4 ladders.
    const lookouts = ofRole(members, 'lookout');
    expect(lengths(lookouts)).toEqual(new Array(8).fill(5));
    // On the front slope the highest lookout stops one gap short of the ridge face at 47-1/4, and the
    // lowest one gap up from the tail.
    const cos = 2 / Math.sqrt(5);
    const gap = ((59.25 / cos - 3.25) / 3) * cos;
    const front = lookouts.flatMap((lookout) => corners(lookout).map(([, y]) => y)).filter((y) => y < 48);
    expect(Math.max(...front)).toBeCloseTo(47.25 - gap, 9);
    expect(Math.min(...front)).toBeCloseTo(-12 + gap, 9);
  });

  it('builds the ladder on the gable-end rafter when chosen, with no separate rail', () => {
    const { members } = roofOf({ ...gableRoof, rakeLadder: { onEndRafter: true } });
    expect(ofRole(members, 'rail.ladder')).toHaveLength(0);
    // Lookouts run from the fly rafter to the gable-end rafter: 8 - 1-1/2 = 6-1/2.
    expect(lengths(ofRole(members, 'lookout'))).toEqual(new Array(8).fill(6.5));
    const ladderNote = 'Build the rake ladder on this rafter on the ground (lookouts and fly rafter), then set it in place.';
    const ends = ofRole(members, 'rafter').filter(({ note }) => note?.endsWith(ladderNote));
    // The gable-end rafters: x 0 and 118-1/2 on the front slope; the back slope's planes start 1-1/2 further.
    expect(ends.map(({ origin }) => origin[0])).toEqual([0, 118.5, 1.5, 120]);
  });

  it('puts a lookout at the fascia when chosen', () => {
    const { members } = roofOf({ ...gableRoof, rakeLadder: { fasciaLookouts: true } });
    expect(ofRole(members, 'lookout')).toHaveLength(12);
  });

  it('meets the ladders at the ridge line when the ridge board stops at the gable framing', () => {
    const { members } = roofOf({ ...gableRoof, rakeLadder: { ridgeExtends: false } });
    expect(lengths(ofRole(members, 'ridge'))).toEqual([120]);
    // Fly rafters and rails run to the ridge line at 48 instead of the ridge face at 47-1/4.
    const ys = (member: Member) => corners(member).map(([, y]) => y);
    const [fly] = ofRole(members, 'rafter.fly');
    expect(Math.max(...ys(fly))).toBeCloseTo(48, 9);
    // A plumb block at the peak of each ladder, 1-1/2 in thick, against the one on the other slope.
    const blocks = ofRole(members, 'lookout').filter(({ note }) => note === 'Plumb, at the peak, against the block on the other slope.');
    expect(blocks.map((block) => [Math.min(...ys(block)), Math.max(...ys(block))])).toEqual([
      [46.5, 48],
      [46.5, 48],
      [48, 49.5],
      [48, 49.5],
    ]);
    expect(ofRole(members, 'lookout')).toHaveLength(12);
  });

  it('hangs fascia on both eaves, plumb, the full ridge length', () => {
    const fascia = ofRole(members, 'fascia');
    expect(lengths(fascia)).toEqual([136, 136]);
    expect(fascia[0].axes.width).toEqual([0, 0, -1]);
  });

  it('frames each gable end with a top plate under each end rafter', () => {
    const plates = ofRole(members.filter((member) => member.assembly === 'gable.left'), 'plate.gable');
    expect(plates).toHaveLength(2);
    // Top edge from the seat end (3-1/2) to the ridge post face (47-1/4): 43-3/4 / cos = 48.91.
    for (const plate of plates) expect(plate.length).toBeCloseTo(48.9143, 3);
    expect(plates[0].note).toBe('Level cut on the wall plate. Plumb cut 26.6° at the ridge post.');
  });

  it('cuts gable studs on layout to the top plate, and adds a ridge post', () => {
    const left = members.filter((member) => member.assembly === 'gable.left');
    // Layout 16, 32, 64, 80 (48 is the post). Rafter underside 6-5/8 and 14-5/8 above the wall
    // plate, less the plate's 1-1/2 / cos = 1.677 plumb thickness. Post 117.899 - 97-1/8.
    const studs = lengths(ofRole(left, 'stud.gable'));
    [4.948, 4.948, 12.948, 12.948].forEach((expected, index) => expect(studs[index]).toBeCloseTo(expected, 3));
    expect(ofRole(left, 'post.ridge')[0].length).toBeCloseTo(20.774, 3);
  });

  it('gives every angle-cut piece right-handed axes', () => {
    for (const member of members.filter((candidate) => candidate.profile)) {
      cross(member.axes.length, member.axes.width).forEach((value, axis) =>
        expect(value).toBeCloseTo(member.axes.thick[axis], 9),
      );
    }
  });
});

describe('gable roof options', () => {
  it('drops the rake ladder when there is no rake overhang', () => {
    const { members } = roofOf({ ...gableRoof, rakeOverhang: 0 });
    expect(ofRole(members, 'rafter.fly')).toHaveLength(0);
    expect(ofRole(members, 'lookout')).toHaveLength(0);
    expect(ofRole(members, 'ridge')[0].length).toBe(120);
  });

  it('tilts the fascia square to the roof on square-cut tails', () => {
    const { members } = roofOf({ ...gableRoof, tailCut: 'square' });
    const [fascia] = ofRole(members, 'fascia');
    expect(fascia.axes.width[2]).toBeCloseTo(-Math.cos(Math.atan(0.5)), 9);
  });

  it('shortens the seat to keep the notch within 1/3 of the rafter depth', () => {
    // 2x4 rafter at 12/12: 3-1/2 / 3 / sin 45° = 1.65, rounded down to 1-5/8.
    const { members } = roofOf({ ...gableRoof, rafter: '2x4', ridge: '2x6', pitch: 12 });
    expect(ofRole(members, 'rafter')[0].note).toContain('seat 1-5/8"');
  });

  it('warns when even a 1-1/2 in seat cuts too deep, or the ridge is too shallow', () => {
    expect(roofOf({ ...gableRoof, rafter: '2x4', pitch: 18 }).warnings[0].message).toContain('deeper than 1/3');
    expect(roofOf({ ...gableRoof, ridge: '2x6' }).warnings[0].message).toContain('shallower than the rafter plumb cut');
  });
});

describe('lean-to roof', () => {
  // 10 x 12 ft, 3/12, 2x8 rafters at 16 in, high side front: front wall top 97-1/8 + 29-1/8 = 126-1/4.
  const { members } = frameRoof(
    shedSchema.parse({
      schemaVersion: 1,
      width: 120,
      length: 144,
      roof: { style: 'lean-to', pitch: 3, rafter: '2x8', oc: 16, highSide: 'front' },
    }),
  );
  const rafters = ofRole(members, 'rafter');

  it('frames single-slope rafters with no ridge', () => {
    expect(rafters).toHaveLength(10);
    expect(ofRole(members, 'ridge')).toHaveLength(0);
    // 144 / cos + 7-1/4 x tan = 150.24
    expect(rafters[0].length).toBeCloseTo(150.244, 3);
  });

  it('seats on the low wall at its outside face and on the high wall at its inside face', () => {
    const corners = sectionCorners(rafters[0]);
    expect(hasCorner(corners, 120, 97.125)).toBe(true); // low (back) wall, outside face
    expect(hasCorner(corners, 3.5, 126.25)).toBe(true); // high (front) wall, inside face
  });

  it('hangs fascia on both eaves', () => {
    expect(ofRole(members, 'fascia')).toHaveLength(2);
  });

  it('runs one top plate per end wall, plumb cut at the high wall', () => {
    const plates = ofRole(members, 'plate.gable');
    expect(plates).toHaveLength(2);
    expect(plates[0].note).toBe('Level cut on the wall plate. Plumb cut 14.0° at the high wall.');
  });
});
