import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { frameWalls } from '../src/core/gen/walls';
import { buildModel } from '../src/core/model';
import type { Member, Role } from '../src/core/member';
import { evenPercents } from '../src/core/placement';

// 8 x 10 ft, 2x4 at 16 in o.c., 92-5/8 in studs: top plate underside at 94-1/8 in.
const TYPES = [
  { name: 'door', kind: 'door', width: 64, height: 76 },
  { name: 'window', kind: 'window', width: 24.5, height: 36.5 },
];
const frame = (
  openings: object[],
  { openingTypes = TYPES as object[], ...overrides }: { openingTypes?: object[]; [key: string]: unknown } = {},
) =>
  frameWalls(shedSchema.parse({ schemaVersion: 1, width: 96, length: 120, openingTypes, openings, ...overrides }));

const wall = (members: Member[], name: string) => members.filter((member) => member.assembly === `wall.${name}`);
const ofRole = (members: Member[], role: Role) => members.filter((member) => member.role === role);
const sorted = (values: number[]) => [...values].sort((first, second) => first - second);
const lengths = (members: Member[]) => sorted(members.map((member) => member.length));

const doorRow = { type: 'door', wall: 'left', along: 'left', at: [16] };
const windowRow = { type: 'window', wall: 'front', sill: 46, along: 'left', at: [48] };
const withType = (name: string, changes: object) =>
  TYPES.map((type) => (type.name === name ? { ...type, ...changes } : type));

describe('door on the left wall: RO 64 x 76 at 16 in, double 2x8 header', () => {
  const left = wall(frame([doorRow]).members, 'left');

  it('frames kings, single jacks, and a 2-ply header between the kings', () => {
    expect(lengths(ofRole(left, 'king'))).toEqual([92.625, 92.625]);
    expect(lengths(ofRole(left, 'jack'))).toEqual([74.5, 74.5]); // 76 - 1-1/2 plate
    expect(lengths(ofRole(left, 'header'))).toEqual([67, 67]); // 64 + 2 jacks
    expect(ofRole(left, 'header').every((ply) => ply.size === '2x8')).toBe(true);
  });

  it('puts cripples above the header on layout, clear of the jacks', () => {
    // Layout 16 and 80 hit the jacks; 32, 48, 64 take cripples. 94-1/8 - (76 + 7-1/4) = 10-7/8.
    expect(lengths(ofRole(left, 'cripple'))).toEqual([10.875, 10.875, 10.875]);
    expect(ofRole(left, 'stud')).toHaveLength(0);
  });

  it('runs the bottom plate through the doorway, with a note to cut it out after anchoring', () => {
    const plates = ofRole(left, 'plate.bottom');
    expect(lengths(plates)).toEqual([89]);
    // The plate starts 3-1/2 in from the corner. RO 16 to 80 from the corner.
    expect(plates[0].note).toBe(
      'After anchoring, cut out door (left 16" from left) from 12-1/2" to 76-1/2" from the left end, viewed from outside.',
    );
  });
});

describe('window on the front wall: RO 24-1/2 x 36-1/2 at 48 in, sill 46 in', () => {
  const front = wall(frame([windowRow]).members, 'front');

  it('frames the opening with jacks to the header and a rough sill between them', () => {
    expect(lengths(ofRole(front, 'jack'))).toEqual([81, 81]);
    expect(lengths(ofRole(front, 'header'))).toEqual([27.5, 27.5]);
    expect(lengths(ofRole(front, 'sill'))).toEqual([24.5]);
    expect(ofRole(front, 'sill')[0].origin[2]).toBe(44.5);
  });

  it('puts the double header plies at the faces with the spacer between', () => {
    expect(ofRole(front, 'header').map((ply) => ply.origin[1])).toEqual([0, 2]);
  });

  it('takes cripples at layout 64 above and below; other layout studs stay full height', () => {
    expect(lengths(ofRole(front, 'cripple'))).toEqual([4.375, 43]);
    expect(ofRole(front, 'stud')).toHaveLength(5); // 16, 32, 80, 96, 112
    expect(lengths(ofRole(front, 'plate.bottom'))).toEqual([120]);
    expect(ofRole(front, 'plate.bottom')[0].note).toBeUndefined();
  });
});

describe('headers', () => {
  it('frames a single girder as one ply at the outside face', () => {
    const openingTypes = withType('window', { header: '4x6', girder: 'single' });
    const front = wall(frame([windowRow], { openingTypes }).members, 'front');
    const plies = ofRole(front, 'header');
    expect(plies).toHaveLength(1);
    expect(plies[0]).toMatchObject({ size: '4x6', length: 27.5 });
    expect(plies[0].origin[1]).toBe(0);
  });

  it('skips a triple 2x girder in a 2x4 wall, with a warning', () => {
    const { members, warnings } = frame([windowRow], { openingTypes: withType('window', { girder: 'triple' }) });
    expect(ofRole(members, 'header')).toHaveLength(0);
    expect(warnings[0].message).toBe('3 plies of 2x8 are thicker than the wall.');
  });

  it('frames a triple girder in a 2x6 wall with the last ply at the inside face', () => {
    const { members } = frame([windowRow], {
      openingTypes: withType('window', { girder: 'triple' }),
      walls: { stud: '2x6' },
    });
    expect(ofRole(members, 'header').map((ply) => ply.origin[1])).toEqual([0, 1.5, 4]);
  });

  it('stacks flat plates below and above the header', () => {
    const openingTypes = withType('window', { header: '2x6', plateBelow: true, plateAbove: true });
    const front = wall(frame([windowRow], { openingTypes }).members, 'front');
    // RO top 82-1/2: plate to 84, 2x6 to 89-1/2, plate to 91, cripples 3-1/8 to the top plate.
    expect(sorted(ofRole(front, 'header.plate').map((plate) => plate.origin[2]))).toEqual([82.5, 89.5]);
    expect(ofRole(front, 'header').map((ply) => ply.origin[2])).toEqual([84, 84]);
    expect(lengths(ofRole(front, 'cripple'))).toEqual([3.125, 43]);
  });

  it('lays a flat header on its face and warns on a bearing wall', () => {
    const { members, warnings } = frame([windowRow], { openingTypes: withType('window', { girder: 'flat' }) });
    const [header] = ofRole(members, 'header');
    expect(header.axes.thick).toEqual([0, 0, 1]);
    expect(header.size).toBe('2x4');
    expect(warnings[0].message).toContain('bearing wall');
  });

  it('raises the header tight to the plate when the cripples would be under 3 in', () => {
    // 82-1/2 + 9-1/4 = 91-3/4, 2-3/8 under the plate.
    const openingTypes = withType('door', { height: 82.5, header: '2x10' });
    const { members, warnings } = frame([{ ...doorRow, wall: 'front', at: [40] }], { openingTypes });
    expect(lengths(ofRole(members, 'jack'))).toEqual([83.375, 83.375]);
    expect(ofRole(members, 'cripple')).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('tight to the top plate');
  });
});

describe('placement rows', () => {
  it('spreads openings evenly, each at the center of an equal share of the wall', () => {
    expect(evenPercents(1)).toEqual([50]);
    expect(evenPercents(2)).toEqual([25, 75]);
    expect(evenPercents(4)).toEqual([12.5, 37.5, 62.5, 87.5]);
  });

  it('places one row at several positions, measured from left, right, or as a percent', () => {
    const rows = [
      { ...windowRow, at: [16] },
      { ...windowRow, along: 'right', at: [16] },
      { ...windowRow, wall: 'back', along: 'percent', at: [25, 75] },
    ];
    const { members, warnings } = frame(rows);
    expect(warnings).toEqual([]);
    // RO left edges 16 and 120 - 16 - 24-1/2 = 79-1/2. Each king sits outside a 1-1/2 in jack.
    expect(sorted(ofRole(wall(members, 'front'), 'king').map((king) => king.origin[0]))).toEqual([13, 42, 76.5, 105.5]);
    // Back wall runs right to left. RO centers 30 and 90 from its left corner: ROs 17-3/4 to 42-1/4
    // and 77-3/4 to 102-1/4. Kings start 3 in before and 1-1/2 in after each RO: u = 14-3/4, 43-3/4,
    // 74-3/4, 103-3/4, at x = 120 - u.
    expect(sorted(ofRole(wall(members, 'back'), 'king').map((king) => king.origin[0]))).toEqual([
      16.25, 45.25, 76.25, 105.25,
    ]);
  });

  it('frames nothing for a disabled row', () => {
    const { members } = frame([{ ...windowRow, enabled: false }]);
    expect(ofRole(members, 'king')).toHaveLength(0);
  });

  it('names the type, wall, and position in warnings', () => {
    const { warnings } = frame([{ ...windowRow, along: 'percent', at: [1] }]);
    expect(warnings[0]).toMatchObject({ source: 'window (front 1%)', message: expect.stringContaining('wall end') });
  });
});

describe('opening rules', () => {
  it('uses 2 jacks per side when the RO is wider than 6 ft', () => {
    const openingTypes = [{ name: 'garage', kind: 'overhead', width: 108, height: 84, header: '2x6' }];
    const { members, warnings } = frame([{ type: 'garage', wall: 'front', along: 'left', at: [30] }], {
      openingTypes,
      length: 168,
    });
    expect(ofRole(members, 'jack')).toHaveLength(4);
    expect(warnings).toEqual([]);
  });

  it('skips an opening whose header does not fit, with a warning', () => {
    const { members, warnings } = frame([doorRow], { openingTypes: withType('door', { height: 90 }) });
    expect(ofRole(members, 'king')).toHaveLength(0);
    expect(warnings[0].message).toContain('does not fit');
  });

  it('skips an opening that overlaps another', () => {
    const { members, warnings } = frame([{ ...windowRow, at: [48, 60] }]);
    expect(ofRole(members, 'king')).toHaveLength(2);
    expect(warnings[0]).toMatchObject({ source: 'window (front 60" from left)', message: expect.stringContaining('overlaps') });
  });

  it('skips an opening whose framing runs past the wall end', () => {
    const { warnings } = frame([{ ...windowRow, at: [2] }]);
    expect(warnings[0].message).toContain('past the wall end');
  });

  it('warns when an overhead door lacks headroom', () => {
    // Wall top 97-1/8, RO top 84: 13-1/8 in of headroom.
    const openingTypes = [{ name: 'garage', kind: 'overhead', width: 64, height: 84, girder: 'flat', headroom: 16 }];
    const { warnings } = frame([{ ...doorRow, type: 'garage' }], { openingTypes });
    expect(warnings[0].message).toContain('headroom above the RO is 13-1/8"');
  });
});

describe('gable openings', () => {
  // 10 ft wide gable, 2x4 rafters at 6/12 on 8 ft walls (top 97-1/8): a 12 x 12 vent centered, sill 102,
  // flat header.
  const SLOPE = Math.hypot(1, 0.5);
  const vent = { name: 'vent', kind: 'window', width: 12, height: 12, girder: 'flat' };
  const config = (row: object) =>
    shedSchema.parse({
      schemaVersion: 1,
      width: 120,
      length: 144,
      openingTypes: [vent],
      openings: [{ type: 'vent', wall: 'right', sill: 102, at: [50], ...row }],
      roof: { rafter: '2x4', ridge: '2x6' },
    });
  const model = buildModel(config({}));
  const gable = model.members.filter((member) => member.assembly === 'gable.right');
  // Underside of the gable top plates at u: rafter underside (seat 2-9/16) less the plate's plumb depth.
  const under = (u: number) => 97.125 + (Math.min(u, 120 - u) - 2.5625) / 2 - 1.5 * SLOPE;

  it('frames the RO in the gable, not the end wall', () => {
    expect(model.openings).toEqual([{ wall: 'right', name: 'vent', left: 54, right: 66, bottom: 102, top: 114 }]);
    expect(wall(model.members, 'right').filter((member) => ['king', 'jack', 'header'].includes(member.role))).toEqual([]);
    expect(model.warnings).toEqual([]);
  });

  it('stands kings and jacks on the end-wall plate, kings cut to the gable top plate', () => {
    // Kings at 51 and 67-1/2; the long point is over the header end at 52-1/2 (and 67-1/2).
    for (const king of ofRole(gable, 'king')) expect(king.length).toBeCloseTo(under(52.5) - 97.125, 9);
    expect(lengths(ofRole(gable, 'jack'))).toEqual([16.875, 16.875]); // 114 - 97-1/8
    expect(ofRole(gable, 'header').map((header) => [header.size, header.length])).toEqual([['2x4', 15]]);
    expect(ofRole(gable, 'sill').map((sill) => [sill.length, sill.origin[2]])).toEqual([[12, 100.5]]);
  });

  it('turns the layout stud and the ridge post inside the RO into cripples', () => {
    // Cripples below the sill at the post (59-1/4) and the 64 in layout stud: 100-1/2 - 97-1/8.
    const cripples = ofRole(gable, 'cripple');
    expect(cripples.filter((cripple) => cripple.length === 3.375)).toHaveLength(2);
    // Above the header (115-1/2) at the 64 in layout stud, long point at 63-1/4.
    expect(cripples.find((cripple) => cripple.length !== 3.375)!.length).toBeCloseTo(under(63.25) - 115.5, 9);
    // The ridge post runs from the header to the ridge board bottom: rafter top at the ridge face less 5-1/2.
    const [post] = ofRole(gable, 'post.ridge');
    expect(post.length).toBeCloseTo(97.125 + (59.25 - 2.5625) / 2 + 3.5 * SLOPE - 5.5 - 115.5, 9);
  });

  it('leaves out an opening whose header meets the gable top plates', () => {
    // 121-1/2 to the header top; the plates are at 120-7/16 over the header ends.
    const { warnings, openings } = buildModel(config({ sill: 108 }));
    expect(openings).toEqual([]);
    expect(warnings.map((warning) => warning.message)).toEqual([
      'The header does not fit. RO top 120" plus 1-1/2" of header is above the gable top plate at 120-7/16".',
    ]);
  });

  it('leaves out an opening whose king lands on the ridge post', () => {
    const { warnings } = buildModel(config({ along: 'left', at: [61] }));
    expect(warnings.map((warning) => warning.message)).toEqual(['The kings or jacks land on the ridge post. Move the opening.']);
  });
});
