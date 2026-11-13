import { describe, expect, it } from 'vitest';
import { APP_VERSION, parseConfig, parseConfigText, serializeConfig, withRoofStyle } from '../src/core/config';
import { PRESETS } from '../src/core/presets';
import { DESIGNS } from './designs';

describe('parseConfig', () => {
  it('fills every default from a bare file', () => {
    const result = parseConfig({ schemaVersion: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.width).toBe(120);
    expect(result.config.wallHeight).toBe(97.125);
    expect(result.config.roof.collarTies.height).toBe('auto');
    expect(result.config.openings).toEqual([]);
  });

  it('loads a 1.1.0 file with a loft gable-end setting, which every closed end now ignores', () => {
    for (const gableEnds of ['balloon', 'platform']) {
      const result = parseConfig({ schemaVersion: 1, roof: { loft: { enabled: true, gableEnds } } });
      expect(result.ok && 'gableEnds' in result.config.roof.loft).toBe(false);
    }
  });

  it('keeps the wall height of a file saved without a stud height', () => {
    const result = parseConfig({ schemaVersion: 1, wallHeight: 109.125 });
    expect(result.ok && [result.config.studHeight, result.config.wallHeight]).toEqual(['custom', 109.125]);
    const fresh = parseConfig({ schemaVersion: 1 });
    expect(fresh.ok && fresh.config.studHeight).toBe(92.625);
  });

  it('rejects an unknown key and names its path', () => {
    const result = parseConfig({ schemaVersion: 1, walls: { studlength: 90 } });
    expect(result).toEqual({ ok: false, errors: ['walls: Unrecognized key: "studlength"'] });
  });

  it('rejects an out-of-range length with a ft-in message', () => {
    const result = parseConfig({ schemaVersion: 1, width: 12 });
    expect(result).toEqual({ ok: false, errors: [`width: Min 4' 0"`] });
  });

  it('takes a gambrel only with a lower slope steeper than the upper one', () => {
    const gambrel = (lowerPitch: number) => parseConfig({ schemaVersion: 1, roof: { style: 'gambrel', pitch: 12, gambrel: { lowerPitch } } });
    expect(gambrel(12)).toEqual({ ok: false, errors: ['roof.gambrel.lowerPitch: The lower pitch (12/12) must be steeper than the upper pitch (12/12)'] });
    expect(gambrel(14).ok).toBe(true);
  });

  describe('openings', () => {
    const openingTypes = [{ name: 'window 24x36', kind: 'window', width: 24, height: 36 }];
    const parse = (openings: object[], types: object[] = openingTypes) =>
      parseConfig({ schemaVersion: 1, openingTypes: types, openings });

    it('rejects a position past 100 percent', () => {
      expect(parse([{ type: 'window 24x36', wall: 'front', at: [25, 120] }])).toEqual({
        ok: false,
        errors: ['openings.0.at: Max 100%'],
      });
    });

    it('rejects a row whose type does not exist', () => {
      expect(parse([{ type: 'window 30x48', wall: 'front', at: [50] }])).toEqual({
        ok: false,
        errors: ['openings.0.type: No opening type "window 30x48"'],
      });
    });

    it('rejects two types with the same name', () => {
      expect(parse([], [...openingTypes, ...openingTypes])).toEqual({
        ok: false,
        errors: ['openingTypes.1.name: Duplicate name "window 24x36"'],
      });
    });
  });

  it('rejects another schema version', () => {
    expect(parseConfig({ schemaVersion: 2 }).ok).toBe(false);
  });

  it('rejects text that is not JSON', () => {
    expect(parseConfigText('{')).toEqual({ ok: false, errors: ['Not valid JSON'] });
  });

  it('records the saving app version after the schema version, and ignores it on load', () => {
    const [preset] = PRESETS;
    expect(Object.keys(JSON.parse(serializeConfig(preset))).slice(0, 3)).toEqual(['schemaVersion', 'appVersion', 'name']);
    expect(JSON.parse(serializeConfig(preset)).appVersion).toBe(APP_VERSION);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const older = parseConfig({ schemaVersion: 1, appVersion: '0.0.1' });
    expect(older.ok && 'appVersion' in older.config).toBe(false);
  });
});

describe('presets', () => {
  it.each(DESIGNS.map((preset) => [preset.name, preset] as const))(
    '%s survives save and load',
    (_name, preset) => {
      expect(parseConfigText(serializeConfig(preset))).toEqual({ ok: true, config: preset });
    },
  );
});

describe('withRoofStyle', () => {
  const { roof } = PRESETS[0];

  it('gives a new gambrel the classic barn pitches', () => {
    const gambrel = withRoofStyle(roof, 'gambrel');
    expect([gambrel.style, gambrel.gambrel.lowerPitch, gambrel.pitch]).toEqual(['gambrel', 29, 5]);
    expect(withRoofStyle({ ...gambrel, pitch: 7 }, 'gambrel').pitch).toBe(7);
  });

  it('changes only the style for a gable or a lean-to', () => {
    expect(withRoofStyle(roof, 'lean-to')).toEqual({ ...roof, style: 'lean-to' });
    expect(withRoofStyle(withRoofStyle(roof, 'gambrel'), 'gable').pitch).toBe(5);
  });
});
