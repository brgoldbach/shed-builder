import { describe, expect, it } from 'vitest';
import { shedSchema } from '../src/core/config';
import { frameWalls } from '../src/core/gen/walls';
import { ASSEMBLIES, type Assembly } from '../src/core/member';
import { buildModel } from '../src/core/model';
import { naming } from '../src/core/naming';
import { buildCutList } from '../src/core/out/cutlist';
import { PRESETS } from '../src/core/presets';

const assemblies = Object.keys(ASSEMBLIES) as Assembly[];

describe('naming', () => {
  it('keeps the model names with an eave wall in front', () => {
    const names = naming({ front: 'eave' });
    for (const assembly of assemblies) {
      const { label, prefix } = ASSEMBLIES[assembly];
      expect(names.assembly(assembly)).toEqual({ label, prefix });
    }
    const ranked = [...assemblies].sort((first, second) => names.rank(first) - names.rank(second));
    expect(ranked).toEqual(assemblies);
    expect(names.sides).toEqual(['front', 'back', 'left', 'right']);
  });

  it('turns the names a quarter turn with a gable end in front', () => {
    const names = naming({ front: 'gable' });
    // The model's left gable end is the front; its front eave wall is on the right.
    expect(names.sides).toEqual(['left', 'right', 'back', 'front']);
    expect(names.assembly('wall.left')).toEqual({ label: 'Front wall', prefix: 'FW' });
    expect(names.assembly('wall.front')).toEqual({ label: 'Right wall', prefix: 'RW' });
    expect(names.assembly('gable.left')).toEqual({ label: 'Front gable end', prefix: 'GF' });
    expect(names.assembly('knee.back')).toEqual({ label: 'Left knee wall', prefix: 'KL' });
    expect(names.assembly('roof')).toEqual({ label: 'Roof', prefix: 'RF' });
  });

  it('lists and marks the cut list from the user front', () => {
    const preset = { ...PRESETS[0], front: 'gable' as const };
    const lines = buildCutList(buildModel(preset).members, naming(preset));
    // The 8x10's door wall is the model's left gable wall: now the front wall, the first wall listed.
    expect(lines.find((line) => line.assembly.startsWith('wall'))).toMatchObject({ mark: 'FW-1', assembly: 'wall.left' });
  });

  it('names opening placements by the user side', () => {
    const config = shedSchema.parse({
      schemaVersion: 1,
      front: 'gable',
      openingTypes: [{ name: 'window', kind: 'window', width: 24, height: 36 }],
      openings: [{ type: 'window', wall: 'left', sill: 46, at: [1] }],
    });
    expect(frameWalls(config).warnings[0].source).toBe('window (front 1%)');
  });
});
