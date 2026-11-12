import { describe, expect, it } from 'vitest';
import { parseConfigText, serializeConfig, shedSchema, type ShedConfig } from '../src/core/config';
import { buildFinishes } from '../src/core/gen/finishes';
import { buildModel } from '../src/core/model';
import { naming } from '../src/core/naming';
import { buildBom } from '../src/core/out/bom';
import { buildCutList } from '../src/core/out/cutlist';
import { checkSpans } from '../src/core/out/spans';
import { pruneConfig } from '../src/core/prune';
import { buildDrawings } from '../src/drawings/sheets';
import { DESIGNS } from './designs';

const [gableSkid, leanToPier, garageSlab, bAndB] = DESIGNS;
const parse = (raw: object) => shedSchema.parse(JSON.parse(JSON.stringify(raw)));

// Everything the design builds, as text, so two designs compare in one step.
function built(config: ShedConfig) {
  const model = buildModel(config);
  const names = naming(config);
  const cutList = buildCutList(model.members, names);
  const marks = new Map(cutList.flatMap((line) => line.ids.map((id) => [id, line.mark] as const)));
  return JSON.stringify({
    warnings: model.warnings,
    cutList,
    bom: buildBom(config, model, marks),
    drawings: buildDrawings(config, model, names, marks),
    finishes: buildFinishes(config, model),
    spans: checkSpans(config, model, names),
  });
}

// Designs with settings they do not use set away from their defaults.
const MESSY: [string, ShedConfig][] = [
  [
    'a slab garage with skid, pier, floor, loft, and metal settings',
    parse({
      ...garageSlab,
      studHeight: 104.625,
      wallHeight: 130,
      foundation: {
        ...garageSlab.foundation,
        skid: { size: '6x6', count: 5 },
        pier: { diameter: 12, depth: 48, post: '4x4', postLength: 20, girder: '2x10', girderPlies: 3, girderCount: 3, maxSpacing: 60 },
        slab: { ...garageSlab.foundation.slab, thickenedEdge: false, edgeWidth: 20, edgeDepth: 20 },
      },
      floor: { joist: '2x8', oc: 12, treated: false, blocking: true, subfloor: 'ply-19/32' },
      openingTypes: [...garageSlab.openingTypes, { name: 'unplaced', kind: 'window', width: 30, height: 30, headroom: 20 }],
      roof: {
        ...garageSlab.roof,
        rakeOverhang: 1,
        rakeLadder: { size: '2x6', spacing: 16, ridgeExtends: false, fasciaLookouts: true, onEndRafter: true },
        highSide: 'front',
        purlin: '2x4',
        purlinSpacing: 30,
        collarTies: { enabled: false, size: '2x6', every: 3, height: 40 },
        loft: { enabled: false, joist: '2x8', oc: 12, support: 'hung', open: { end: 'left', length: 60 }, hatches: [{ x: 24, y: 24, width: 24, depth: 30 }] },
        kneeWalls: { enabled: true, height: 48, stud: '2x6' },
      },
      finishes: { siding: 'none', sidingColor: '#123456', panelLength: 200, metalOverhang: 5 },
      loads: { ...garageSlab.loads, loft: 'sleeping' },
    }),
  ],
  [
    'a lean-to roof with gable, loft, and slab settings',
    parse({
      ...leanToPier,
      walls: { ...leanToPier.walls, through: 'eaves', mudSill: '2x6' },
      foundation: { ...leanToPier.foundation, pier: { ...leanToPier.foundation.pier, post: 'none', postLength: 40 }, skid: { size: '4x4', count: 6 } },
      roof: {
        ...leanToPier.roof,
        ridge: '2x12',
        rakeLadder: { ...leanToPier.roof.rakeLadder, ridgeExtends: false },
        rafterTies: { enabled: true, size: '2x8', every: 2, height: 10 },
        collarTies: { enabled: true, size: '2x8', every: 2, height: 50 },
        loft: { ...leanToPier.roof.loft, enabled: true, joist: '2x10' },
        kneeWalls: { enabled: true, height: 40, stud: '2x6' },
      },
    }),
  ],
  [
    'a gable loft with rafter tie settings and a closed end',
    parse({
      ...bAndB,
      roof: {
        ...bAndB.roof,
        rafterTies: { enabled: true, size: '2x10', every: 3, height: 20 },
        loft: { ...bAndB.roof.loft, open: { end: 'none', length: 100 } },
      },
      additions: bAndB.additions.map((addition) => ({ ...addition, center: 20 })),
    }),
  ],
  [
    'skids with lean-tos on piers and on a slab',
    parse({
      ...gableSkid,
      foundation: { ...gableSkid.foundation, pier: { diameter: 12, depth: 40, aboveGrade: 10, girder: '2x12', girderCount: 4 }, slab: { thickness: 6, anchorSpacing: 40 } },
      additions: [
        { side: 'front', floor: 'none', roofing: 'sheathing', purlin: '2x4', purlinSpacing: 30, length: 72, center: 40, drop: 4 },
        { side: 'back', attach: 'extension', floor: 'slab', roofing: 'metal', drop: 6 },
      ],
    }),
  ],
  [
    'a gambrel loft with knee wall settings',
    parse({ ...bAndB, roof: { ...bAndB.roof, style: 'gambrel', pitch: 6, gambrel: { lowerPitch: 18, breakRun: 30 } } }),
  ],
  ['a gable with gambrel settings', parse({ ...gableSkid, roof: { ...gableSkid.roof, gambrel: { lowerPitch: 30, breakRun: 20 } } })],
  [
    'a gambrel without a ridge board, with ridge settings',
    parse({ ...gableSkid, roof: { ...gableSkid.roof, style: 'gambrel', ridge: '2x10', rakeLadder: { ridgeExtends: false }, gambrel: { ridgeBoard: false } } }),
  ],
  ['square tails with a fascia top setting', parse({ ...gableSkid, roof: { ...gableSkid.roof, tailCut: 'square', fasciaTop: 'flush' } })],
  [
    'square main tails and a lean-to fascia',
    parse({ ...gableSkid, roof: { ...gableSkid.roof, tailCut: 'square', fasciaTop: 'beveled' }, additions: [{ side: 'front' }] }),
  ],
];

describe('pruning unused settings', () => {
  it.each([...DESIGNS.map((design) => [design.name, design] as const), ...MESSY])('%s builds the same shed after pruning', (_name, design) => {
    // Pruned, then saved and loaded back, as a file or link carries it.
    const loaded = parseConfigText(serializeConfig(pruneConfig(design)));
    expect(loaded.ok && built(loaded.config)).toBe(built(design));
  });

  it('resets the foundation types and floor a slab does not use', () => {
    const [, design] = MESSY[0];
    const pruned = pruneConfig(design);
    const defaults = shedSchema.parse({ schemaVersion: 1 });
    expect(pruned.foundation.skid).toEqual(defaults.foundation.skid);
    expect(pruned.foundation.pier).toEqual(defaults.foundation.pier);
    expect(pruned.floor).toEqual(defaults.floor);
    expect(pruned.roof.loft).toEqual(defaults.roof.loft);
    expect(pruned.openingTypes.map(({ name }) => name)).not.toContain('unplaced');
  });

  it('keeps the fascia top only where a plumb fascia uses it, on the main roof or a lean-to', () => {
    const fasciaTop = (name: string) => pruneConfig(MESSY.find(([messy]) => messy === name)![1]).roof.fasciaTop;
    expect(fasciaTop('square tails with a fascia top setting')).toBe('set-down');
    expect(fasciaTop('square main tails and a lean-to fascia')).toBe('beveled');
  });

  it('keeps the gambrel settings only on a gambrel, which takes no knee walls', () => {
    const defaults = shedSchema.parse({ schemaVersion: 1 });
    const gambrel = pruneConfig(MESSY[4][1]).roof;
    expect(gambrel.gambrel).toEqual({ lowerPitch: 18, breakRun: 30, ridgeBoard: true });
    expect(gambrel.kneeWalls).toEqual(defaults.roof.kneeWalls);
    expect(pruneConfig(MESSY[5][1]).roof.gambrel).toEqual(defaults.roof.gambrel);
    // Without a ridge board, the ridge size and the ridge-extends choice go back to their defaults.
    const peaked = pruneConfig(MESSY[6][1]).roof;
    expect([peaked.ridge, peaked.rakeLadder.ridgeExtends]).toEqual([defaults.roof.ridge, defaults.roof.rakeLadder.ridgeExtends]);
  });

  it("keeps the pier settings a lean-to's posts stand on", () => {
    const [, design] = MESSY[3];
    expect(pruneConfig(design).foundation.pier).toMatchObject({ diameter: 12, depth: 40, aboveGrade: 10, girder: '2x8' });
  });
});
