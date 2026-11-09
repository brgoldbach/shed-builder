import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { sheetJoints, subtract } from '../src/core/gen/sheathing';
import type { Panel, Point, Solid } from '../src/core/member';
import { buildModel } from '../src/core/model';
import { PRESETS } from '../src/core/presets';

const [gableSkid] = PRESETS;
const panelsOf = (solids: Solid[], prefix: string) =>
  solids.filter((solid) => solid.id.startsWith(prefix)).map((solid) => solid.shape as Panel);
const extent = ({ outline }: Panel) => {
  const us = outline.map(([u]) => u);
  const vs = outline.map(([, v]) => v);
  return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
};
// Slope length per inch of run at 6/12.
const SLOPE = Math.hypot(1, 0.5);

describe('sheet joints', () => {
  it('lands each joint on the farthest support within a sheet', () => {
    // 8x10 front wall: 7/16 past each corner; studs at 16 in, window kings at 45-3/4 and 74-1/4.
    const supports = [0.75, 16, 32, 45.75, 64, 74.25, 80, 96, 112, 119.25];
    expect(sheetJoints(-0.4375, 120.4375, 48, 48, supports)).toEqual([
      [-0.4375, 45.75],
      [45.75, 80],
      [80, 120.4375],
    ]);
  });

  it('starts a staggered row with a half sheet, and avoids a short last piece', () => {
    // Rafter centers from an 8 in rake edge: 127-1/4 would leave 8-3/4, so the joint drops to 104.
    expect(sheetJoints(0, 136, 48, 96, [8.75, 32, 56, 80, 104, 127.25])).toEqual([
      [0, 32],
      [32, 104],
      [104, 136],
    ]);
  });
});

describe('subtract', () => {
  it('notches a sheet where an opening runs off its edge', () => {
    // A 48x96 sheet over the left half of a 64x76 door from the floor.
    expect(subtract({ min: [0, 0], max: [48, 96] }, [{ min: [16, 0], max: [80, 76] }])).toEqual([
      [[16, 0], [16, 76], [48, 76], [48, 96], [0, 96], [0, 0]],
    ]);
  });

  it('leaves an opening inside the sheet as a clockwise hole', () => {
    const loops = subtract({ min: [0, 0], max: [48, 96] }, [{ min: [10, 40], max: [30, 70] }]);
    expect(loops).toHaveLength(2);
    const turn = (loop: Point[]) => loop.reduce((sum, [x, y], index) => sum + x * loop[(index + 1) % loop.length][1] - loop[(index + 1) % loop.length][0] * y, 0);
    expect(loops.map(turn).map(Math.sign)).toEqual([1, -1]);
  });
});

describe('8x10 sheathing', () => {
  const { solids } = buildModel(gableSkid);

  it('sheathes the front wall from its foot, past each corner, with the window cut out', () => {
    const front = panelsOf(solids, 'FW-SH');
    // The 1-1/8 in strip above the 96 in sheets is left off: they end on the cap plate.
    expect(front.map(extent)).toEqual([
      [-0.4375, 45.75, 0, 96],
      [45.75, 80, 0, 96],
      [80, 120.4375, 0, 96],
    ]);
    expect(front[1].holes).toEqual([[[48, 82.25], [72, 82.25], [72, 46.25], [48, 46.25]]]);
    expect(front[0]).toMatchObject({ origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], thick: 0.4375 });
  });

  it('sheathes a gable end up to the end rafters', () => {
    const left = panelsOf(solids, 'LW-SH');
    expect(left).toHaveLength(4);
    // Upper row: from the 8 ft wall top at the corners to the rafter underside at the ridge post,
    // 97-1/8 + (47-1/4 - 2-9/16 seat) × 6/12.
    const [upperLeft] = left.slice(2).map(extent);
    expect(upperLeft).toEqual([0, 48, 96, 97.125 + (47.25 - 2.5625) / 2]);
    expect(left[2].outline).toContainEqual([0, 97.125]);
  });

  it('runs the roof sheets from over the fascia to the ridge line, joints staggered on rafters', () => {
    const roof = panelsOf(solids, 'RF-SH');
    expect(roof).toHaveLength(10);
    // 12 in eave, 1-1/2 in fascia, and 48 in to the ridge line, along the slope.
    const rows = roof.slice(0, 5).map(extent);
    expect(rows.map(([from, to]) => [from, to])).toEqual([[0, 80], [80, 136], [0, 32], [32, 104], [104, 136]]);
    expect(rows[4][3]).toBeCloseTo(61.5 * SLOPE, 9);
  });

  it('lays the subfloor across the joists, the second row staggered', () => {
    const subfloor = panelsOf(solids, 'FL-SF');
    expect(subfloor.map(extent)).toEqual([
      [0, 96, 0, 48],
      [96, 120, 0, 48],
      [0, 48, 48, 96],
      [48, 120, 48, 96],
    ]);
    expect(subfloor[0]).toMatchObject({ origin: [0, 0, -0.71875], u: [1, 0, 0], v: [0, 1, 0] });
  });

  it('leaves the walls bare with no sheathing chosen', () => {
    const bare = buildModel(shedSchema.parse({ ...gableSkid, walls: { sheathing: 'none' } }));
    expect(bare.solids.filter((solid) => solid.label.startsWith('Wall sheathing'))).toEqual([]);
  });
});

describe('loft deck', () => {
  // 8x10 with 2x6 loft joists on the plates: joist tops at 97-1/8 + 5-1/2 = 102-5/8.
  const loft = { enabled: true, joist: '2x6', oc: 16 };
  const withLoft = (roof: object) => buildModel(shedSchema.parse({ ...gableSkid, roof: { ...gableSkid.roof, ...roof } }));
  const deckOf = (model: ReturnType<typeof buildModel>) => model.solids.filter((solid) => solid.label.startsWith('Loft deck'));

  it('lays the deck on the joists and stands the knee walls on it, with the loft and floor layers', () => {
    const model = withLoft({ loft: { ...loft, open: { end: 'left', length: 24 } }, kneeWalls: { enabled: true, height: 36 } });
    const deck = deckOf(model);
    expect(deck.every((solid) => solid.layer === 'loft' && (solid.shape as Panel).origin[2] === 102.625)).toBe(true);
    const [knee] = model.members.filter((member) => member.assembly === 'knee.front' && member.role === 'plate.bottom');
    expect(knee.origin[2]).toBe(102.625 + 0.71875);
    expect(model.solids.filter((solid) => solid.label.startsWith('Subfloor')).every((solid) => solid.layer === 'floor')).toBe(true);
    // Between the gable walls, over the rims to both outside faces. The 24 in open end leaves a
    // 3-1/2 in strip under each knee wall, so the sheets at that end are L-shaped.
    expect(deck.map((solid) => extent(solid.shape as Panel))).toEqual([
      [3.5, 96, 0, 48],
      [96, 116.5, 0, 48],
      [3.5, 48, 48, 96],
      [48, 116.5, 48, 96],
    ]);
    expect((deck[0].shape as Panel).outline).toEqual([[96, 0], [96, 48], [24, 48], [24, 3.5], [3.5, 3.5], [3.5, 0]]);
  });

  it('stops the deck where the rafter undersides meet its top, without knee walls', () => {
    // 2-9/16 seat + (102-5/8 + 23/32 - 97-1/8) / (6/12) = 15 in from each wall face. The joists
    // lap the rafters, so the joints land on 49-1/2 and 97-1/2.
    expect(deckOf(withLoft({ loft })).map((solid) => extent(solid.shape as Panel))).toEqual([
      [3.5, 97.5, 15, 63],
      [97.5, 116.5, 15, 63],
      [3.5, 49.5, 63, 81],
      [49.5, 116.5, 63, 81],
    ]);
  });
});
