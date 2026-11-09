import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { frameRoof } from '../src/core/gen/roof';
import type { Member, Role } from '../src/core/member';

// 8 x 10 ft, 2x4 walls with 92-5/8 in studs and a cap plate: plate tops at 97-1/8 in.
// Gable 6/12, 2x6 rafters at 24 in (seat 3-1/2, plumb 6.149), 2x8 ridge. The rafter top edge is at
// 101.524 + y/2 on the front slope; the ridge top at 125.149, its bottom at 117.899.
const gable = { style: 'gable', pitch: 6, rafter: '2x6', oc: 24, ridge: '2x8' };
const roofOf = (roof: object, overrides: object = {}) =>
  frameRoof(shedSchema.parse({ schemaVersion: 1, width: 96, length: 120, roof: { ...gable, ...roof }, ...overrides }));

const ofRole = (members: Member[], role: Role) => members.filter((member) => member.role === role);
const xs = (members: Member[]) => members.map((member) => member.origin[0]).sort((first, second) => first - second);

describe('rafter ties', () => {
  it('ties each common rafter pair at the plate, beside the rafter, wall face to wall face', () => {
    const ties = ofRole(roofOf({}).members, 'tie.rafter');
    expect(xs(ties)).toEqual([24.75, 48.75, 72.75, 96.75]); // common rafters start at 23-1/4 ... 95-1/4, plus 1-1/2
    for (const tie of ties) expect(tie.length).toBe(96);
    // The 2x4 top (100-5/8) stays under the rafter top at the wall face (101.524).
    expect(ties[0].note).toBe('Square ends.');
  });

  it('ties every Nth pair', () => {
    expect(ofRole(roofOf({ rafterTies: { every: 2 } }).members, 'tie.rafter')).toHaveLength(2);
  });

  it('trims raised ties to the roof line and warns above the lower third', () => {
    const { members, warnings } = roofOf({ rafterTies: { height: 12 } });
    const [tie] = ofRole(members, 'tie.rafter');
    // Bottom at 109-1/8 meets the rafter top at y = (109.125 - 101.524) / 0.5 = 15.20 from each wall.
    expect(tie.length).toBeCloseTo(65.5967, 3);
    expect(tie.note).toBe('Ends cut 26.6° to the roof line.');
    // Lower third: (125.149 - 97.125) / 3 = 9.34.
    expect(warnings).toEqual([
      { source: 'Roof', message: 'Rafter ties 12" above the plate are above the lower third of the roof (9-5/16").' },
    ]);
  });
});

describe('collar ties', () => {
  it('sits at the bottom of the upper third, kept under the ridge board', () => {
    const collars = ofRole(roofOf({}).members, 'tie.collar');
    expect(collars).toHaveLength(4);
    // Upper third starts at 115.808; the ridge bottom less 3-1/2 is 114.399, so 114.399 wins.
    // It meets the rafter top 25-3/4 from each wall: 96 - 51-1/2 = 44-1/2.
    expect(collars[0].length).toBeCloseTo(44.5, 9);
    expect(collars[0].note).toBe('Ends cut 26.6° to the roof line.');
  });

  it('warns and leaves collar ties out when they would hit the ridge board', () => {
    const { members, warnings } = roofOf({ collarTies: { height: 20 } });
    expect(ofRole(members, 'tie.collar')).toHaveLength(0);
    expect(warnings[0].message).toBe('Collar ties 20" above the plate hit the ridge board. Lower them.');
  });
});

describe('loft', () => {
  const { members } = roofOf({ loft: { enabled: true, joist: '2x6', oc: 16 } });
  const joists = ofRole(members, 'joist.loft');

  it('replaces the rafter ties with loft joists on their own layout, beside the rafters', () => {
    expect(ofRole(members, 'tie.rafter')).toHaveLength(0);
    // Ends inside the gable studs (3-1/2 and 115). 47-1/4 and 95-1/4 land on rafters and move to
    // their +x sides, 48-3/4 and 96-3/4.
    expect(xs(joists)).toEqual([3.5, 15.25, 31.25, 48.75, 63.25, 79.25, 96.75, 111.25, 115]);
  });

  it('spans wall face to wall face with ends trimmed to the roof line', () => {
    for (const joist of joists) expect(joist.length).toBe(96);
    expect(joists[0].note).toBe('Ends cut 26.6° to the roof line.');
  });
});

describe('knee walls raise the roof', () => {
  // Deck top: 97-1/8 + 5-1/2 joist + 23/32 deck = 103-11/32. 36 in knee walls put the rafter
  // bearing at 139-11/32, and the ridge top at 139.344 + 21-7/8 + 6.149 = 167.368.
  const loft = { enabled: true, joist: '2x6', oc: 16 };
  const { members, warnings } = roofOf({ loft, kneeWalls: { enabled: true, height: 36 } });
  const front = members.filter((member) => member.assembly === 'knee.front');

  it('stands a full-length knee wall on the deck at each eave, flush with the wall below', () => {
    expect(warnings).toEqual([]);
    expect(ofRole(front, 'plate.bottom')[0].origin).toEqual([0, 0, 103.34375]);
    expect(ofRole(front, 'plate.bottom')[0].length).toBe(120);
    // Plates at 103-11/32, 136-11/32 and 137-27/32: studs 36 - 3 x 1-1/2 = 31-1/2 on the wall layout.
    expect(ofRole(front, 'plate.cap')[0].origin[2]).toBe(137.84375);
    const studs = ofRole(front, 'stud');
    expect(xs(studs)).toEqual([0, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 118.5]);
    for (const stud of studs) expect(stud.length).toBe(31.5);
    expect(members.filter((member) => member.assembly === 'knee.back')).toHaveLength(12);
  });

  it('seats the rafters on the knee walls', () => {
    const [ridge] = ofRole(members, 'ridge');
    expect(ridge.origin[2]).toBeCloseTo(167.368 - 7.25, 3);
  });

  it('frames the loft floor with rim joists under the knee walls and joists between', () => {
    const rims = ofRole(members, 'rim.loft');
    expect(rims.map((rim) => [rim.length, rim.origin[2]])).toEqual([[120, 97.125], [120, 97.125]]);
    const joists = ofRole(members, 'joist.loft');
    // The rafters are far above, so no joist moves.
    expect(xs(joists)).toEqual([3.5, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 115]);
    for (const joist of joists) expect(joist.length).toBe(93);
    expect(joists[0].note).toBe('Square ends.');
  });

  it('runs the gable studs past the loft to the gable top plate, which stops at the knee wall', () => {
    const left = members.filter((member) => member.assembly === 'gable.left');
    const [plate] = ofRole(left, 'plate.gable');
    expect(plate.note).toBe('Plumb cuts 26.6° at the knee wall and 26.6° at the ridge post.');
    // From the knee wall's inside face (3-1/2) to the post face (47-1/4): 43-3/4 x cos plus
    // (21-7/8 + 1.677) x sin = 49.66.
    expect(plate.length).toBeCloseTo(49.664, 3);
    // Layout 16 and 80: rafter underside 145.969, less 1.677, less the end-wall plate at 97-1/8.
    const studs = ofRole(left, 'stud.gable').map((stud) => stud.length).sort((first, second) => first - second);
    expect(studs[0]).toBeCloseTo(47.1667, 3);
  });

  it('keeps collar ties at the same place relative to the raised rafters', () => {
    expect(ofRole(members, 'tie.collar')[0].length).toBeCloseTo(44.5, 9);
    expect(ofRole(members, 'tie.rafter')).toHaveLength(0);
  });
});

describe('loft joists hung from ledgers', () => {
  const hung = { enabled: true, joist: '2x6', oc: 16, support: 'hung' };

  it('hangs the joists between ledgers on the walls, tops flush with the wall top', () => {
    const { members } = roofOf({ loft: hung });
    const ledgers = ofRole(members, 'ledger.loft');
    // On the eave walls' inside faces (3-1/2 in), between the end walls, 97-1/8 - 5-1/2 = 91-5/8 up.
    expect(ledgers.map((ledger) => [ledger.length, ledger.origin[1], ledger.origin[2]])).toEqual([
      [113, 3.5, 91.625],
      [113, 92.5, 91.625],
    ]);
    const joists = ofRole(members, 'joist.loft');
    // Below the rafters, so no joist moves. 96 - 2 x (3-1/2 + 1-1/2) = 86 between the ledgers.
    expect(xs(joists)).toEqual([3.5, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 115]);
    for (const joist of joists) expect(joist.length).toBe(86);
    expect(joists[0].note).toBe('Square ends. Joist hangers at both ends.');
    expect(ofRole(members, 'rim.loft')).toHaveLength(0);
  });

  it('stands knee walls on the wall top, so the roof bears 36 in above it', () => {
    const { members } = roofOf({ loft: hung, kneeWalls: { enabled: true, height: 36 } });
    const front = members.filter((member) => member.assembly === 'knee.front');
    expect(ofRole(front, 'plate.bottom')[0].origin[2]).toBe(97.125);
    // Bearing 133-1/8; ridge bottom 133.125 + 21-7/8 + 6.149 - 7-1/4.
    expect(ofRole(members, 'ridge')[0].origin[2]).toBeCloseTo(153.899, 3);
  });
});

describe('lean-to roofs', () => {
  it('get no ties and no loft', () => {
    const { members } = roofOf({ style: 'lean-to', pitch: 3, loft: { enabled: true } });
    expect(members.filter((member) => member.role.startsWith('tie') || member.assembly === 'loft')).toEqual([]);
  });
});
