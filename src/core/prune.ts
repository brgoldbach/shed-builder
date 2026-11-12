import { hasRidgeBoard, OPPOSITE, ridged, shedSchema, usesFasciaTop, type ShedConfig } from './config';
import { leanToFloorOn, onShed } from './gen/deck';
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
  const gable = ridged(roof);
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
      ...omit(roof, ['fasciaTop', 'gambrel', 'sheathing', 'purlin', 'purlinSpacing', 'rakeLadder', 'ridge', 'highSide', 'rafterTies', 'collarTies', 'loft', 'kneeWalls']),
      ...(roof.style === 'gambrel' && { gambrel: roof.gambrel }),
      ...(usesFasciaTop(config) && { fasciaTop: roof.fasciaTop }),
      ...(sheathed && { sheathing: roof.sheathing }),
      ...(roof.roofing !== 'shingles' && { purlin: roof.purlin, purlinSpacing: roof.purlinSpacing }),
      ...(roof.rakeOverhang >= LADDER && { rakeLadder: hasRidgeBoard(roof) ? roof.rakeLadder : omit(roof.rakeLadder, ['ridgeExtends']) }),
      ...(hasRidgeBoard(roof) && { ridge: roof.ridge }),
      ...(!gable && { highSide: roof.highSide }),
      // Loft joists take the place of rafter ties.
      ...(gable && !loft && { rafterTies: roof.rafterTies.enabled ? roof.rafterTies : { enabled: false } }),
      ...(gable && { collarTies: roof.collarTies.enabled ? roof.collarTies : { enabled: false } }),
      ...(loft && {
        loft: { ...roof.loft, open: roof.loft.open.end === 'none' ? { end: 'none' } : roof.loft.open },
        // A gambrel takes no knee walls.
        ...(roof.style === 'gable' && { kneeWalls: roof.kneeWalls.enabled ? roof.kneeWalls : { enabled: false } }),
      }),
    },
    additions: additions.map((addition) => {
      const kept = omit(addition, [
        ...(addition.roofing === 'metal' ? [] : ['purlin' as const, 'purlinSpacing' as const]),
        ...(addition.length === 'full' ? ['center' as const] : []),
        ...(addition.attach === 'extension' ? ['drop' as const, 'oc' as const] : []),
        ...(addition.floor === 'deck' ? [] : ['deck' as const]),
      ]);
      if (addition.floor !== 'deck') return kept;
      // Only a deck on the shed's foundation has a support other than piers, a slab shed's
      // included, and only a gable-end one has a join.
      const shed = onShed(config, addition);
      const sides = addition.mirror ? [addition.side, OPPOSITE[addition.side]] : [addition.side];
      const gable = sides.some((side) => side === 'left' || side === 'right');
      const deck = omit(addition.deck, [
        ...(shed ? [] : (['support'] as const)),
        ...(shed && gable ? [] : (['join'] as const)),
      ]);
      return { ...kept, deck };
    }),
    // A ramp that follows an opening takes its place and width from it. One whose opening is gone
    // keeps its own place, and its link for the warning. Stairs take no ramp settings. Only a ramp
    // on a wall with a lean-to deck or slab can start at it. Only the built model knows whether the
    // deck or slab meets it, so `belowGrade` and `from` stay where it might.
    ramps: config.ramps.map((ramp) => {
      const floor = leanToFloorOn(config, rampPlace(config, ramp).wall);
      return omit(ramp, [
        ...(ramp.opening === null ? (['opening', 'margin'] as const) : rampPlace(config, ramp).lost ? (['margin'] as const) : (['wall', 'along', 'at', 'width'] as const)),
        ...(ramp.kind === 'stairs'
          ? (['slope', 'material', 'stringer', 'oc', 'thickness'] as const)
          : ramp.material === 'concrete'
            ? (['stringer', 'oc'] as const)
            : (['thickness'] as const)),
        ...(floor ? [] : (['from'] as const)),
      ]);
    }),
    finishes: omit(finishes, [
      ...(finishes.siding === 'none' ? ['sidingColor' as const] : []),
      ...(anyMetal ? [] : ['panelLength' as const, 'metalOverhang' as const]),
    ]),
    loads: loft ? loads : omit(loads, ['loft']),
  };
  return shedSchema.parse(raw);
}
