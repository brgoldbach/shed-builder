import { describe, expect, it } from 'vitest';
import { parseConfigText, serializeConfig, shedSchema } from '../src/core/config';
import { pruneConfig } from '../src/core/prune';
import { compactDesign, designFileText, designFromLink, designToLink, linkData } from '../src/core/share';
import { DESIGNS } from './designs';

describe('design links', () => {
  it.each(DESIGNS.map((design) => [design.name, design] as const))('%s loads back from its link and its file', async (_name, design) => {
    // As pruned: the settings the design does not use come back at their defaults.
    const expected = serializeConfig(pruneConfig(design));
    const fromLink = await designFromLink(await designToLink(design));
    const fromFile = parseConfigText(designFileText(design));
    expect(fromLink.ok && serializeConfig(fromLink.config)).toBe(expected);
    expect(fromFile.ok && serializeConfig(fromFile.config)).toBe(expected);
  });

  it('writes only the settings a design uses, without their defaults', () => {
    const [, , garage] = DESIGNS;
    const file = JSON.parse(designFileText(garage));
    // A slab: no skid, pier, or floor settings.
    expect(Object.keys(file.foundation)).not.toContain('skid');
    expect(Object.keys(file.foundation)).not.toContain('pier');
    expect(Object.keys(file)).not.toContain('floor');
    // List items keep the keys a file must give.
    expect(file.openings.every((row: object) => ['type', 'wall', 'at'].every((key) => key in row))).toBe(true);
    expect(Object.keys(file).slice(0, 2)).toEqual(['schemaVersion', 'appVersion']);
  });

  it('keeps every setting a design uses in its compact form', () => {
    for (const design of DESIGNS) {
      const loaded = parseConfigText(JSON.stringify(compactDesign(design)));
      expect(loaded.ok && serializeConfig(loaded.config)).toBe(serializeConfig(pruneConfig(design)));
    }
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
