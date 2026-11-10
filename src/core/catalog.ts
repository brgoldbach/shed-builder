export const LUMBER_SIZES = ['1x4', '2x4', '2x6', '2x8', '2x10', '2x12', '4x4', '4x6', '6x6'] as const;
export type LumberSize = (typeof LUMBER_SIZES)[number];

export const TWO_BY = ['2x4', '2x6', '2x8', '2x10', '2x12'] as const satisfies readonly LumberSize[];
export type TwoBy = (typeof TWO_BY)[number];

// Dry dressed sizes, inches: American Softwood Lumber Standard (DOC PS 20).
export const LUMBER: Record<LumberSize, { thick: number; width: number }> = {
  '1x4': { thick: 0.75, width: 3.5 },
  '2x4': { thick: 1.5, width: 3.5 },
  '2x6': { thick: 1.5, width: 5.5 },
  '2x8': { thick: 1.5, width: 7.25 },
  '2x10': { thick: 1.5, width: 9.25 },
  '2x12': { thick: 1.5, width: 11.25 },
  '4x4': { thick: 3.5, width: 3.5 },
  '4x6': { thick: 3.5, width: 5.5 },
  '6x6': { thick: 5.5, width: 5.5 },
};

const EVEN_FEET = [96, 120, 144, 168, 192, 216, 240];
/** Precut studs for 8, 9, and 10 ft walls with a bottom plate and a double top plate. */
export const PRECUT_STUDS = [92.625, 104.625, 116.625] as const;

/** Stock lengths in inches, used when the config does not override a size. */
export const DEFAULT_STOCK: Record<LumberSize, readonly number[]> = {
  '2x4': [...PRECUT_STUDS, ...EVEN_FEET],
  '2x6': [...PRECUT_STUDS, ...EVEN_FEET],
  '2x8': EVEN_FEET,
  '2x10': EVEN_FEET,
  '2x12': EVEN_FEET,
  '4x4': EVEN_FEET,
  '4x6': EVEN_FEET,
  '6x6': EVEN_FEET,
  '1x4': [96, 120, 144, 192],
};

export function stockLengths(
  overrides: Partial<Record<LumberSize, number[]>>,
  size: LumberSize,
): readonly number[] {
  return overrides[size] ?? DEFAULT_STOCK[size];
}

/** Stock lengths to buy: those no longer than `max` (default `maxLength`), or the shortest when none is. */
export function stockFor(
  catalog: { stock: Partial<Record<LumberSize, number[]>>; maxLength: number },
  size: LumberSize,
  max = catalog.maxLength,
): readonly number[] {
  const lengths = stockLengths(catalog.stock, size);
  const buyable = lengths.filter((length) => length <= max);
  return buyable.length > 0 ? buyable : [Math.min(...lengths)];
}

export const SHEET_KEYS = ['osb-7/16', 'ply-15/32', 'ply-19/32', 'tg-23/32'] as const;
export type SheetKey = (typeof SHEET_KEYS)[number];

// 48 x 96 in panels. `thick` is the actual thickness; the label adds the name yards sell it under.
export const SHEETS: Record<SheetKey, { label: string; thick: number }> = {
  'osb-7/16': { label: '7/16" OSB', thick: 7 / 16 },
  'ply-15/32': { label: '15/32" plywood (1/2")', thick: 15 / 32 },
  'ply-19/32': { label: '19/32" plywood (5/8")', thick: 19 / 32 },
  'tg-23/32': { label: '23/32" T&G (3/4")', thick: 23 / 32 },
};

/**
 * Default unit prices in US dollars, before tax and delivery: US home-center retail as searched in
 * November 2026 (plan, section 5.4). Lumber is per linear foot, untreated; treated adds
 * `treatedMarkup` percent. Check them against a local yard.
 */
export const DEFAULT_PRICES = {
  lumber: { '1x4': 0.45, '2x4': 0.45, '2x6': 0.75, '2x8': 1.05, '2x10': 1.5, '2x12': 2, '4x4': 1.4, '4x6': 2.1, '6x6': 3.5 } satisfies Record<
    LumberSize,
    number
  >,
  treatedMarkup: 50,
  sheets: { 'osb-7/16': 16.5, 'ply-15/32': 28, 'ply-19/32': 35, 'tg-23/32': 34 } satisfies Record<SheetKey, number>,
  concrete: { bag: 6, readyMix: 165, formTube: 16 }, // 80 lb bag; per cu yd, delivered; each
  hardware: { anchorBolt: 2.5, hurricaneTie: 0.75, postBase: 9, postCap: 9, joistHanger: 1.6, doubleHanger: 3, lag: 1.25 },
  roofing: { shingles: 1.5, metal: 1.75, dripEdge: 1.5 }, // per sq ft, per sq ft, per ft
};

export const SPECIES_KEYS = ['spf', 'dfl', 'hf', 'sp'] as const;
export type Species = (typeof SPECIES_KEYS)[number];

/**
 * No. 2 grade reference design values, psi, for normal load duration and dry service: NDS 2018
 * Supplement Table 4A (Douglas Fir-Larch, Hem-Fir, Spruce-Pine-Fir "No. 1/No. 2") and Table 4B
 * (Southern Pine, by nominal width, size factor included).
 */
export const SPECIES: Record<Species, { label: string; fb: number | Record<number, number>; fv: number; e: number }> = {
  spf: { label: 'Spruce-Pine-Fir No. 2', fb: 875, fv: 135, e: 1_400_000 },
  dfl: { label: 'Douglas Fir-Larch No. 2', fb: 900, fv: 180, e: 1_600_000 },
  hf: { label: 'Hem-Fir No. 2', fb: 850, fv: 150, e: 1_300_000 },
  sp: { label: 'Southern Pine No. 2', fb: { 4: 1100, 6: 1000, 8: 925, 10: 800, 12: 750 }, fv: 175, e: 1_400_000 },
};

// NDS 2018 Supplement, Table 4A Adjustment Factors, size factor CF for Fb, No. 2 grade, by nominal
// width; 4" thick lumber has its own column.
const SIZE_FACTOR: Record<number, number> = { 4: 1.5, 6: 1.3, 8: 1.2, 10: 1.1, 12: 1.0 };
const SIZE_FACTOR_4IN: Record<number, number> = { 4: 1.5, 6: 1.3, 8: 1.3, 10: 1.2, 12: 1.1 };

/** Fb with its size factor, psi; null for sizes without dimension lumber values: 1x boards and 6x6 timbers. */
export function bendingValue(species: Species, size: LumberSize): number | null {
  const [thick, width] = size.split('x').map(Number);
  if (thick < 2 || thick > 4) return null;
  const { fb } = SPECIES[species];
  if (typeof fb !== 'number') return fb[width];
  return fb * (thick === 4 ? SIZE_FACTOR_4IN : SIZE_FACTOR)[width];
}
