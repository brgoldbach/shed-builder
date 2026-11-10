import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { frameRoof } from '../src/core/gen/roof';
import { corners, type Member, type Role } from '../src/core/member';

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

  it('stands a knee wall on the deck at each eave, between the gable-end walls', () => {
    expect(warnings).toEqual([]);
    // From the gable walls' inside faces: 120 - 2 x 3-1/2 = 113.
    expect(ofRole(front, 'plate.bottom')[0].origin).toEqual([3.5, 0, 103.34375]);
    expect(ofRole(front, 'plate.bottom')[0].length).toBe(113);
    // Plates at 103-11/32, 136-11/32 and 137-27/32: studs 36 - 3 x 1-1/2 = 31-1/2 on the wall layout.
    expect(ofRole(front, 'plate.cap')[0].origin[2]).toBe(137.84375);
    const studs = ofRole(front, 'stud');
    expect(xs(studs)).toEqual([3.5, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 115]);
    for (const stud of studs) expect(stud.length).toBe(31.5);
    expect(members.filter((member) => member.assembly === 'knee.back')).toHaveLength(12);
  });

  it('seats the rafters on the knee walls', () => {
    const [ridge] = ofRole(members, 'ridge');
    expect(ridge.origin[2]).toBeCloseTo(167.368 - 7.25, 3);
  });

  it('frames the loft floor with rim joists under the knee walls and joists between', () => {
    const rims = ofRole(members, 'rim.loft');
    expect(rims.map((rim) => [rim.length, rim.origin[0], rim.origin[2]])).toEqual([[113, 3.5, 97.125], [113, 3.5, 97.125]]);
    const joists = ofRole(members, 'joist.loft');
    // The rafters are far above, so no joist moves.
    expect(xs(joists)).toEqual([3.5, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 115]);
    for (const joist of joists) expect(joist.length).toBe(93);
    expect(joists[0].note).toBe('Square ends.');
  });

  it('ties each knee wall into the gable corners: its cap laps over a level corner plate', () => {
    // The knee wall's cap runs to the building corners; its top plate stays between the gable walls.
    expect(ofRole(front, 'plate.cap').map(({ length, origin }) => [length, origin[0]])).toEqual([[120, 0]]);
    const left = members.filter((member) => member.assembly === 'gable.left');
    const box = (member: Member) => [0, 1, 2].map((axis) => [Math.min(...corners(member).map((p) => p[axis])), Math.max(...corners(member).map((p) => p[axis]))]);
    // Corner plates level with the knee wall's top plate (139-11/32 less two plates), from the
    // outside face to 1-1/2 in past the knee wall's inside face.
    const cornerPlates = ofRole(left, 'plate.gable').filter(({ note }) => note === "Level, under the knee wall's cap plate, which laps over it.");
    expect(cornerPlates.map(box)).toEqual([
      [[0, 3.5], [0, 5], [136.34375, 137.84375]],
      [[0, 3.5], [91, 96], [136.34375, 137.84375]],
    ]);
    // Two studs under each, at the outside face and the knee wall's inside face, from the end-wall
    // plate at 97-1/8.
    const cornerStuds = ofRole(left, 'stud.gable').filter(({ note }) => note === 'Square cut. Under the corner plate.');
    expect(cornerStuds.map((stud) => [box(stud)[1][0], stud.length])).toEqual([
      [0, 39.21875],
      [3.5, 39.21875],
      [94.5, 39.21875],
      [91, 39.21875],
    ]);
    // The sloped top plate starts at the knee wall's inside face, against the lap.
    const [sloped] = ofRole(left, 'plate.gable').filter(({ note }) => note?.startsWith('Plumb cut against'));
    expect(sloped.note).toBe("Plumb cut against the knee wall's cap plate, level cut on the corner plate. Plumb cut 26.6° at the ridge post.");
    expect(box(sloped)[1][0]).toBeCloseTo(3.5, 9);
    // Layout 16 and 80: rafter underside 145.969, less 1.677, less the end-wall plate at 97-1/8.
    const layout = ofRole(left, 'stud.gable').filter(({ note }) => note?.startsWith('Top cut'));
    expect(Math.min(...layout.map((stud) => stud.length))).toBeCloseTo(47.1667, 3);
  });

  it('seats the gable-end rafters on the lap with the same birdsmouth as the others', () => {
    const rafters = ofRole(members, 'rafter');
    expect(rafters.every(({ note }) => note?.includes('Birdsmouth: heel line'))).toBe(true);
  });

  it('adds rim plies under the knee walls across an open end', () => {
    const plies = (stud: string) =>
      ofRole(roofOf({ loft: { ...loft, open: { end: 'left', length: 24 } }, kneeWalls: { enabled: true, height: 36, stud } }).members, 'rim.loft').filter(
        ({ note }) => note === 'Under the knee wall across the open end. Face-nail to the rim.',
      );
    // From the gable wall's inside face to the doubled edge joist at 24: 20-1/2 in, inside each rim.
    expect(plies('2x4').map(({ length, origin }) => [length, origin[0], origin[1]])).toEqual([
      [20.5, 3.5, 1.5],
      [20.5, 3.5, 94.5],
    ]);
    // A 2x6 knee wall takes two more plies a side: 4-1/2 of its 5-1/2 in.
    expect(plies('2x6')).toHaveLength(4);
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

describe('loft openings', () => {
  const hung = { enabled: true, joist: '2x6', oc: 16, support: 'hung' };
  const lengths = (members: Member[]) => members.map((member) => member.length).sort((first, second) => first - second);

  it('leaves an open end with a doubled edge joist and nothing across it', () => {
    const { members } = roofOf({ loft: { ...hung, open: { end: 'left', length: 48 } } });
    expect(xs(ofRole(members, 'edge.loft'))).toEqual([48, 49.5]);
    // Layout joists from 51 (inside the edge) to the end joist at 115.
    expect(xs(ofRole(members, 'joist.loft'))).toEqual([63.25, 79.25, 95.25, 111.25, 115]);
    // Ledgers under the floor only: 48 to 120 - 3-1/2.
    expect(lengths(ofRole(members, 'ledger.loft'))).toEqual([68.5, 68.5]);
    expect(ofRole(members, 'tie.rafter')).toHaveLength(0);
  });

  it('moves a lapping edge joist clear of the rafter it lands on', () => {
    const { members } = roofOf({ loft: { enabled: true, joist: '2x6', oc: 16, open: { end: 'left', length: 48 } } });
    // A rafter starts at 47-1/4, so the plies move to its far side.
    expect(xs(ofRole(members, 'edge.loft'))).toEqual([48.75, 50.25]);
  });

  it('frames a hatch with doubled trimmers, doubled headers, and tail joists', () => {
    // Opening 24 x 30 at x 60, y 30. Joists run 5 to 91 between the ledgers.
    const { members, warnings } = roofOf({ loft: { ...hung, hatches: [{ x: 60, y: 30, width: 24, depth: 30 }] } });
    expect(warnings).toEqual([]);
    const trimmers = ofRole(members, 'trimmer.loft');
    expect(xs(trimmers)).toEqual([57, 58.5, 84, 85.5]);
    expect(lengths(trimmers)).toEqual([86, 86, 86, 86]);
    const headers = ofRole(members, 'header.loft');
    expect(headers.map((header) => header.origin[1]).sort((first, second) => first - second)).toEqual([27, 28.5, 60, 61.5]);
    expect(lengths(headers)).toEqual([24, 24, 24, 24]);
    // Layout 63-1/4 and 79-1/4 fall between the trimmers: tails 27 - 5 = 22 and 91 - 63 = 28.
    const tails = ofRole(members, 'tail.loft');
    expect(xs(tails)).toEqual([63.25, 63.25, 79.25, 79.25]);
    expect(lengths(tails)).toEqual([22, 22, 28, 28]);
    expect(tails[0].note).toBe('Joist hanger at the hatch header. Joist hanger at the ledger.');
    expect(xs(ofRole(members, 'joist.loft'))).toEqual([3.5, 15.25, 31.25, 47.25, 95.25, 111.25, 115]);
  });

  it('warns about long headers, hatches near the eaves, and overlapping hatches', () => {
    const hatches = [
      { x: 30, y: 30, width: 60, depth: 30 },
      { x: 40, y: 30, width: 24, depth: 30 },
      { x: 100, y: 4, width: 12, depth: 30 },
    ];
    const { warnings } = roofOf({ loft: { ...hung, hatches } });
    expect(warnings).toEqual([
      { source: 'Hatch 1', message: 'The 60" hatch headers are longer than 4 ft. Check their size.' },
      { source: 'Hatch 2', message: 'The hatch overlaps another hatch.' },
      { source: 'Hatch 3', message: 'The hatch is too close to the eaves to leave tail joists.' },
    ]);
  });
});

describe('lean-to roofs', () => {
  it('get no ties and no loft', () => {
    const { members } = roofOf({ style: 'lean-to', pitch: 3, loft: { enabled: true } });
    expect(members.filter((member) => member.role.startsWith('tie') || member.assembly === 'loft')).toEqual([]);
  });
});
