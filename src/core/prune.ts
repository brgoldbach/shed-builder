import { shedSchema, type ShedConfig } from './config';
import { rampPlace } from './gen/ramps';

const LADDER = 1.5; // the shortest rake overhang that frames a rake ladder, as in gen/roof.ts

const omit = <T extends object>(value: T, keys: (keyof T)[]): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key as keyof T))) as Partial<T>;

/**
 * The design with each setting it does not use back at its default, and the opening types that no
 * row places left out. It builds the same shed: the same framing, cut list, BOM, drawings, and
 * finishes. Saved files and links carry it, so they hold only what the design uses.
 */
export function pruneConfig(config: ShedConfig): ShedConfig {
  const { foundation, walls, roof, additions, finishes, loads } = config;
  const gable = roof.style === 'gable';
  const loft = gable && roof.loft.enabled;
  const anyMetal = roof.roofing !== 'shingles' || additions.some(({ roofing }) => roofing === 'metal');
  // Open metal roofing has no sheathing; a lean-to without metal takes the main roof's.
  const sheathed = roof.roofing !== 'metal' || additions.some(({ roofing }) => roofing !== 'metal');
  // Lean-to posts stand on piers or a slab sized by the main foundation's settings.
  const leanToPiers = additions.some(({ floor }) => floor !== 'slab');
  const leanToSlab = additions.some(({ floor }) => floor === 'slab');
  const placed = new Set(config.openings.map(({ type }) => type));

  const pier = foundation.pier.post === 'none' ? omit(foundation.pier, ['postLength']) : foundation.pier;
  const slab = foundation.slab.thickenedEdge ? foundation.slab : omit(foundation.slab, ['edgeWidth', 'edgeDepth']);
  const raw = {
    ...omit(config, ['wallHeight', 'foundation', 'floor', 'walls', 'openingTypes', 'roof', 'additions', 'finishes', 'loads']),
    ...(config.studHeight === 'custom' && { wallHeight: config.wallHeight }),
    foundation: {
      type: foundation.type,
      ...(foundation.type === 'skid' && { skid: foundation.skid }),
      ...(foundation.type === 'pier' ? { pier } : leanToPiers && { pier: { diameter: pier.diameter, depth: pier.depth, aboveGrade: pier.aboveGrade } }),
      ...(foundation.type === 'slab' ? { slab } : leanToSlab && { slab: { thickness: slab.thickness } }),
    },
    ...(foundation.type !== 'slab' && { floor: config.floor }),
    walls: omit(walls, [...(foundation.type === 'slab' ? [] : ['mudSill' as const]), ...(gable ? [] : ['through' as const])]),
    openingTypes: config.openingTypes
      .filter(({ name }) => placed.has(name))
      .map((type) => (type.kind === 'overhead' ? type : omit(type, ['headroom']))),
    roof: {
      ...omit(roof, ['sheathing', 'purlin', 'purlinSpacing', 'rakeLadder', 'ridge', 'highSide', 'rafterTies', 'collarTies', 'loft', 'kneeWalls']),
      ...(sheathed && { sheathing: roof.sheathing }),
      ...(roof.roofing !== 'shingles' && { purlin: roof.purlin, purlinSpacing: roof.purlinSpacing }),
      ...(roof.rakeOverhang >= LADDER && { rakeLadder: gable ? roof.rakeLadder : omit(roof.rakeLadder, ['ridgeExtends']) }),
      ...(gable ? { ridge: roof.ridge } : { highSide: roof.highSide }),
      // Loft joists take the place of rafter ties.
      ...(gable && !loft && { rafterTies: roof.rafterTies.enabled ? roof.rafterTies : { enabled: false } }),
      ...(gable && { collarTies: roof.collarTies.enabled ? roof.collarTies : { enabled: false } }),
      ...(loft && {
        loft: { ...roof.loft, open: roof.loft.open.end === 'none' ? { end: 'none' } : roof.loft.open },
        kneeWalls: roof.kneeWalls.enabled ? roof.kneeWalls : { enabled: false },
      }),
    },
    additions: additions.map((addition) =>
      omit(addition, [
        ...(addition.roofing === 'metal' ? [] : ['purlin' as const, 'purlinSpacing' as const]),
        ...(addition.length === 'full' ? ['center' as const] : []),
        ...(addition.attach === 'extension' ? ['drop' as const] : []),
        ...(addition.floor === 'deck' ? [] : ['deck' as const]),
      ]),
    ),
    // A ramp that follows an opening takes its place and width from it. One whose opening is gone
    // keeps its own place, and its link for the warning.
    ramps: config.ramps.map((ramp) =>
      omit(ramp, [
        ...(ramp.opening === null ? (['opening', 'margin'] as const) : rampPlace(config, ramp).lost ? (['margin'] as const) : (['wall', 'along', 'at', 'width'] as const)),
        ...(ramp.material === 'concrete' ? (['stringer', 'oc'] as const) : (['thickness'] as const)),
      ]),
    ),
    finishes: omit(finishes, [
      ...(finishes.siding === 'none' ? ['sidingColor' as const] : []),
      ...(anyMetal ? [] : ['panelLength' as const, 'metalOverhang' as const]),
    ]),
    loads: loft ? loads : omit(loads, ['loft']),
  };
  return shedSchema.parse(raw);
}
