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
