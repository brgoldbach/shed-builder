import gableSkid from '../../presets/8x10-gable-skid.json';
import leanToPier from '../../presets/10x12-lean-to-pier.json';
import garageSlab from '../../presets/12x20-garage-slab.json';
import bAndB from '../../presets/16x16-b-and-b-shed.json';
import { shedSchema } from './config';

export const PRESETS = [gableSkid, leanToPier, garageSlab, bAndB].map((preset) => shedSchema.parse(preset));
