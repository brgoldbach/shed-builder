import { describe, expect, it } from 'vitest';
import { designProblems } from './design-checks';
import { DESIGNS } from './designs';

describe('every design', () => {
  it.each(DESIGNS.map((design) => [design.name, design] as const))('%s', (_name, design) => {
    expect(designProblems(design)).toEqual([]);
  });
});
