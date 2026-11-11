import { shedSchema } from '../src/core/config';
import { PRESETS } from '../src/core/presets';
import bAndB from './fixtures/16x16-b-and-b-shed.json';
import loftShed from './fixtures/10x16-loft-shed.json';
import studio from './fixtures/12x16-lean-to-studio.json';
import oddOpenings from './fixtures/8x12-odd-openings.json';
import heavySnow from './fixtures/20x24-heavy-snow.json';
import leanTos from './fixtures/12x12-with-lean-tos.json';
import tiny from './fixtures/4x6-tiny-shed.json';
import gambrel from './fixtures/12x16-gambrel-barn.json';

/**
 * The presets, and test designs that use the options the presets leave at their defaults. The
 * 16x16 B and B shed is no longer a preset, but it is the one design with mirrored metal lean-tos,
 * knee walls over an open loft end, and a gable front. Some designs warn on purpose: the odd
 * openings, the heavy-snow header, the low lean-tos, and the gambrel's lean-to blocked over the plate.
 */
export const DESIGNS = [...PRESETS, ...[bAndB, loftShed, studio, oddOpenings, heavySnow, leanTos, tiny, gambrel].map((design) => shedSchema.parse(design))];
