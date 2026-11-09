import { describe, expect, it } from 'vitest';
import { parseConfig, parseConfigText, serializeConfig } from '../src/core/config';
import { PRESETS } from '../src/core/presets';

describe('parseConfig', () => {
  it('fills every default from a bare file', () => {
    const result = parseConfig({ schemaVersion: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.width).toBe(120);
    expect(result.config.walls.studLength).toBe(92.625);
    expect(result.config.roof.collarTies.height).toBe('auto');
    expect(result.config.openings).toEqual([]);
  });

  it('rejects an unknown key and names its path', () => {
    const result = parseConfig({ schemaVersion: 1, walls: { studlength: 90 } });
    expect(result).toEqual({ ok: false, errors: ['walls: Unrecognized key: "studlength"'] });
  });

  it('rejects an out-of-range length with a ft-in message', () => {
    const result = parseConfig({ schemaVersion: 1, width: 12 });
    expect(result).toEqual({ ok: false, errors: [`width: Min 4' 0"`] });
  });

  it('rejects another schema version', () => {
    expect(parseConfig({ schemaVersion: 2 }).ok).toBe(false);
  });

  it('rejects text that is not JSON', () => {
    expect(parseConfigText('{')).toEqual({ ok: false, errors: ['Not valid JSON'] });
  });
});

describe('presets', () => {
  it.each(PRESETS.map((preset) => [preset.name, preset] as const))(
    '%s survives save and load',
    (_name, preset) => {
      expect(parseConfigText(serializeConfig(preset))).toEqual({ ok: true, config: preset });
    },
  );
});
