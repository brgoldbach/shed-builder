import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/core/member';
import { buildModel } from '../src/core/model';
import { buildCutList } from '../src/core/out/cutlist';
import { PRESETS } from '../src/core/presets';
import { formatInches } from '../src/core/units';

// A change in any preset's cut list fails here until the golden file is reviewed and updated
// with `npx vitest run -u`.
describe('preset cut lists', () => {
  it.each(PRESETS.map((preset) => [preset.name, preset] as const))('%s', async (name, preset) => {
    const text = buildCutList(buildModel(preset))
      .map((line) =>
        [
          line.mark.padEnd(6),
          String(line.ids.length).padStart(3),
          `${line.size}${line.treated ? ' PT' : ''}`.padEnd(8),
          formatInches(line.length).padStart(10),
          ROLES[line.role],
        ].join('  '),
      )
      .join('\n');
    await expect(`${text}\n`).toMatchFileSnapshot(`golden/${name.replaceAll(' ', '-')}.txt`);
  });
});
