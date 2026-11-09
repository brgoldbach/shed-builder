import { z } from 'zod';
import { LUMBER_SIZES, SHEET_KEYS, TWO_BY } from './catalog';
import { formatLength } from './units';

// All lengths are inches.

export const SPACINGS = [12, 16, 19.2, 24] as const;
export const FOUNDATION_TYPES = ['skid', 'pier', 'slab'] as const;
export const SKID_SIZES = ['4x4', '4x6', '6x6'] as const;
export const PIER_DIAMETERS = [8, 10, 12] as const;
export const POST_SIZES = ['none', '4x4', '6x6'] as const;
export const WALL_STUDS = ['2x4', '2x6'] as const;
export const CORNERS = ['four-stud', 'three-stud', 'california', 'two-stud'] as const;
export const WALLS = ['front', 'back', 'left', 'right'] as const;
export const OPENING_KINDS = ['door', 'window', 'overhead', 'custom'] as const;
export const ROOF_STYLES = ['gable', 'lean-to'] as const;
export const TAIL_CUTS = ['plumb', 'square'] as const;
export const SHEATHING = ['none', ...SHEET_KEYS] as const;
export const FASCIA = ['none', ...TWO_BY] as const;

const len = (min: number, max: number) =>
  z.number().min(min, `Min ${formatLength(min)}`).max(max, `Max ${formatLength(max)}`);
const count = (min: number, max: number) =>
  z.number().int('Whole number').min(min, `Min ${min}`).max(max, `Max ${max}`);
const spacing = z.literal(SPACINGS);
const twoBy = z.enum(TWO_BY);
const auto = z.literal('auto');

const foundation = z.strictObject({
  type: z.enum(FOUNDATION_TYPES).default('skid'),
  skid: z
    .strictObject({
      size: z.enum(SKID_SIZES).default('4x6'),
      count: count(2, 6).default(3),
    })
    .prefault({}),
  pier: z
    .strictObject({
      diameter: z.literal(PIER_DIAMETERS).default(10),
      depth: len(0, 72).default(36), // below grade
      aboveGrade: len(0, 48).default(8),
      post: z.enum(POST_SIZES).default('none'),
      postLength: len(6, 96).default(12),
      girder: z.enum(LUMBER_SIZES).default('2x8'),
      girderPlies: count(1, 3).default(2),
      girderCount: count(2, 6).default(2),
      maxSpacing: len(24, 144).default(72), // between piers along a girder
    })
    .prefault({}),
  slab: z
    .strictObject({
      thickness: len(3.5, 8).default(4),
      thickenedEdge: z.boolean().default(true),
      edgeWidth: len(6, 36).default(12),
      edgeDepth: len(6, 36).default(12), // slab top to edge bottom
      anchorSpacing: len(12, 120).default(72),
      anchorEndDistance: len(2, 24).default(12),
    })
    .prefault({}),
  gravelDepth: len(0, 12).default(4),
  gravelMargin: len(0, 36).default(12),
});

const floor = z.strictObject({
  joist: twoBy.default('2x6'),
  oc: spacing.default(16),
  treated: z.boolean().default(true),
  blocking: z.boolean().default(false),
  subfloor: z.enum(SHEET_KEYS).default('tg-23/32'),
});

const walls = z.strictObject({
  stud: z.enum(WALL_STUDS).default('2x4'),
  oc: spacing.default(16),
  studLength: len(48, 192).default(92.625),
  capPlate: z.boolean().default(true),
  corner: z.enum(CORNERS).default('four-stud'),
  header: twoBy.default('2x8'),
  doubleJackOver: len(24, 240).default(72), // RO width above which auto jacks become 2 per side
  sheathing: z.enum(SHEATHING).default('osb-7/16'),
});

const opening = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(OPENING_KINDS),
  wall: z.enum(WALLS),
  offset: len(0, 480), // outside corner to RO left edge, viewed from outside
  width: len(6, 240),
  height: len(6, 192),
  sill: len(0, 120).default(0), // floor to RO bottom
  header: twoBy.optional(), // absent: walls.header
  jacks: z.union([auto, count(1, 3)]).default('auto'),
});

const roof = z.strictObject({
  style: z.enum(ROOF_STYLES).default('gable'),
  pitch: z.number().min(1, 'Min 1/12').max(24, 'Max 24/12').default(6), // rise per 12 of run
  rafter: twoBy.default('2x6'),
  oc: spacing.default(24),
  eaveOverhang: len(0, 36).default(12), // horizontal
  rakeOverhang: len(0, 24).default(8),
  tailCut: z.enum(TAIL_CUTS).default('plumb'),
  fascia: z.enum(FASCIA).default('2x6'),
  sheathing: z.enum(SHEATHING).default('osb-7/16'),
  rakeLadder: z
    .strictObject({
      size: twoBy.default('2x4'),
      spacing: spacing.default(24),
    })
    .prefault({}),
  ridge: twoBy.default('2x8'),
  highSide: z.enum(['front', 'back']).default('back'),
  rafterTies: z
    .strictObject({
      enabled: z.boolean().default(true),
      size: twoBy.default('2x4'),
      every: count(1, 4).default(1), // 1 = each rafter pair
      height: len(0, 120).default(0), // above the top plate
    })
    .prefault({}),
  collarTies: z
    .strictObject({
      enabled: z.boolean().default(true),
      size: twoBy.default('2x4'),
      every: count(1, 4).default(1),
      height: z.union([auto, len(12, 240)]).default('auto'),
    })
    .prefault({}),
  // The loft joists take the place of the rafter ties.
  loft: z
    .strictObject({
      enabled: z.boolean().default(false),
      joist: twoBy.default('2x6'),
      oc: spacing.default(16),
      deck: z.enum(SHEET_KEYS).default('tg-23/32'),
    })
    .prefault({}),
  kneeWalls: z
    .strictObject({
      enabled: z.boolean().default(false),
      height: len(12, 72).default(36),
      stud: z.enum(WALL_STUDS).default('2x4'),
    })
    .prefault({}),
});

const catalog = z.strictObject({
  kerf: len(0, 0.25).default(0.125),
  stock: z.partialRecord(z.enum(LUMBER_SIZES), z.array(len(12, 480)).min(1)).default({}),
});

export const shedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1, 'Required').default('Untitled shed'),
  width: len(48, 480).default(120), // front to back
  length: len(48, 480).default(144), // left to right
  foundation: foundation.prefault({}),
  floor: floor.prefault({}),
  walls: walls.prefault({}),
  openings: z.array(opening).default([]),
  roof: roof.prefault({}),
  catalog: catalog.prefault({}),
});

export type ShedConfig = z.infer<typeof shedSchema>;
export type Opening = ShedConfig['openings'][number];

export type ParseResult = { ok: true; config: ShedConfig } | { ok: false; errors: string[] };

export function parseConfig(raw: unknown): ParseResult {
  const result = shedSchema.safeParse(raw);
  if (result.success) return { ok: true, config: result.data };
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.') || 'file'}: ${issue.message}`,
  );
  return { ok: false, errors };
}

export function parseConfigText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Not valid JSON'] };
  }
  return parseConfig(raw);
}

export function serializeConfig(config: ShedConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
