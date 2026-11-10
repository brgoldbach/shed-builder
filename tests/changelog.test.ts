import { describe, expect, it } from 'vitest';
import changelog from '../CHANGELOG.md?raw';
import { APP_VERSION } from '../src/core/config';
import { parseChangelog } from '../src/ui/changelog';

describe('changelog', () => {
  it('reads headings, list items with their continuation lines, and paragraphs', () => {
    const markdown = ['# Changelog', '', 'Intro', 'line two.', '', '## [1.0.0] - 2026-01-02', '', '### Added', '', '- **One:** first', '  continued.', '- Two', '', '[1.0.0]: https://example.com'].join('\n');
    expect(parseChangelog(markdown)).toEqual([
      { kind: 'paragraph', text: 'Intro line two.' },
      { kind: 'heading', level: 2, text: '1.0.0 - 2026-01-02' },
      { kind: 'heading', level: 3, text: 'Added' },
      { kind: 'list', items: ['**One:** first continued.', 'Two'] },
    ]);
  });

  it('opens with the release in package.json, after any unreleased changes', () => {
    const first = parseChangelog(changelog).find((block) => block.kind === 'heading' && block.level === 2 && block.text !== 'Unreleased');
    expect(first?.kind === 'heading' && first.text.split(' ')[0]).toBe(APP_VERSION);
  });
});
