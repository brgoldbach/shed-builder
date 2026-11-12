import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { rampPlace, withOpeningRow, withoutOpeningRow } from '../src/core/gen/ramps';
import { pruneConfig } from '../src/core/prune';
import { compactDesign } from '../src/core/share';
import { corners, LEFT_OUT, type Member, type Role } from '../src/core/member';
import { buildModel } from '../src/core/model';
import { buildBom } from '../src/core/out/bom';
import { PRESETS } from '../src/core/presets';

// 8x10 on 4x6 skids: the floor is 23/32 + 5-1/2 + 5-1/2 = 11-23/32 above grade. Row 0 is the 64 in
// door at 50% of the 96 in left wall: RO 16 to 80 in from the wall's left corner.
const [gableSkid] = PRESETS;
const GRADE = -11.71875;
const withRamps = (ramps: object[], overrides: object = {}) => shedSchema.parse({ ...gableSkid, ramps, ...overrides });
const ofRole = (members: Member[], role: Role) => members.filter((member) => member.role === role);
const range = (members: Member[], axis: number) => {
  const values = members.flatMap((member) => corners(member).map((point) => point[axis]));
  return [Math.min(...values), Math.max(...values)];
};

describe('ramp placement', () => {
  const following = { opening: { row: 0, index: 0 } };

  it('centers a ramp on the opening it follows, 6 in wider each side', () => {
    expect(rampPlace(withRamps([following]), withRamps([following]).ramps[0])).toEqual({
      wall: 'left',
      left: 10,
      right: 86,
      opening: 'shed door 64x76 (left 50%)',
      lost: false,
    });
  });

  it('moves and resizes with the opening', () => {
    const moved = withRamps([following], {
      openingTypes: [{ ...gableSkid.openingTypes[0], width: 38 }, gableSkid.openingTypes[1]],
      openings: [{ ...gableSkid.openings[0], wall: 'front', along: 'left', at: [24] }, gableSkid.openings[1]],
    });
    expect(rampPlace(moved, moved.ramps[0])).toMatchObject({ wall: 'front', left: 18, right: 68 });
  });

  it('stands on its own when it follows no opening', () => {
    const free = withRamps([{ wall: 'back', along: 'left', at: 24, width: 36 }]);
    expect(rampPlace(free, free.ramps[0])).toEqual({ wall: 'back', left: 24, right: 60, opening: null, lost: false });
  });

  it('stands on its own, with a warning, when its opening is gone', () => {
    const lost = withRamps([{ opening: { row: 4, index: 0 }, wall: 'back', along: 'left', at: 24, width: 36 }]);
    expect(rampPlace(lost, lost.ramps[0])).toMatchObject({ wall: 'back', left: 24, lost: true });
    expect(buildModel(lost).warnings).toContainEqual({ source: 'Ramp 1', message: 'The opening it follows is gone. It stands at its own position.' });
  });

  describe('through edits to the row it follows', () => {
    // Doors at 25% and 75% of the left wall; the ramp follows the one at 75%.
    const twoDoors = withRamps([{ opening: { row: 0, index: 1 } }], {
      openings: [{ ...gableSkid.openings[0], at: [25, 75] }, gableSkid.openings[1]],
    });
    const edit = (at: number[]) => withOpeningRow(twoDoors, 0, { ...twoDoors.openings[0], at }).ramps[0];

    it('follows its position by value when another position goes', () => {
      expect(edit([75]).opening).toEqual({ row: 0, index: 0 });
    });

    it('follows its position by place when the position moves', () => {
      expect(edit([25, 80]).opening).toEqual({ row: 0, index: 1 });
    });

    it('keeps its place in the row when the count changes', () => {
      expect(edit([20, 50, 80]).opening).toEqual({ row: 0, index: 1 });
    });

    it('stands where it was when its position goes', () => {
      // 75% of 96 in is 72; the 64 in RO runs 40 to 104, and the ramp 34 to 110.
      expect(edit([25])).toMatchObject({ opening: null, wall: 'left', along: 'left', at: 34, width: 76 });
    });
  });

  it('may run past a corner when it stands on its own', () => {
    // A door 2 in from the corner: the ramp, 6 in wider each side, starts 4 in past it.
    const config = withRamps([{ opening: { row: 0, index: 0 } }], {
      openings: [{ ...gableSkid.openings[0], along: 'left', at: [2] }, gableSkid.openings[1]],
    });
    const result = shedSchema.safeParse(withoutOpeningRow(config, 0));
    expect(result.success && result.data.ramps[0]).toMatchObject({ along: 'left', at: -4 });
  });

  it('keeps a ramp whose opening is gone in place through prune', () => {
    const lost = withRamps([{ opening: { row: 4, index: 0 }, wall: 'back', along: 'left', at: 24, width: 36 }]);
    expect(rampPlace(pruneConfig(lost), pruneConfig(lost).ramps[0])).toEqual(rampPlace(lost, lost.ramps[0]));
  });

  it('keeps only the settings a ramp changes in a file or link', () => {
    expect(compactDesign(withRamps([{ opening: { row: 0, index: 0 } }])).ramps).toEqual([{ opening: { row: 0, index: 0 } }]);
  });

  it('keeps each ramp in place when an opening row goes', () => {
    const config = withRamps([following, { opening: { row: 1, index: 0 } }]);
    const { openings, ramps } = withoutOpeningRow(config, 0);
    expect(openings).toEqual([gableSkid.openings[1]]);
    expect(ramps[0]).toMatchObject({ opening: null, wall: 'left', along: 'left', at: 10, width: 76 });
    expect(ramps[1].opening).toEqual({ row: 0, index: 0 });
  });
});

describe('ramp framing', () => {
  // At the door: 76 in wide, 1 in 4. Out from the left wall is -x, from the floor framing.
  const config = withRamps([{ opening: { row: 0, index: 0 } }]);
  const model = buildModel(config);
  const stringers = ofRole(model.members, 'stringer');
  const boards = ofRole(model.members, 'decking');
  const cos = 4 / Math.sqrt(17);

  it('spaces stringers 16 in o.c. from one edge, one flush with each edge', () => {
    expect(stringers).toHaveLength(6);
    expect(range(stringers, 1)).toEqual([10, 86]);
  });

  it('cuts each stringer plumb at the floor framing and level on grade', () => {
    // The stringer top runs a board's thickness under the surface; it meets grade 4 times the
    // remaining rise out.
    const depth = -GRADE - 1.5 / cos;
    expect(range(stringers, 2)[0]).toBeCloseTo(GRADE, 9);
    expect(range(stringers, 2)[1]).toBeCloseTo(-1.5 / cos, 9);
    expect(range(stringers, 0)[0]).toBeCloseTo(-4 * depth, 9);
    expect(range(stringers, 0)[1]).toBeCloseTo(0, 9);
    expect(stringers[0].note).toBe('Plumb cut 14.0° at the floor framing, lagged to it. Level cut on grade.');
    // Long point to long point along the slope: the remaining rise times the slope's hypotenuse.
    for (const stringer of stringers) expect(stringer.length).toBeCloseTo(depth * Math.sqrt(17), 9);
  });

  it('lays whole boards down the slope, the top one level with the floor', () => {
    // 4 x 11-23/32 of run is 48.3 in along the slope: 8 boards at 5-3/4.
    expect(boards).toHaveLength(8);
    expect(boards.every(({ length, size }) => length === 76 && size === '2x6')).toBe(true);
    expect(range(boards, 2)[1]).toBeCloseTo(0, 9);
  });

  it('counts two lag screws at each stringer', () => {
    const { hardware } = buildBom(config, model, new Map());
    expect(hardware.find(({ item }) => item === 'Ramp lag screw, 1/2"')?.quantity).toBe(12);
  });

  it('leaves out a ramp where the floor is at grade, outlined at the floor', () => {
    const slab = withRamps([{ opening: { row: 0, index: 0 } }], { foundation: { type: 'slab' } });
    const [warning] = buildModel(slab).warnings.filter(({ source }) => source === 'Ramp 1');
    expect(warning.message).toBe(`The floor is 0" above the ramp's foot, too low for stringers under the boards. ${LEFT_OUT}`);
    expect(warning.missing?.assembly).toBe('ramp');
    expect(ofRole(buildModel(slab).members, 'stringer')).toEqual([]);
  });

  // On a slab the floor is at grade: a foot 6 in below grade gives 6 in of rise.
  const below = (ramp: object) => withRamps([{ opening: { row: 0, index: 0 }, belowGrade: 6, ...ramp }], { foundation: { type: 'slab' } });

  it('runs a ramp down below grade to its foot', () => {
    const stringers = ofRole(buildModel(below({})).members, 'stringer');
    expect(range(stringers, 2)[0]).toBeCloseTo(-6, 9);
    expect(stringers[0].note).toBe('Plumb cut 14.0° at the slab edge, anchored to it. Level cut on the foot, 6" below grade.');
  });

  it('anchors the stringers to the slab edge, with no lag screws', () => {
    const config = below({});
    const { hardware } = buildBom(config, buildModel(config), new Map());
    const items = hardware.map(({ item }) => item);
    expect(hardware.find(({ item }) => item === 'Ramp concrete anchor, 1/2"')?.quantity).toBe(12);
    expect(items).not.toContain('Ramp lag screw, 1/2"');
  });

  it('pours a concrete ramp from the foundation edge over a base under its foot', () => {
    const config = below({ material: 'concrete' });
    const concreteModel = buildModel(config);
    expect(ofRole(concreteModel.members, 'stringer')).toEqual([]);
    // 1 in 4 over 6 in of rise: 24 in of run, on a 4 in base. 76 in wide at the door.
    const [ramp] = concreteModel.solids.filter(({ label }) => label === 'Concrete ramp');
    expect(ramp.shape).toMatchObject({ kind: 'panel', thick: 76, outline: [[0, 0], [24, -6], [24, -10], [0, -10]] });
    // 24 x (10 + 4) / 2 = 168 sq in, times 76 in: 7.39 cu ft.
    const { concrete } = buildBom(config, concreteModel, new Map());
    expect(concrete.find(({ item }) => item === 'Concrete, ramp')?.note).toBe('7.4 cu ft net, or 13 bags of 80 lb mix at 0.60 cu ft each.');
  });
});

describe('ramps and stairs between levels', () => {
  // A 96 in deep lean-to on the left wall, the door's wall. Its deck beam is three 4x4-wide plies on
  // the post line at 94-1/4: outer face 96-1/2. Seventeen rows of 5/4x6 at 5-3/4 reach 97-1/2.
  const door = { opening: { row: 0, index: 0 } };
  const withLeanTo = (floor: object, ramps: object[]) => withRamps(ramps, { additions: [{ side: 'left', depth: 96, ...floor }] });
  const deck = (drop: number) => ({ floor: 'deck', deck: { drop } });
  const hardware = (config: ReturnType<typeof withRamps>) =>
    buildBom(config, buildModel(config), new Map()).hardware.filter(({ item }) => /Ramp|Stair/.test(item)).map(({ item, quantity }) => [item, quantity]);
  const warningsOf = (config: ReturnType<typeof withRamps>) => buildModel(config).warnings.filter(({ source }) => /^(Ramp|Stairs) /.test(source)).map(({ message }) => message);

  it('builds stairs from the floor down to a dropped deck, with equal risers and 5/4 treads', () => {
    const config = withLeanTo(deck(15), [{ ...door, kind: 'stairs' }]);
    const { members } = buildModel(config);
    // 15 in of rise: two risers of 7-1/2. The 76 in width: (76 − 1-1/2) / 18 → 5 spaces, 6 stringers.
    const stringers = ofRole(members, 'stringer.stair');
    expect(stringers).toHaveLength(6);
    expect(stringers[0].note).toBe('Cut stringer: 2 risers of 7-1/2", 1 tread of 11-1/4". Plumb cut 33.7° at the floor framing, in a sloped hanger. Level cut on the deck.');
    const treads = ofRole(members, 'tread');
    expect(treads.map(({ size }) => size)).toEqual(['5/4x6', '5/4x6']);
    expect(range(treads, 2)[1]).toBeCloseTo(-7.5, 9);
    expect(hardware(config)).toEqual([['Stair stringer hanger, sloped, 2x12', 6]]);
  });

  it("starts a ramp at the deck's outer board, its stringers lagged to the beam", () => {
    const config = withLeanTo(deck(2), [{ ...door, from: 'lean-to' }]);
    const { members } = buildModel(config);
    // Out from the left wall is −x. The stringers start at the beam face, the surface at the outer board.
    expect(range(ofRole(members, 'stringer'), 0)[1]).toBeCloseTo(-96.5, 9);
    const boards = members.filter(({ assembly, role }) => assembly === 'ramp' && role === 'decking');
    const top = boards.reduce((high, board) => (board.origin[2] > high.origin[2] ? board : high));
    const angle = Math.atan(1 / 4);
    expect(top.origin[0]).toBeCloseTo(-97.5 + 1.5 * Math.sin(angle), 9);
    expect(top.origin[2]).toBeCloseTo(-2 - 1.5 * Math.cos(angle), 9);
    expect(hardware(config)).toEqual([['Ramp lag screw, 1/2"', 12]]);
  });

  it("anchors stairs to a lean-to slab's edge, down to a foot below grade", () => {
    const config = withLeanTo({ floor: 'slab' }, [{ ...door, kind: 'stairs', from: 'lean-to', belowGrade: 15 }]);
    expect(ofRole(buildModel(config).members, 'stringer.stair')[0].note).toContain('at the slab edge, anchored to it');
    expect(hardware(config)).toEqual([['Stair concrete anchor, 1/2"', 12]]);
  });

  it('warns that four risers need a handrail', () => {
    // 11-23/32 + 12 in of rise: four risers of 5-15/16.
    expect(warningsOf(withRamps([{ ...door, kind: 'stairs', belowGrade: 12 }]))).toEqual([
      '4 risers need a handrail on one side (IRC R311.7.8). The app does not build it.',
    ]);
  });

  it('builds no stairs for one step', () => {
    expect(warningsOf(withLeanTo({ floor: 'slab' }, [{ ...door, kind: 'stairs', from: 'lean-to', belowGrade: 6 }]))).toEqual([
      'The left lean-to slab is 6" above the foot of the stairs: one step at most, so the app builds no stairs.',
    ]);
  });

  it('leaves out what does not fit on the lean-to floor, short of the posts', () => {
    // 24 in of rise: four risers, three treads, 33-3/4 in out. The posts of a 36 in lean-to stand 32-1/2 in out.
    const config = withRamps([{ ...door, kind: 'stairs' }], { additions: [{ side: 'left', depth: 36, ...deck(24) }] });
    expect(warningsOf(config)).toEqual([
      `It does not fit on the left lean-to deck: it reaches 33-3/4" out from the wall, and the posts stand 32-1/2" out. ${LEFT_OUT}`,
    ]);
  });

  it('leaves out a ramp to a deck flush with the floor, as it has no rise', () => {
    expect(warningsOf(withLeanTo(deck(0), [door]))).toEqual([`The floor is 0" above the ramp's foot, too low for stringers under the boards. ${LEFT_OUT}`]);
  });

  it("warns when a ramp from the floor meets an open lean-to's post", () => {
    // The two posts stand at the corners, 1-3/4 and 94-1/4 along the wall. 1 in 12 runs 140 in out.
    const config = withLeanTo({ floor: 'none' }, [{ wall: 'left', along: 'left', at: 70, width: 26, slope: 12 }]);
    expect(warningsOf(config)).toEqual(['It meets a post of the left lean-to.']);
  });

  it('keeps only the settings stairs and lean-to starts use in a file or link', () => {
    // Stairs take no ramp settings. A start at the lean-to stays only where a lean-to floor meets it.
    expect(compactDesign(withRamps([{ ...door, kind: 'stairs', slope: 6, from: 'lean-to' }])).ramps).toEqual([{ ...door, kind: 'stairs' }]);
    expect(compactDesign(withLeanTo(deck(2), [{ ...door, from: 'lean-to' }])).ramps).toEqual([{ ...door, from: 'lean-to' }]);
  });
});
