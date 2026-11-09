import { describe, expect, it } from 'vitest';
import { formatInches, formatLength, parseLength } from '../src/core/units';

describe('formatLength', () => {
  it.each([
    [126, `10' 6"`],
    [120, `10' 0"`],
    [92.625, `7' 8-5/8"`],
    [0.5, `1/2"`],
    [0, `0"`],
    [11.99, `1' 0"`],
    [-6.25, `-6-1/4"`],
  ])('%d in -> %s', (inches, text) => {
    expect(formatLength(inches)).toBe(text);
  });
});

describe('formatInches', () => {
  it.each([
    [92.625, `92-5/8"`],
    [3.5, `3-1/2"`],
    [0.0625, `1/16"`],
    [144, `144"`],
  ])('%d in -> %s', (inches, text) => {
    expect(formatInches(inches)).toBe(text);
  });
});

describe('parseLength', () => {
  it.each([
    [`10'`, 120],
    [`10' 6"`, 126],
    [`10'-6"`, 126],
    [`10'6`, 126],
    [`1.5'`, 18],
    ['126', 126],
    ['92.625', 92.625],
    ['92 5/8', 92.625],
    [`92-5/8"`, 92.625],
    [`7' 8-5/8"`, 92.625],
    ['5/8', 0.625],
    [' 48" ', 48],
    ['8 ft', 96],
    ['10 ft 6 in', 126],
    ['92 5/8 in', 92.625],
  ])('%s -> %d in', (text, inches) => {
    expect(parseLength(text)).toBe(inches);
  });

  it.each(['', 'abc', '5/0', `'`, '10 m', '-6', `10' x`, `6" 2"`])('rejects %j', (text) => {
    expect(parseLength(text)).toBeNull();
  });

  it('round-trips every 1/16 in up to 20 ft', () => {
    for (let sixteenths = 0; sixteenths <= 240 * 16; sixteenths++) {
      const inches = sixteenths / 16;
      expect(parseLength(formatLength(inches))).toBe(inches);
      expect(parseLength(formatInches(inches))).toBe(inches);
    }
  });
});
