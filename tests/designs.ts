import { shedSchema } from '../src/core/config';
import { PRESETS } from '../src/core/presets';
import bAndB from './fixtures/16x16-b-and-b-shed.json';

/**
 * The presets, and the 16x16 B and B shed: no longer a preset, but the one design with mirrored
 * metal lean-tos, knee walls over an open loft end, and a gable front, so the tests keep it.
 */
export const DESIGNS = [...PRESETS, shedSchema.parse(bAndB)];
