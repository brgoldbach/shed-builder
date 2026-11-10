import { describe, expect, it } from 'vitest';
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
});
