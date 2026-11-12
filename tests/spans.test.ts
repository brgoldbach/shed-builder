import { describe, expect, it } from 'vitest';
import { bendingValue, type LumberSize, type Species } from '../src/core/catalog';
import { shedSchema } from '../src/core/config';
import { buildModel } from '../src/core/model';
import { naming } from '../src/core/naming';
import { checkSpans, FLOOR, joistSpan, LOFT, spanWarnings } from '../src/core/out/spans';
import { PRESETS } from '../src/core/presets';

const [gableSkid, leanToPier] = PRESETS;
const ROOF_LIVE = { live: 20, dead: 10, limit: 180 };
// Published spans round to the nearest inch.
const nearest = (species: Species, size: LumberSize, oc: number, load: { live: number; dead: number; limit: number }, duration = 1) =>
  Math.round(joistSpan(species, size, oc, load, duration)!.span);
const feet = (ft: number, inches: number) => ft * 12 + inches;

// Reference spans: 2018 IRC tables as adopted in the 2018 Seattle Residential Code (seattle.gov).
describe('joist and rafter spans match the IRC tables', () => {
  it('floor joists, 40 psf live, 10 psf dead, L/360: Table R502.3.1(2)', () => {
    expect(nearest('dfl', '2x8', 16, FLOOR)).toBe(feet(12, 9));
    expect(nearest('dfl', '2x12', 16, FLOOR)).toBe(feet(18, 1));
    expect(nearest('sp', '2x10', 16, FLOOR)).toBe(feet(14, 0));
    expect(nearest('spf', '2x10', 16, FLOOR)).toBe(feet(15, 5));
    expect(nearest('hf', '2x6', 12, FLOOR)).toBe(feet(10, 0));
  });

  it('sleeping-area floors, 30 psf live, L/360: Table R502.3.1(1)', () => {
    expect(nearest('hf', '2x10', 16, LOFT.sleeping)).toBe(feet(16, 10));
    expect(nearest('spf', '2x12', 16, LOFT.sleeping)).toBe(feet(19, 11));
  });

  it('rafters, 20 psf roof live load, L/180, at the 1.25 load duration: Table R802.4.1(1)', () => {
    expect(nearest('dfl', '2x6', 16, ROOF_LIVE, 1.25)).toBe(feet(14, 7));
    expect(nearest('spf', '2x4', 12, ROOF_LIVE, 1.25)).toBe(feet(10, 4));
    expect(nearest('sp', '2x8', 12, ROOF_LIVE, 1.25)).toBe(feet(19, 8));
  });

  it('ceiling joists, limited attic storage, L/240: Table R802.5.1(2)', () => {
    expect(nearest('dfl', '2x8', 16, LOFT.storage)).toBe(feet(16, 6));
    expect(nearest('sp', '2x6', 12, LOFT.storage)).toBe(feet(13, 11));
  });
});

describe('span checks', () => {
  it('has no bending value for boards and timbers', () => {
    expect(['1x4', '5/4x6', '6x6'].map((size) => bendingValue('spf', size as LumberSize))).toEqual([null, null, null]);
    expect(bendingValue('spf', '2x6')).toBeCloseTo(875 * 1.3);
  });

  const names = naming(gableSkid);
  const checks = checkSpans(gableSkid, buildModel(gableSkid), names);
  const find = (member: string) => checks.find((check) => check.member === member)!;

  it('measures each member clear between its bearings', () => {
    // Rafter: seat end (2-9/16) to the ridge face (47-1/4). Floor: from an outer skid's inner face
    // (3-1/2) to the center skid (46-1/4 to 49-3/4).
    expect(find('Rafters').span).toBeCloseTo(47.25 - 2.5625, 9);
    expect(find('Floor joists').span).toBe(42.75);
    expect(find('window 24x36 header (front wall)').span).toBe(24);
  });

  it('loads a header with its share of the roof and the wall above it', () => {
    // Front wall: 30 psf over half the 96 in width plus the 12 in eave, 5 ft, and 10 psf over the
    // 7-5/8 in of wall from the double 2x8 header top (82-1/4 + 7-1/4) to 97-1/8.
    const total = 30 * 5 + (10 * 7.625) / 12; // plf
    // SPF No. 2: 875 psi × CF 1.2 × CD 1.25, two plies, bending governs.
    const bending = Math.sqrt((8 * 875 * 1.2 * 1.25 * ((3 * 7.25 ** 2) / 6)) / (total / 12));
    expect(find('window 24x36 header (front wall)')).toMatchObject({ governs: 'bending' });
    expect(find('window 24x36 header (front wall)').allowed).toBeCloseTo(bending, 9);
  });

  it('warns for a member past its allowable span', () => {
    // 2x4 rafters at 24 in on an 18 ft gable, on a slab: 108 - 3/4 - 2-9/16 = 104-11/16 in clear.
    // SPF bending limit: (8 × 875 × CF 1.5 × Cr 1.15 × CD 1.25 × 3.0625 / (60/12))^(1/2) = 96.15 in.
    const wide = shedSchema.parse({ ...gableSkid, width: 216, foundation: { type: 'slab' }, roof: { ...gableSkid.roof, rafter: '2x4' } });
    const warnings = spanWarnings(checkSpans(wide, buildModel(wide), names), wide);
    expect(warnings.map(({ source }) => source)).toEqual(['Rafters']);
    expect(warnings[0].message).toBe(
      `2x4 at 24" o.c. spans 8' 8-11/16". Spruce-Pine-Fir No. 2 allows 8' 0-1/8" (bending; 20 psf roof live + 10 psf dead, L/180).`,
    );
    expect(spanWarnings(checks, gableSkid)).toEqual([]);
  });

  it('loads the outer pier girders with the eave walls and the roof', () => {
    const girders = checkSpans(leanToPier, buildModel(leanToPier), naming(leanToPier)).filter((check) => check.member.endsWith('girder'));
    // Piers at 5, 72, 139: 67 in center to center.
    expect(girders.map(({ member, span }) => [member, span])).toEqual([
      ['Front girder', 67],
      ['Inner girder', 67],
      ['Back girder', 67],
    ]);
    expect(girders[0].allowed!).toBeLessThan(girders[1].allowed!);
  });
});
