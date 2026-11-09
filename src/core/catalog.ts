export const LUMBER_SIZES = ['2x4', '2x6', '2x8', '2x10', '2x12', '4x4', '4x6', '6x6'] as const;
export type LumberSize = (typeof LUMBER_SIZES)[number];

export const TWO_BY = ['2x4', '2x6', '2x8', '2x10', '2x12'] as const satisfies readonly LumberSize[];
export type TwoBy = (typeof TWO_BY)[number];

// Dry dressed sizes, inches: American Softwood Lumber Standard (DOC PS 20).
export const LUMBER: Record<LumberSize, { thick: number; width: number }> = {
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
const PRECUT_STUDS = [92.625, 104.625, 116.625];

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
};

export function stockLengths(
  overrides: Partial<Record<LumberSize, number[]>>,
  size: LumberSize,
): readonly number[] {
  return overrides[size] ?? DEFAULT_STOCK[size];
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
