import { describe, expect, it } from 'vitest';
import { compactDesign } from '../src/core/share';
import { designProblems } from './design-checks';
import { randomDesigns } from './random-designs';

// A fixed seed, so a failure repeats. Change the seed to look further; keep the count within the
// gate's time.
const SEED = 20261112;
const COUNT = 300;

describe(`random designs, seed ${SEED}`, () => {
  it.each(randomDesigns(COUNT, SEED).map((design, index) => [index, design] as const))('design %i', (_index, design) => {
    expect(designProblems(design), JSON.stringify(compactDesign(design))).toEqual([]);
  });
});
