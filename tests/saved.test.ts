import { describe, expect, it } from 'vitest';
import { parseConfigText } from '../src/core/config';
import { designProblems } from './design-checks';

// The preset and fixture files of each release, as that release had them: each distinct file once.
// A change that makes one fail to load needs a schemaVersion step (docs/DEVELOPER.md).
const SAVED = import.meta.glob('./fixtures/saved/*/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('files saved by earlier releases', () => {
  it.each(Object.entries(SAVED).map(([path, text]) => [path.replace('./fixtures/saved/', ''), text] as const))('%s', (_name, text) => {
    const result = parseConfigText(text);
    expect(result.ok ? [] : result.errors).toEqual([]);
    if (result.ok) expect(designProblems(result.config)).toEqual([]);
  });
});
