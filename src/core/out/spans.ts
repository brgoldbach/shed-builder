import { LUMBER, SPECIES, bendingValue, type LumberSize, type Species } from '../catalog';
import type { ShedConfig } from '../config';
import type { RoughOpening } from '../gen/walls';
import { corners, type Member, type Warning } from '../member';
import type { Model } from '../model';
import { capitalize, type Naming } from '../naming';
import { formatLength } from '../units';

// Load cases, psf, from AWC Span Tables for Joists and Rafters 2021, Tables A-1 to A-4.
export const FLOOR = { live: 40, dead: 10, limit: 360 }; // F-2: rooms other than sleeping areas
export const LOFT = {
  storage: { live: 20, dead: 10, limit: 240 }, // C-2: limited attic storage
  sleeping: { live: 30, dead: 10, limit: 360 }, // F-1: sleeping areas and attic floors
};
const RAFTER_LIMIT = 180; // R-13 to R-24: no drywall ceiling on the rafters
const WALL_DEAD = 10; // psf of wall face above a header or on a girder: framing and sheathing
const REPETITIVE = 1.15; // Cr, NDS 2018 Supplement Table 4A adjustment factors
const PLY = 1.5;

/** One member checked against its allowable span. Lengths in inches. */
export interface SpanCheck {
  member: string;
  lumber: string;
  span: number;
  allowed: number | null; // null: no design values for the size
  governs: 'bending' | 'deflection' | 'shear' | null;
  basis: string;
}

interface Beam {
  breadth: number; // b, in
  depth: number; // d, in
  fb: number; // psi, adjusted
  fv: number | null; // psi, adjusted; null: no shear check, as in the joist and rafter tables
  e: number; // psi
  total: number; // plf
  live: number; // plf, for deflection
  limit: number; // L/limit
}

/** The longest simple span, in inches, for a uniform load, and what limits it. */
export function allowedSpan({ breadth, depth, fb, fv, e, total, live, limit }: Beam): { span: number; governs: SpanCheck['governs'] } {
  const [w, wLive] = [total / 12, live / 12]; // lb/in
  const section = (breadth * depth ** 2) / 6;
  const inertia = (breadth * depth ** 3) / 12;
  const spans = {
    // AWC Span Tables 2021, Eq. A.3.1-1: M = wL²/8 against Fb·S.
    bending: Math.sqrt((8 * fb * section) / w),
    // Eq. A.1-2: 5wL⁴/384EI ≤ L/limit, under live load.
    deflection: wLive > 0 ? Math.cbrt((384 * e * inertia) / (5 * wLive * limit)) : Infinity,
    // Rectangular section: 1.5V/bd ≤ Fv, with V = wL/2.
    shear: fv === null ? Infinity : (4 * fv * breadth * depth) / (3 * w),
  };
  const governs = (Object.keys(spans) as (keyof typeof spans)[]).reduce((least, key) => (spans[key] < spans[least] ? key : least));
  return { span: spans[governs], governs };
}

const extentOf = (members: readonly Member[], axis: 0 | 1 | 2) => {
  const values = members.flatMap((member) => corners(member).map((point) => point[axis]));
  return [Math.min(...values), Math.max(...values)] as const;
};

/**
 * Allowable span of joists or rafters, in inches: AWC Span Tables method, with the repetitive
 * member factor and the load duration factor on Fb, and no shear check.
 */
export function joistSpan(
  species: Species,
  size: LumberSize,
  oc: number,
  { live, dead, limit }: { live: number; dead: number; limit: number },
  duration: number,
): { span: number; governs: SpanCheck['governs'] } | null {
  const fb = bendingValue(species, size);
  if (fb === null) return null;
  const { thick, width: depth } = LUMBER[size];
  const feet = oc / 12;
  return allowedSpan({ breadth: thick, depth, fb: fb * REPETITIVE * duration, fv: null, e: SPECIES[species].e, total: (live + dead) * feet, live: live * feet, limit });
}

/** Spans of rafters, joists, headers, and pier girders against the species' allowable spans. */
export function checkSpans(config: ShedConfig, model: Model, names: Naming): SpanCheck[] {
  const { roof, floor, loads, catalog, foundation, width } = config;
  const species = SPECIES[catalog.species];
  const roofLabel = `${loads.roof} psf roof ${loads.roof === 20 ? 'live' : 'snow'} + ${loads.roofDead} psf dead`;
  // AWC Span Tables 2021, A.9: load duration 1.25 for roof live (7 days), 1.15 for snow (2 months).
  const roofDuration = loads.roof === 20 ? 1.25 : 1.15;
  const wallDepth = LUMBER[config.walls.stud].width;
  const checks: SpanCheck[] = [];
  const has = (role: Member['role']) => model.members.some((member) => member.role === role);

  const joists = (member: string, size: LumberSize, oc: number, span: number, load: { live: number; dead: number; limit: number }, duration: number, basis: string) => {
    const result = joistSpan(catalog.species, size, oc, load, duration);
    checks.push({ member, lumber: `${size} at ${oc}" o.c.`, span, allowed: result?.span ?? null, governs: result?.governs ?? null, basis });
  };

  const rafterLoad = { live: loads.roof, dead: loads.roofDead, limit: RAFTER_LIMIT };
  for (const { member, span } of model.rafterSpans) {
    joists(member, roof.rafter, roof.oc, span, rafterLoad, roofDuration, `${roofLabel}, L/${RAFTER_LIMIT}`);
  }

  if (has('joist.floor')) {
    // Clear span between the skid or girder lines under the joists.
    const lines = mergeRanges(
      // The shed's own lines: a lean-to deck's skids and girders are its own.
      model.members.filter(({ role, assembly }) => (role === 'skid' || role === 'girder') && assembly === 'foundation').map((member) => extentOf([member], 1)),
    );
    const span = Math.max(...lines.slice(1).map(([low], index) => low - lines[index][1]));
    joists('Floor joists', floor.joist, floor.oc, span, FLOOR, 1, `${FLOOR.live} psf live + ${FLOOR.dead} psf dead, L/${FLOOR.limit}`);
  }

  const loft = roof.loft.enabled && has('joist.loft') ? LOFT[loads.loft] : null;
  // Clear span between the eave-wall plates, or between the ledgers.
  const loftSpan = width - 2 * (wallDepth + (roof.loft.support === 'hung' ? PLY : 0));
  if (loft) {
    joists('Loft joists', roof.loft.joist, roof.loft.oc, loftSpan, loft, 1, `${loft.live} psf live + ${loft.dead} psf dead, L/${loft.limit}`);
  }

  // Beams carry plf loads with no repetitive member factor. A beam under loft or floor live load
  // takes the normal load duration.
  const beam = (member: string, lumber: string, size: LumberSize, breadth: number, depth: number, span: number, load: { total: number; live: number; floorLive: boolean }, limit: number, basis: string) => {
    const fb = bendingValue(catalog.species, size);
    const duration = load.floorLive ? 1 : roofDuration;
    const result =
      fb === null
        ? null
        : allowedSpan({ breadth, depth, fb: fb * duration, fv: species.fv * duration, e: species.e, total: load.total, live: load.live, limit });
    checks.push({ member, lumber, span, allowed: result?.span ?? null, governs: result?.governs ?? null, basis });
  };

  // Tributary roof per foot of wall: half the run plus the overhang on an eave wall, half a rafter
  // space plus the rake overhang on an end wall.
  const rake = roof.rakeOverhang >= PLY ? roof.rakeOverhang : 0;
  const roofWidth = (wall: RoughOpening['wall']) => (wall === 'front' || wall === 'back' ? width / 2 + roof.eaveOverhang : roof.oc / 2 + rake);
  const eaveLoad = (wall: 'front' | 'back' | 'left' | 'right', wallAbove: number) => {
    const eave = wall === 'front' || wall === 'back';
    const roofFeet = roofWidth(wall) / 12;
    const loftFeet = loft && eave ? loftSpan / 2 / 12 : 0;
    return {
      total: (loads.roof + loads.roofDead) * roofFeet + (loft ? (loft.live + loft.dead) * loftFeet : 0) + (WALL_DEAD * wallAbove) / 12,
      live: loads.roof * roofFeet + (loft ? loft.live * loftFeet : 0),
      floorLive: loftFeet > 0,
    };
  };
  const loadText = (floorLive: boolean, wall: 'front' | 'back' | 'left' | 'right') =>
    `${roofLabel} over ${formatLength(roofWidth(wall))}${floorLive && loft ? `, loft ${loft.live} + ${loft.dead} psf over ${formatLength(loftSpan / 2)}` : ''}, wall ${WALL_DEAD} psf`;

  const top = (assemblies: string[]) => extentOf(model.members.filter(({ assembly }) => assemblies.includes(assembly)), 2)[1];
  for (const opening of model.openings) {
    const { size, plies, flat } = opening.header;
    const { thick, width: depth } = LUMBER[size];
    const headerTop = opening.top + (flat ? thick : depth);
    const framingTop = top([`wall.${opening.wall}`, `gable.${opening.wall}`, `knee.${opening.wall}`]);
    const load = eaveLoad(opening.wall, Math.max(0, framingTop - headerTop));
    const limit = load.floorLive ? 360 : 240;
    beam(
      `${opening.name} header (${names.side(opening.wall)} wall)`,
      flat ? `flat ${size}` : `${plies}-ply ${size}`,
      size,
      flat ? depth : plies * thick,
      flat ? thick : depth,
      opening.right - opening.left,
      load,
      limit,
      `${loadText(load.floorLive, opening.wall)}, L/${limit}`,
    );
  }

  for (const { side, addition, rafterSpan, postSpacing, beamTributary, deck } of model.leanTos) {
    const name = `${capitalize(names.side(side))} lean-to`;
    // An extension rafter sits beside each main rafter, so it takes their spacing.
    const oc = addition.attach === 'extension' ? roof.oc : addition.oc;
    joists(`${name} rafters`, addition.rafter, oc, rafterSpan, rafterLoad, roofDuration, `${roofLabel}, L/${RAFTER_LIMIT}`);
    const feet = beamTributary / 12;
    const load = { total: (loads.roof + loads.roofDead) * feet, live: loads.roof * feet, floorLive: false };
    const { thick, width: depth } = LUMBER[addition.beam];
    beam(
      `${name} beam`,
      `${addition.beamPlies}-ply ${addition.beam}`,
      addition.beam,
      addition.beamPlies * thick,
      depth,
      postSpacing,
      load,
      240,
      `${roofLabel} over ${formatLength(beamTributary)}, L/240`,
    );
    if (deck) {
      const floorBasis = `${FLOOR.live} psf live + ${FLOOR.dead} psf dead`;
      joists(`${name} deck joists`, deck.joist, addition.deck.oc, deck.joistSpan, FLOOR, 1, `${floorBasis}, L/${FLOOR.limit}`);
      const deckFeet = deck.beamTributary / 12;
      const deckLoad = { total: (FLOOR.live + FLOOR.dead) * deckFeet, live: FLOOR.live * deckFeet, floorLive: true };
      const { thick: ply, width: deckDepth } = LUMBER[deck.joist];
      if (deck.beamSpan > 0) {
        beam(`${name} deck beam`, `${deck.plies}-ply ${deck.joist}`, deck.joist, deck.plies * ply, deckDepth, deck.beamSpan, deckLoad, FLOOR.limit, `${floorBasis} over ${formatLength(deck.beamTributary)}, L/${FLOOR.limit}`);
      }
    }
  }

  if (foundation.type === 'pier') {
    const { pier } = foundation;
    const girders = model.members.filter(({ role, assembly }) => role === 'girder' && assembly === 'foundation');
    const lines = mergeRanges(girders.map((member) => extentOf([member], 1)));
    const centers = lines.map(([low, high]) => (low + high) / 2);
    const piers = [...new Set(model.solids.flatMap(({ id, shape }) => (shape.kind === 'cylinder' && id.startsWith('FD') ? [Math.round(shape.base[0] * 16) / 16] : [])))].sort(
      (first, second) => first - second,
    );
    // Pier center to pier center.
    const span = Math.max(...piers.slice(1).map((x, index) => x - piers[index]));
    const { thick, width: depth } = LUMBER[pier.girder];
    centers.forEach((center, index) => {
      // Floor from midway to each neighbor line, or to the floor edge.
      const from = index === 0 ? 0 : (centers[index - 1] + center) / 2;
      const to = index === centers.length - 1 ? width : (center + centers[index + 1]) / 2;
      const floorFeet = (to - from) / 12;
      // The outer lines also carry an eave wall, its share of the roof and loft, and the knee wall.
      const wall = index === 0 ? 'front' : index === centers.length - 1 ? 'back' : null;
      const above = wall ? eaveLoad(wall, top([`wall.${wall}`, `knee.${wall}`])) : { total: 0, live: 0 };
      const load = {
        total: (FLOOR.live + FLOOR.dead) * floorFeet + above.total,
        live: FLOOR.live * floorFeet + above.live,
        floorLive: true,
      };
      const name = wall ? `${capitalize(names.side(wall))} girder` : 'Inner girder';
      const basis = `Floor ${FLOOR.live} + ${FLOOR.dead} psf over ${formatLength(to - from)}${wall ? `; ${loadText(Boolean(loft), wall)}` : ''}, L/${FLOOR.limit}`;
      beam(name, `${pier.girderPlies}-ply ${pier.girder}`, pier.girder, pier.girderPlies * thick, depth, span, load, FLOOR.limit, basis);
    });
  }
  return checks;
}

/** A warning for each member past its allowable span. */
export function spanWarnings(checks: readonly SpanCheck[], config: ShedConfig): Warning[] {
  const species = SPECIES[config.catalog.species].label;
  return checks.flatMap(({ member, lumber, span, allowed, governs, basis }) =>
    allowed !== null && span > allowed
      ? [{ source: member, message: `${lumber} spans ${formatLength(span)}. ${species} allows ${formatLength(allowed)} (${governs}; ${basis}).` }]
      : [],
  );
}


/** Overlapping ranges joined, in order. */
function mergeRanges(ranges: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = [...ranges].sort((first, second) => first[0] - second[0]);
  const merged: [number, number][] = [];
  for (const [low, high] of sorted) {
    const last = merged.at(-1);
    if (last && low <= last[1] + 0.01) last[1] = Math.max(last[1], high);
    else merged.push([low, high]);
  }
  return merged;
}
