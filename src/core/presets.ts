import gableSkid from '../../presets/8x10-gable-skid.json';
import leanToPier from '../../presets/10x12-lean-to-pier.json';
import garageSlab from '../../presets/12x20-garage-slab.json';
import redBarn from '../../presets/12x16-red-barn.json';
import { shedSchema } from './config';

export const PRESETS = [gableSkid, leanToPier, garageSlab, redBarn].map((preset) => shedSchema.parse(preset));
