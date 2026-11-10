import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { buildFinishes, type FinishPart } from '../src/core/gen/finishes';
import { buildModel } from '../src/core/model';
import { PRESETS } from '../src/core/presets';

const [gableSkid] = PRESETS;
const finishesOf = (config = gableSkid) => buildFinishes(config, buildModel(config));
const withLook = (parts: FinishPart[], look: FinishPart['look']) => parts.filter((part) => part.look === look);
const holes = (part: FinishPart) => (part.shape.kind === 'panel' ? part.shape.holes.length : 0);

describe('finishes', () => {
  // The 8x10 preset: a window in the front wall, a 64 in door in the left wall.
  const parts = finishesOf();

  it('sides each wall, cut out at each RO', () => {
    // Front, back, left, right.
    expect(withLook(parts, 'lap').map(holes)).toEqual([1, 0, 1, 0]);
  });

  it('trims each corner with two boards and each opening with a casing', () => {
    expect(parts.filter((part) => part.layer === 'siding' && part.look === 'plain')).toHaveLength(8 + 2);
  });

  it('fills a window with glass and a wide door RO with a pair of leaves', () => {
    expect(withLook(parts, 'glass')).toHaveLength(1);
    expect(withLook(parts, 'planks')).toHaveLength(2);
  });

  it('shingles each roof plane and caps the ridge', () => {
    expect(withLook(parts, 'shingles')).toHaveLength(2);
    expect(parts.filter((part) => part.layer === 'roofing' && part.look === 'plain')).toHaveLength(2);
  });

  it('lays corrugated panels from the rake, lapped up the slope past the panel length', () => {
    const config = shedSchema.parse({ ...gableSkid, roof: { ...gableSkid.roof, roofing: 'metal' }, finishes: { panelLength: 48 } });
    const [plane] = buildModel(config).planes;
    const panels = finishesOf(config).flatMap(({ shape }) => (shape.kind === 'corrugated' ? [[shape.length, shape.width]] : []));
    // 136 in along the eave: five 24 in covers of 26 in panels, then a 16 in panel. Up the slope
    // from 2 in past the eave: a 48 in panel, then the rest from 6 in below its top.
    const rows = [48, plane.width - 40];
    expect(panels.slice(0, 12)).toEqual([26, 26, 26, 26, 26, 16].flatMap((length) => rows.map((width) => [length, width])));
    expect(panels).toHaveLength(24);
  });

  it('caps a metal gable roof with one vented ridge cap', () => {
    const config = shedSchema.parse({ ...gableSkid, roof: { ...gableSkid.roof, roofing: 'metal' } });
    const caps = finishesOf(config).filter((part) => part.layer === 'roofing' && part.shape.kind === 'panel');
    // The cap, and the vent gap on each side.
    expect(caps.map(({ look }) => look)).toEqual(['metal', 'plain', 'plain']);
  });

  it('closes a garage door RO with a slab of four sections each way', () => {
    const garage = PRESETS.find(({ openingTypes }) => openingTypes.some(({ kind }) => kind === 'overhead'))!;
    const [door] = withLook(finishesOf(garage), 'garage');
    // The slab's outline runs from its lower-left corner; the opposite corner is third.
    const [low, , high] = door.shape.kind === 'panel' ? door.shape.outline : [];
    expect(door.tile).toEqual([(high[0] - low[0]) / 4, (high[1] - low[1]) / 4]);
  });

  it('leaves the siding and its trim off with no siding', () => {
    const config = shedSchema.parse({ ...gableSkid, finishes: { siding: 'none' } });
    expect(finishesOf(config).filter((part) => part.layer === 'siding')).toEqual([]);
  });
});
