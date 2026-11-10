import { describe, expect, it } from 'vitest';
import { pickScale, pointsPerInch, SCALES } from '../src/drawings/scale';

// A drawing 120 in wide and 60 in tall, with 100 pt of dimensions and margins each way.
const size = (points: number) => ({ width: 120 * points + 100, height: 60 * points + 100 });

describe('plan scales', () => {
  it('turns a scale into points of paper per building inch', () => {
    // 1/4 in per foot: 0.25 / 12 in of paper per inch, times 72 points per inch.
    expect(pointsPerInch(SCALES.find(({ label }) => label === `1/4" = 1'-0"`)!)).toBe(1.5);
  });

  it('picks the largest scale that fits the area', () => {
    // A Letter sheet less 1/2 in margins: 720 pt wide. 1 in = 1 ft (6 pt/in) is 820 pt wide;
    // 3/4 in = 1 ft (4.5 pt/in) is 640.
    expect(pickScale(size, { width: 720, height: 400 })?.label).toBe(`3/4" = 1'-0"`);
  });

  it('finds none when even the smallest scale does not fit', () => {
    expect(pickScale(size, { width: 100, height: 100 })).toBeNull();
  });
});
