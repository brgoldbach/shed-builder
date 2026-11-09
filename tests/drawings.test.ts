import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import type { Member, Point } from '../src/core/member';
import { buildModel } from '../src/core/model';
import { naming } from '../src/core/naming';
import { PRESETS } from '../src/core/presets';
import { bounds, shapesOf, type Dimension, type Drawing } from '../src/drawings/drawing';
import { buildDrawings } from '../src/drawings/sheets';

const [gableSkid, leanToPier] = PRESETS;
const drawingsOf = (config = gableSkid) => buildDrawings(config, buildModel(config), naming(config), new Map());
const find = (drawings: Drawing[], id: string) => drawings.find((drawing) => drawing.id === id)!;
const ofKind = <K extends Dimension['kind']>(drawing: Drawing, kind: K) =>
  drawing.dims.filter((dim): dim is Extract<Dimension, { kind: K }> => dim.kind === kind);
const length = ({ from, to }: { from: Point; to: Point }) => Math.hypot(to[0] - from[0], to[1] - from[1]);
// Slope length per inch of run at 6/12.
const SLOPE = Math.hypot(1, 0.5);

describe('projection', () => {
  it('projects a box member to its rectangle', () => {
    const member: Member = {
      id: 'X',
      assembly: 'floor',
      role: 'joist.floor',
      size: '2x4',
      treated: false,
      length: 10,
      origin: [2, 3, 0],
      axes: { length: [1, 0, 0], width: [0, 1, 0], thick: [0, 0, 1] },
    };
    const view = { origin: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] } as const;
    const [shape] = shapesOf(view, [member], [], new Map());
    expect(shape.outline.kind === 'polygon' && shape.outline.points).toHaveLength(4);
    expect(bounds([shape])).toEqual({ min: [2, 3], max: [12, 6.5] });
  });

  it('keeps the birdsmouth of a rafter seen square to its face', () => {
    const rafter = find(drawingsOf(), 'rafter').shapes[0];
    // Tail, heel, seat, ridge plumb cut, and top edge: 7 corners.
    expect(rafter.outline.kind === 'polygon' && rafter.outline.points).toHaveLength(7);
  });
});

describe('model openings', () => {
  it('records each fitted RO in its wall frame', () => {
    expect(buildModel(gableSkid).openings).toEqual([
      { wall: 'front', name: 'window 24x36', left: 48, right: 72, bottom: 46.25, top: 82.25 },
      // 50% of the 96 in end wall, 64 in wide.
      { wall: 'left', name: 'shed door 64x76', left: 16, right: 80, bottom: 0, top: 76 },
    ]);
  });
});

describe('wall elevation', () => {
  const front = find(drawingsOf(), 'wall-front');

  it('runs the layout from the left end of the bottom plate', () => {
    // Studs at 16 in o.c.; kings 1 jack out from the 48 to 72 RO; a cripple at 63-1/4 under the sill.
    expect(ofKind(front, 'running')).toEqual([
      { kind: 'running', side: 'bottom', tier: 1, origin: 0, at: [15.25, 31.25, 45, 63.25, 73.5, 79.25, 95.25, 111.25] },
    ]);
  });

  it('chains the RO edges, then the wall length and height', () => {
    expect(ofKind(front, 'chain')).toEqual([
      { kind: 'chain', side: 'bottom', tier: 2, at: [0, 48, 72, 120] },
      { kind: 'chain', side: 'bottom', tier: 3, at: [0, 120], feet: true },
      { kind: 'chain', side: 'right', tier: 1, at: [0, 97.125], feet: true },
    ]);
  });

  it('sizes the RO inside the opening: width, sill height, height', () => {
    expect(ofKind(front, 'aligned').map(length)).toEqual([24, 46.25, 36]);
    expect(front.labels).toEqual([{ at: [60, 64.25], text: 'window 24x36' }]);
  });
});

describe('rafter detail', () => {
  const rafter = find(drawingsOf(), 'rafter');
  const aligned = ofKind(rafter, 'aligned').map(length);

  it('dimensions the top edge from the tail to the heel line to the ridge', () => {
    // Runs of 12 (eave overhang) and 47-1/4 (heel line to the ridge face), along the slope.
    expect(aligned[0]).toBeCloseTo(12 * SLOPE, 6);
    expect(aligned[1]).toBeCloseTo(47.25 * SLOPE, 6);
  });

  it('dimensions the birdsmouth seat and heel', () => {
    // 2x4 at 6/12: the seat stops at 1/3 of the depth, 41/16; heel = seat × 6/12.
    expect(aligned).toHaveLength(4);
    expect(aligned[2]).toBeCloseTo(2.5625, 9);
    expect(aligned[3]).toBeCloseTo(1.28125, 9);
  });
});

describe('building section', () => {
  const section = find(drawingsOf(), 'section');

  it('cuts at the rafter pair nearest the middle', () => {
    expect(section.notes[0]).toMatch(/^Through the rafters 48" from the left end/);
    expect(section.shapes.filter((shape) => shape.role === 'rafter')).toHaveLength(2);
    expect(section.shapes.filter((shape) => shape.cut).map((shape) => shape.role)).toContain('ridge');
  });

  it('chains the floor framing, wall, and roof heights', () => {
    const [heights] = ofKind(section, 'chain');
    // Skid bottom: 23/32 subfloor, 5-1/2 joist, 5-1/2 skid on edge. Ridge: rafter top at the ridge face.
    expect(heights.at.slice(0, 3)).toEqual([-11.71875, 0, 97.125]);
    expect(heights.at[3]).toBeCloseTo(97.125 + 0.5 * (47.25 - 2.5625) + 3.5 * SLOPE, 6);
  });
});

describe('foundation plan', () => {
  it('chains the pier lines and pier centers', () => {
    // 10x12 on piers: girders at 5, 60, 115; piers at 5, 72, 139.
    const plan = find(drawingsOf(leanToPier), 'foundation');
    expect(ofKind(plan, 'chain').slice(0, 2)).toEqual([
      { kind: 'chain', side: 'right', tier: 1, at: [0, 5, 60, 115, 120] },
      { kind: 'chain', side: 'bottom', tier: 1, at: [0, 5, 72, 139, 144] },
    ]);
  });
});

describe('gable front', () => {
  const config = shedSchema.parse({ ...gableSkid, front: 'gable' });
  const drawings = drawingsOf(config);

  it('lists the elevations from the user front', () => {
    const walls = drawings.filter((drawing) => drawing.id.startsWith('wall-'));
    expect(walls.map((drawing) => [drawing.id, drawing.title])).toEqual([
      ['wall-left', 'Front wall, from outside'],
      ['wall-right', 'Back wall, from outside'],
      ['wall-back', 'Left wall, from outside'],
      ['wall-front', 'Right wall, from outside'],
    ]);
  });

  it('turns the plans so the front is at the bottom', () => {
    // The joists now run left to right, so their layout climbs the left side from the front.
    const [layout] = ofKind(find(drawings, 'floor'), 'running');
    expect(layout).toMatchObject({ side: 'left', origin: 0, at: [15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 118.5] });
  });
});
