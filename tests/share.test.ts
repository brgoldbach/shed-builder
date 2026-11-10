import { describe, expect, it } from 'vitest';
import { serializeConfig, shedSchema } from '../src/core/config';
import { designFromLink, designToLink, linkData } from '../src/core/share';
import { DESIGNS } from './designs';

describe('design links', () => {
  it.each(DESIGNS.map((design) => [design.name, design] as const))('%s loads back from its link exactly', async (_name, design) => {
    const loaded = await designFromLink(await designToLink(design));
    expect(loaded.ok && serializeConfig(loaded.config)).toBe(serializeConfig(design));
  });

  it('keeps a value whose default depends on another field', async () => {
    // A custom wall height with no stud height loads as custom; the 92-5/8 precut must stay in.
    const design = shedSchema.parse({ schemaVersion: 1, studHeight: 92.625, wallHeight: 120 });
    const loaded = await designFromLink(await designToLink(design));
    expect(loaded.ok && loaded.config.studHeight).toBe(92.625);
  });

  it('leaves the defaults out, so links stay short', async () => {
    expect((await designToLink(shedSchema.parse({ schemaVersion: 1 }))).length).toBeLessThan(40);
    for (const design of DESIGNS) expect((await designToLink(design)).length).toBeLessThan(1000);
  });

  it('reports a damaged link instead of loading it', async () => {
    const data = await designToLink(DESIGNS[0]);
    expect(await designFromLink(data.slice(0, data.length / 2))).toEqual({
      ok: false,
      errors: ['The link is damaged or incomplete. Ask for the link again.'],
    });
  });

  it('reads the data from the address fragment only', () => {
    expect(linkData('#design=abc')).toBe('abc');
    expect(linkData('#other')).toBeNull();
    expect(linkData('')).toBeNull();
  });
});
