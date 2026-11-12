import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { frameRoof, gambrelBreak } from '../src/core/gen/roof';
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

  it('roofs with metal on purlins across the rafters, without sheathing', () => {
    const { members, planes } = roofOf({ ...gableRoof, roofing: 'metal' });
    // Tail (-12) to the ridge face (47-1/4) is 66.24 in along the slope, less a 3-1/2 in purlin:
    // 3 gaps of at most 24 in, so 4 purlins a side, each rake to rake (-8 to 128).
    const purlins = ofRole(members, 'purlin');
    expect(lengths(purlins)).toEqual(new Array(8).fill(136));
    expect(planes.every(({ sheathed }) => !sheathed)).toBe(true);
    // The lowest front purlin lies on the rafter tops at the tail.
    const [rafter] = ofRole(members, 'rafter');
    const lowest = purlins.reduce((low, purlin) => (purlin.origin[1] < low.origin[1] ? purlin : low));
    expect(lowest.origin[2]).toBeCloseTo(Math.max(...corners(rafter).filter(([, y]) => Math.abs(y + 12) < 1e-9).map(([, , z]) => z)), 9);
  });

  it('lays metal purlins over the sheathing when chosen', () => {
    const open = roofOf({ ...gableRoof, roofing: 'metal' }).members;
    const { members, planes } = roofOf({ ...gableRoof, roofing: 'metal-over-sheathing' });
    expect(planes.every(({ sheathed }) => sheathed)).toBe(true);
    // Raised 7/16 in square to the roof: 7/16 x cos up, 7/16 x sin toward the eave.
    const cos = 2 / Math.sqrt(5);
    const [low, high] = [ofRole(open, 'purlin')[0], ofRole(members, 'purlin')[0]];
    expect(high.origin[2] - low.origin[2]).toBeCloseTo(0.4375 * cos, 9);
    expect(high.note).toBe('Over the roof sheathing: fasten through it into the rafters.');
  });

  it('builds the gable ends as panels on their own bottom plates when chosen', () => {
    const gableStuds = (members: Member[]) => members.filter((member) => member.assembly === 'gable.left' && member.role === 'stud.gable');
    const { members } = roofOf({ ...gableRoof, gablePanel: true });
    const left = members.filter((member) => member.assembly === 'gable.left');
    // On the end wall's top at 97-1/8, from where the end rafter's underside clears it: the 3-1/2 in
    // seat plus 1-1/2 / (6/12), 6-1/2 in from each wall face.
    const [plate] = ofRole(left, 'plate.bottom');
    const ys = corners(plate).map(([, y]) => y);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([6.5, 89.5]);
    expect(Math.min(...corners(plate).map(([, , z]) => z))).toBe(97.125);
    expect(ofRole(left, 'plate.gable')[0].note).toBe('Level cut on the bottom plate. Plumb cut 26.6° at the ridge post.');
    // The gable studs stand 1-1/2 in higher. The two shortest, 3.45 in now, drop under the 3 in
    // minimum and are left out.
    const longest = (studs: Member[]) => Math.max(...studs.map(({ length }) => length));
    expect(longest(gableStuds(members))).toBeCloseTo(longest(gableStuds(roofOf(gableRoof).members)) - 1.5, 9);
    expect(gableStuds(members)).toHaveLength(gableStuds(roofOf(gableRoof).members).length - 2);
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

describe('gambrel roof', () => {
  // The 8 x 10 ft shed as above, lower slope 20/12 (59.0°), upper 6/12, break 24 in from the wall.
  // The 2x6 seat stops at 1/3 of the depth: 2-1/8.
  const config = shedSchema.parse({ schemaVersion: 1, width: 96, length: 120, roof: { style: 'gambrel', pitch: 6, gambrel: { lowerPitch: 20, breakRun: 24 } } });
  const { members, warnings, solids, planes, rafterSpans } = frameRoof(config);
  const lower = ofRole(members, 'rafter');
  const upper = ofRole(members, 'rafter.upper');
  const lowerAngle = Math.atan(20 / 12);
  // Rafter tops at the break: plate 97-1/8 + 20/12 x (24 - 2-1/8) + 5-1/2 / cos 59.0°.
  const knee = 97.125 + (20 / 12) * (24 - 2.125) + 5.5 / Math.cos(lowerAngle);
  const atMiddle = (list: Member[]) => list.find((member) => member.origin[0] === 47.25 && member.axes.length[1] > 0)!;
  const near = (corners: number[][], y: number, z: number) =>
    corners.some(([cornerY, cornerZ]) => Math.abs(cornerY - y) < 1e-6 && Math.abs(cornerZ - z) < 1e-6);

  it('frames a lower and an upper rafter at each rafter position on each side', () => {
    expect(lower).toHaveLength(12);
    expect(upper).toHaveLength(12);
    expect(warnings).toEqual([]);
  });

  it('meets the rafters at the break with one miter, top edges at the break', () => {
    const [low, high] = [sectionCorners(atMiddle(lower)), sectionCorners(atMiddle(upper))];
    expect(near(low, 24, knee)).toBe(true);
    expect(near(high, 24, knee)).toBe(true);
    // Both pieces share the miter's two points.
    expect(high.filter(([y, z]) => near(low, y, z))).toHaveLength(2);
    expect(atMiddle(lower).note).toBe(
      'Cut 16.2° from square at the break. Birdsmouth: heel line 46-5/8" from the break long point on the top edge; ' +
        'seat 2-1/8", heel 3-9/16". Tail 23-5/16" past the heel line on the top edge, plumb cut.',
    );
    expect(atMiddle(upper).note).toBe('Cut 16.2° from square at the break. Plumb cut 26.6° at the ridge.');
    // The upper rafter: break to the ridge face along its top edge, 23-1/4 x √1.25.
    expect(atMiddle(upper).length).toBeCloseTo(23.25 * Math.hypot(1, 0.5), 9);
  });

  it('runs the ridge board level with the upper plumb cuts', () => {
    const [ridge] = ofRole(members, 'ridge');
    expect(ridge.origin[2] + 7.25).toBeCloseTo(knee + 0.5 * 23.25, 9);
  });

  it('joins each pair with plywood gussets on both faces, inside only at the gable ends', () => {
    // Rafters at 0, 23-1/4, 47-1/4, 71-1/4, 95-1/4, 118-1/2: 4 x 2 + 2 faces on each side.
    expect(solids).toHaveLength(20);
    // A common pair's gusset runs straight across under the joint (5 corners); a gable-end rafter's
    // stays within the rafter depth, over the gable top plate (6 corners).
    const cornerCounts = solids.map(({ shape }) => (shape.kind === 'panel' ? shape.outline.length : 0));
    expect(cornerCounts.filter((count) => count === 5)).toHaveLength(16);
    expect(cornerCounts.filter((count) => count === 6)).toHaveLength(4);
    expect(new Set(solids.map(({ label, sheet }) => `${label} ${sheet}`))).toEqual(new Set(['Break gusset, 15/32" plywood (1/2") ply-15/32']));
    const faces = solids.flatMap(({ shape }) => (shape.kind === 'panel' ? [shape.origin[0]] : [])).sort((first, second) => first - second);
    expect(faces.slice(0, 4)).toEqual([1.5, 1.5, 23.25 - 15 / 32, 23.25 - 15 / 32]);
    expect(faces.slice(-2)).toEqual([118.5 - 15 / 32, 118.5 - 15 / 32]);
  });

  it('roofs four planes: each lower one from the fascia to the break, each upper one on to the ridge', () => {
    const cos = Math.cos(lowerAngle);
    expect(planes.map(({ width }) => width)).toEqual([
      expect.closeTo((36 + 1.5) / cos, 9),
      expect.closeTo(24 * Math.hypot(1, 0.5), 9),
      expect.closeTo((36 + 1.5) / cos, 9),
      expect.closeTo(24 * Math.hypot(1, 0.5), 9),
    ]);
    expect(planes.map(({ eaves, ridge, breakEdge }) => [eaves, ridge, breakEdge])).toEqual([
      [1, false, 'high'],
      [0, true, 'low'],
      [1, false, 'high'],
      [0, true, 'low'],
    ]);
    expect(planes[1].origin[2]).toBeCloseTo(knee, 9);
  });

  it('frames each gable end with two top plates a side, mitered at the break, and studs cut to them', () => {
    const plates = ofRole(members, 'plate.gable');
    expect(plates).toHaveLength(8);
    expect(new Set(plates.map(({ note }) => note))).toEqual(
      new Set(['Level cut on the wall plate. Cut 16.2° from square at the break.', 'Cut 16.2° from square at the break. Plumb cut 26.6° at the ridge post.']),
    );
    expect(new Set(ofRole(members, 'stud.gable').map(({ note }) => note))).toEqual(new Set(['Top cut 59.0°.', 'Top cut 26.6°.']));
  });

  it('builds a rake ladder on each slope, its fly rafters and rails cut at the break', () => {
    expect(ofRole(members, 'rafter.fly')).toHaveLength(8);
    expect(ofRole(members, 'rail.ladder')).toHaveLength(8);
  });

  it('sets auto collar ties just under the break, over the gussets', () => {
    const ties = ofRole(members, 'tie.collar');
    expect(ties).toHaveLength(4);
    expect(ties.map(({ origin }) => origin[0])).toEqual([23.25, 47.25, 71.25, 95.25].map((x) => x + 1.5 + 15 / 32));
    expect(ties[0].note).toBe('Ends cut 59.0° to the roof line. Over the gussets.');
    // The tie's top is at the miter's inside corner, the lowest point of the gussets' joint.
    const top = Math.max(...corners(ties[0]).map(([, , z]) => z));
    const inside = Math.min(...sectionCorners(atMiddle(upper)).map(([, z]) => z));
    expect(top).toBeCloseTo(inside, 9);
  });

  it('checks the lower rafters to the break and the upper rafters to the ridge board', () => {
    expect(rafterSpans).toEqual([
      { member: 'Lower rafters', span: 24 - 2.125 },
      { member: 'Upper rafters', span: 47.25 - 24 },
    ]);
  });

  it('gives every angle-cut piece right-handed axes', () => {
    for (const member of members.filter((candidate) => candidate.profile)) {
      cross(member.axes.length, member.axes.width).forEach((value, axis) => expect(value).toBeCloseTo(member.axes.thick[axis], 9));
    }
  });

  it('gives the form the break it frames', () => {
    expect(gambrelBreak(config)).toEqual({ run: 24, wanted: 24, height: expect.closeTo(knee, 9) });
  });

  it('puts the auto break where the lower and upper rafters are the same length', () => {
    const auto = (pitch: number, lowerPitch: number) => gambrelBreak(shedSchema.parse({ ...config, roof: { ...config.roof, pitch, gambrel: { lowerPitch } } })).run;
    // Run along the slope: run × √(1 + (pitch / 12)²) on each side of the break.
    const slopeLength = (run: number, pitch: number) => run * Math.hypot(1, pitch / 12);
    const run = auto(6, 20);
    expect(slopeLength(run, 20)).toBeCloseTo(slopeLength(48 - run, 6), 9);
    // The classic barn, 29/12 and 5/12: a half circle, so the break is r(1 − cos 45°) in from the wall.
    expect(auto(5, 29)).toBeCloseTo(48 * (1 - Math.SQRT1_2), 1);
  });

  it('keeps the break 1 ft from the ridge line, and says so', () => {
    const { warnings: moved } = roofOf({ style: 'gambrel', gambrel: { breakRun: 40 } });
    expect(moved.map(({ message }) => message)).toEqual(['The break 40" in from the wall is within 1 ft of the ridge line. It is at 36".']);
  });

  it('takes no knee walls', () => {
    const { members: framed } = roofOf({ style: 'gambrel', loft: { enabled: true }, kneeWalls: { enabled: true } });
    expect(framed.filter(({ assembly }) => assembly.startsWith('knee'))).toEqual([]);
  });
});

describe('gambrel roof without a ridge board', () => {
  // The 8 x 10 ft gambrel above, its upper rafters butted at the peak.
  const { members, solids, rafterSpans } = roofOf({ style: 'gambrel', pitch: 6, gambrel: { lowerPitch: 20, breakRun: 24, ridgeBoard: false } });
  const upper = ofRole(members, 'rafter.upper');
  const lowerAngle = Math.atan(20 / 12);
  const peak = 97.125 + (20 / 12) * (24 - 2.125) + 5.5 / Math.cos(lowerAngle) + 0.5 * 24;

  it('meets the upper rafters at the ridge line, plumb cut, with no ridge board or ridge post', () => {
    expect(ofRole(members, 'ridge')).toEqual([]);
    expect(ofRole(members, 'post.ridge')).toEqual([]);
    const front = upper.find((member) => member.origin[0] === 47.25 && member.axes.length[1] > 0)!;
    expect(sectionCorners(front).some(([y, z]) => Math.abs(y - 48) < 1e-6 && Math.abs(z - peak) < 1e-6)).toBe(true);
    expect(front.length).toBeCloseTo(24 * Math.hypot(1, 0.5), 9);
    expect(front.note).toBe('Cut 16.2° from square at the break. Plumb cut 26.6° at the peak, against the rafter on the other side.');
  });

  it('joins each pair at the peak with a gusset on each face, inside only at the gable ends', () => {
    const peaks = solids.filter(({ label }) => label.startsWith('Peak gusset'));
    // 4 common pairs × 2 faces, and the 2 gable-end pairs inside.
    expect(peaks).toHaveLength(10);
    // Each common one spans both rafters, symmetric about the ridge line.
    const outline = peaks.find(({ shape }) => shape.kind === 'panel' && shape.outline.length === 5)!.shape;
    const ys = outline.kind === 'panel' ? outline.outline.map(([y]) => y) : [];
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(96, 9);
  });

  it('meets the gable top plates and the rake ladders at the peak', () => {
    expect(new Set(ofRole(members, 'plate.gable').map(({ note }) => note))).toContain('Cut 16.2° from square at the break. Plumb cut 26.6° at the peak.');
    expect(ofRole(members, 'lookout').filter(({ note }) => note?.startsWith('Plumb, at the peak'))).toHaveLength(4);
  });

  it('checks the upper rafters to the ridge line', () => {
    expect(rafterSpans[1]).toEqual({ member: 'Upper rafters', span: 48 - 24 });
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

describe('eave fascia and tail cuts', () => {
  const tailTopOf = (members: Member[]) =>
    Math.max(...sectionCorners(ofRole(members, 'rafter')[0]).filter(([y]) => Math.abs(y + 12) < 1e-9).map(([, z]) => z));

  it('rips a beveled fascia to the pitch with its top at the rafter top, or leaves it flush', () => {
    const { members } = roofOf({ ...gableRoof, fasciaTop: 'beveled' });
    const [fascia] = ofRole(members, 'fascia');
    expect(fascia.origin[2]).toBeCloseTo(tailTopOf(members), 9);
    expect(fascia.bevel).toBeCloseTo(0.75, 9);
    expect(fascia.note).toBe('Rip the top edge to the roof pitch, 26.6°: the outer face is 4-3/4" tall.');
    // Its outer top corner lies on the roof plane: 1-1/2 in out, 3/4 in lower.
    expect(corners(fascia).some(([, y, z]) => Math.abs(y + 13.5) < 1e-9 && Math.abs(z - (tailTopOf(members) - 0.75)) < 1e-9)).toBe(true);
    const [flush] = ofRole(roofOf({ ...gableRoof, fasciaTop: 'flush' }).members, 'fascia');
    expect([flush.origin[2], flush.bevel]).toEqual([fascia.origin[2], undefined]);
  });

  it('cuts a plumb-and-level tail to the full fascia depth when the fascia is not set down', () => {
    const { members } = roofOf({ ...gableRoof, rafter: '2x8', ridge: '2x10', tailCut: 'plumb-level', fasciaTop: 'beveled' });
    expect(ofRole(members, 'rafter')[0].note).toContain('plumb cut 5-1/2" deep, then level cut.');
  });

  it('sets a plumb fascia down so the roof plane passes over its outer top edge', () => {
    // 1-1/2 in thick at 6/12: 3/4 in below the rafter top at the tail.
    const { members } = roofOf(gableRoof);
    const tailTop = Math.max(...sectionCorners(ofRole(members, 'rafter')[0]).filter(([y]) => Math.abs(y + 12) < 1e-9).map(([, z]) => z));
    const [fascia] = ofRole(members, 'fascia');
    expect(fascia.origin[1]).toBe(-12);
    expect(fascia.origin[2]).toBeCloseTo(tailTop - 0.75, 9);
  });
  // 2x8 rafters at 6/12: a full plumb end of 7-1/4 × √1.25 = 8.11 in. The 2x6 fascia hangs 3/4 + 5-1/2
  // below the roof line, so the tail is plumb cut 6-1/4 in deep, then level back (8.11 − 6.25) × 2.
  const plumb = 7.25 * Math.hypot(1, 0.5);
  const { members, warnings } = roofOf({ ...gableRoof, rafter: '2x8', ridge: '2x10', tailCut: 'plumb-level' });
  const [rafter] = ofRole(members, 'rafter');

  it('cuts the tail plumb as deep as the fascia hangs, then level to the bottom edge', () => {
    const corners = sectionCorners(rafter);
    const tailTop = Math.max(...corners.filter(([y]) => Math.abs(y + 12) < 1e-9).map(([, z]) => z));
    expect(hasCorner(corners, -12, tailTop - 6.25)).toBe(true);
    expect(hasCorner(corners, -12 + (plumb - 6.25) * 2, tailTop - 6.25)).toBe(true);
    expect(rafter.note).toContain('Tail 13-7/16" past the heel line on the top edge, plumb cut 6-1/4" deep, then level cut.');
    expect(warnings).toEqual([]);
  });

  it('falls back to a plumb cut without a fascia, a long enough eave, or room under the fascia', () => {
    expect(roofOf({ ...gableRoof, rafter: '2x8', ridge: '2x10', tailCut: 'plumb-level', fascia: 'none' }).warnings[0].message).toBe(
      'A plumb-and-level tail cut needs a fascia. The tails are plumb cut.',
    );
    expect(roofOf({ ...gableRoof, rafter: '2x8', ridge: '2x10', tailCut: 'plumb-level', eaveOverhang: 2 }).warnings[0].message).toBe(
      'A plumb-and-level tail cut needs 3-11/16" of eave overhang. The tails are plumb cut.',
    );
    // 2x6 rafters: the 6.15 in plumb end is no deeper than the fascia hangs, so it stays plumb.
    const shallow = roofOf({ ...gableRoof, tailCut: 'plumb-level' });
    expect(ofRole(shallow.members, 'rafter')[0].note).toContain('plumb cut.');
    expect(shallow.warnings).toEqual([]);
  });
});
