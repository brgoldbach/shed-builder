import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import type { Member, Point } from '../src/core/member';
import { buildModel } from '../src/core/model';
import { naming } from '../src/core/naming';
import { PRESETS } from '../src/core/presets';
import { bounds, shapesOf, type Dimension, type Drawing } from '../src/drawings/drawing';
import { buildDrawings } from '../src/drawings/sheets';
import { DESIGNS } from './designs';
import { formatInches } from '../src/core/units';

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
      { wall: 'front', name: 'window 24x36', left: 48, right: 72, bottom: 46.25, top: 82.25, header: { size: '2x8', plies: 2, flat: false } },
      // 50% of the 96 in end wall, 64 in wide.
      { wall: 'left', name: 'shed door 64x76', left: 16, right: 80, bottom: 0, top: 76, header: { size: '2x8', plies: 2, flat: false } },
    ]);
  });
});

describe('wall elevation', () => {
  const front = find(drawingsOf(), 'wall-front');

  it('runs the layout from the left end of the bottom plate', () => {
    // The eave wall fits between the end walls, so its plate starts at 3-1/2. Studs at 16 in o.c.
    // from the corner; kings 1 jack out from the 48 to 72 RO; a cripple at 63-1/4 under the sill.
    expect(ofKind(front, 'running')).toEqual([
      { kind: 'running', side: 'bottom', tier: 1, origin: 3.5, at: [15.25, 31.25, 45, 63.25, 73.5, 79.25, 95.25, 111.25] },
    ]);
  });

  it('chains the RO edges, then the wall length and height', () => {
    expect(ofKind(front, 'chain')).toEqual([
      { kind: 'chain', side: 'bottom', tier: 2, at: [3.5, 48, 72, 116.5] },
      { kind: 'chain', side: 'bottom', tier: 3, at: [3.5, 116.5], feet: true },
      { kind: 'chain', side: 'right', tier: 1, at: [0, 97.125], feet: true },
    ]);
  });

  it('sizes the RO inside the opening: width, sill height, height', () => {
    expect(ofKind(front, 'aligned').map(length)).toEqual([24, 46.25, 36]);
    expect(front.labels).toEqual([{ at: [60, 64.25], text: 'window 24x36', room: 24 }]);
  });

  it('shows the adjacent walls end-on at the corners, for reference', () => {
    const left = find(drawingsOf(), 'wall-left');
    const walls = left.shapes.filter((shape) => shape.kind === 'context');
    // The eave walls' caps lap over the end wall's top plate at each corner, 95-5/8 to 97-1/8 up.
    expect(walls.map((shape) => bounds([shape]))).toEqual([
      { min: [92.5, 95.625], max: [96, 97.125] },
      { min: [0, 95.625], max: [3.5, 97.125] },
    ]);
  });
});

describe('panel sheets', () => {
  const raised = shedSchema.parse({
    ...gableSkid,
    roof: { ...gableSkid.roof, loft: { enabled: true, joist: '2x6', oc: 16 }, kneeWalls: { enabled: true, height: 36 } },
  });
  const drawings = drawingsOf(raised);

  it('gives each panel its own sheet, in build order', () => {
    expect(drawings.map((drawing) => drawing.id)).toEqual([
      'foundation', 'floor', 'wall-front', 'wall-back', 'wall-left', 'wall-right',
      'gable-left', 'gable-right', 'loft', 'knee-front', 'knee-back', 'roof', 'section', 'rafter', 'cut-lengths',
    ]);
  });

  it('draws a wall without the panel above it', () => {
    expect(bounds(find(drawings, 'wall-front').shapes).max[1]).toBe(97.125);
  });

  it('draws the loft rim, dashed, and the deck edge under a knee wall', () => {
    const { shapes } = find(drawings, 'knee-front');
    // The rim on the wall top at 97-1/8, 5-1/2 deep, out to the corners at the platform ends. The
    // deck's edge on top: two sheets, 23/32 thick, under the knee wall at 103-11/32.
    expect(shapes.filter((shape) => shape.role === 'rim.loft').map((shape) => [shape.kind, bounds([shape])])).toEqual([
      ['context', { min: [0, 97.125], max: [120, 102.625] }],
    ]);
    expect(shapes.filter((shape) => shape.kind === 'sheet').map((shape) => bounds([shape]))).toEqual([
      { min: [0, 102.625], max: [96, 103.34375] },
      { min: [96, 102.625], max: [120, 103.34375] },
    ]);
  });

  it("lays out a gable cut in place from the end wall's bottom plate", () => {
    const gable = find(drawingsOf(), 'gable-left');
    expect(gable.dims).toEqual([
      { kind: 'running', side: 'bottom', tier: 1, origin: 0, at: [15.25, 31.25, 63.25, 79.25] },
      { kind: 'chain', side: 'bottom', tier: 2, at: [0, 96], feet: true },
      // From the end wall's top plate to the peak.
      { kind: 'chain', side: 'right', tier: 1, at: [97.125, 119], feet: true },
    ]);
    // Dashed: the end wall's top and cap plates, and the end rafters.
    expect(gable.shapes.filter((shape) => shape.kind === 'context').map((shape) => shape.role)).toEqual(['plate.top', 'plate.cap', 'rafter', 'rafter']);
  });

  it('lays out a gable panel from its own bottom plate', () => {
    const config = shedSchema.parse({ ...gableSkid, roof: { ...gableSkid.roof, gablePanel: true } });
    const [layout, length] = find(drawingsOf(config), 'gable-left').dims;
    // The plate stops where the 2x6 end rafters clear it, 6-1/2 in from each corner. Under them the
    // studs at 15-1/4 and 79-1/4 would be shorter than 3 in, so they are left out.
    expect(layout).toMatchObject({ origin: 6.5, at: [31.25, 63.25] });
    expect(length).toMatchObject({ at: [6.5, 89.5] });
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
    // 2x6 at 6/12: the seat takes the full 3-1/2 wall depth, under 1/3 of the depth; heel = seat × 6/12.
    expect(aligned).toHaveLength(5);
    expect(aligned[2]).toBeCloseTo(3.5, 9);
    expect(aligned[3]).toBeCloseTo(1.75, 9);
  });

  it('dimensions the cut length long point to long point, along the rafter', () => {
    // The tail and ridge plumb cuts are parallel, so the long points sit on opposite edges.
    const { from, to, along } = ofKind(rafter, 'aligned')[4];
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    expect(formatInches(Math.abs(dx * along![0] + dy * along![1]) / Math.hypot(...along!))).toBe('69"');
  });
});

describe('gambrel rafter detail', () => {
  const config = shedSchema.parse({ ...gableSkid, roof: { ...gableSkid.roof, style: 'gambrel', rafter: '2x6' } });
  const rafter = find(drawingsOf(config), 'rafter');

  it('draws the lower and upper rafters, and the gusset dashed over the break', () => {
    expect(rafter.title).toBe('Gambrel rafters');
    expect(rafter.shapes.map(({ role }) => role)).toEqual(['rafter', 'rafter.upper']);
    // A common pair's gusset: its lower edge runs straight across the joint.
    expect(rafter.outlines).toHaveLength(1);
    expect(rafter.outlines[0]).toHaveLength(5);
  });

  it("dimensions the gusset's 12 in reach along each top edge from the break", () => {
    const reaches = ofKind(rafter, 'aligned').filter(({ offset }) => offset === 40).map(length);
    expect(reaches).toEqual([expect.closeTo(12, 9), expect.closeTo(12, 9)]);
  });
});

describe('gusset sheet', () => {
  const config = shedSchema.parse({ ...gableSkid, roof: { ...gableSkid.roof, style: 'gambrel', rafter: '2x6' } });
  const sheet = find(drawingsOf(config), 'gussets');

  it('draws the common and gable-end gussets, each edge dimensioned', () => {
    expect(sheet.shapes.map(({ outline }) => (outline.kind === 'polygon' ? outline.points.length : 0))).toEqual([5, 6]);
    expect(ofKind(sheet, 'aligned')).toHaveLength(11);
    // 12 in along each top edge, and square across the 5-1/2 in rafter depth at each end.
    const edges = ofKind(sheet, 'aligned').map(length).map((value) => formatInches(value));
    expect(edges.filter((text) => text === '12"')).toHaveLength(4);
    expect(edges.filter((text) => text === '5-1/2"')).toHaveLength(4);
  });

  it('gives the counts and the angle where the top edges meet', () => {
    // 8x10: 4 common rafter pairs a side, two faces each; a gable-end rafter at each end of each side.
    expect(sheet.notes).toContain(
      'At the break: the top edges meet at 147.5°. Left: 16 for the common rafters, one on each face of each pair. Right: 4 for the gable-end rafters, on the inside face.',
    );
  });

  it('adds a row for the peak gussets without a ridge board', () => {
    const peaked = shedSchema.parse({ ...config, roof: { ...config.roof, gambrel: { ...config.roof.gambrel, ridgeBoard: false } } });
    const rows = find(drawingsOf(peaked), 'gussets');
    expect(rows.shapes).toHaveLength(4);
    expect(rows.notes).toContain(
      'At the peak (bottom row): the top edges meet at 126.9°. Left: 8 for the common rafters, one on each face of each pair. Right: 2 for the gable-end rafters, on the inside face.',
    );
  });

  it('is left out on a gable roof', () => {
    expect(drawingsOf().some(({ id }) => id === 'gussets')).toBe(false);
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
    expect(heights.at[3]).toBeCloseTo(97.125 + 0.5 * (47.25 - 3.5) + 5.5 * SLOPE, 6);
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

describe('lean-to deck note', () => {
  it('names the deck boards the design uses', () => {
    const loftShed = DESIGNS.find(({ name }) => name === '10x16 loft shed')!;
    const note = (design: typeof loftShed) => find(drawingsOf(design), 'decks').notes.find((text) => text.includes('lean-to deck'));
    expect(note(loftShed)).toBe('Back lean-to deck: PT 2x6 joists at 16" o.c., 5/4x6 deck boards, on piers.');
    const additions = loftShed.additions.map((addition) => ({ ...addition, deck: { ...addition.deck, boards: '2x6' as const } }));
    expect(note(shedSchema.parse({ ...loftShed, additions }))).toContain('2x6 deck boards');
  });
});

describe('gable base bracing notes', () => {
  const notes = (roof: object) => find(drawingsOf(shedSchema.parse({ ...gableSkid, roof: { ...gableSkid.roof, ...roof } })), 'gable-left').notes;
  const loose = "No floor or deck braces the gable's base at the end wall's top plate. Brace it, and have the bracing checked.";

  it('asks for bracing where no loft deck reaches the gable: no loft, or an open loft end', () => {
    expect(notes({})).toContain(loose);
    expect(notes({ rafterTies: { enabled: false }, loft: { enabled: true, open: { end: 'left', length: 48 } } })).toContain(loose);
  });

  it('needs no note at a closed loft end, where the gable stands on the deck', () => {
    for (const support of ['plates', 'hung']) {
      expect(notes({ rafterTies: { enabled: false }, loft: { enabled: true, support } })).not.toContain(loose);
    }
  });
});
