import { describe, expect, it } from 'vitest';
import changelog from '../CHANGELOG.md?raw';
import lockFile from '../package-lock.json?raw';
import packageFile from '../package.json?raw';
import { checkVersion, releaseChangelog, releaseNotes, withVersion } from '../scripts/changelog';

const SAMPLE = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '### Added',
  '',
  '- New thing.',
  '',
  '## [1.2.0] - 2026-01-02',
  '',
  '### Fixed',
  '',
  '- Old thing.',
  '',
  '[1.2.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v1.2.0',
  '',
].join('\n');

describe('release', () => {
  it('takes only an X.Y.Z version above the current one', () => {
    for (const next of ['1.2.1', '1.3.0', '2.0.0', '1.10.0']) expect(() => checkVersion(next, '1.2.0')).not.toThrow();
    for (const next of ['1.2.0', '1.1.9', '0.9.0']) expect(() => checkVersion(next, '1.2.0')).toThrow('is not above');
    for (const next of ['1.3', 'v1.3.0', '1.3.0-beta', '', '1.3.0; rm']) expect(() => checkVersion(next, '1.2.0')).toThrow('is not a version');
  });

  it('dates [Unreleased] as the version, and adds its link line above the older ones', () => {
    const released = releaseChangelog(SAMPLE, '1.3.0', '2026-02-03');
    expect(released).toBe(
      SAMPLE.replace('## [Unreleased]', '## [1.3.0] - 2026-02-03').replace(
        '[1.2.0]: ',
        '[1.3.0]: https://github.com/brgoldbach/shed-builder/releases/tag/v1.3.0\n[1.2.0]: ',
      ),
    );
    expect(releaseNotes(released, '1.3.0')).toBe('### Added\n\n- New thing.\n');
  });

  it('refuses a changelog with no unreleased changes', () => {
    expect(() => releaseChangelog(SAMPLE.replace('## [Unreleased]\n', ''), '1.3.0', '2026-02-03')).toThrow('no "## [Unreleased]"');
    expect(() => releaseChangelog(SAMPLE.replace('### Added\n\n- New thing.\n\n', ''), '1.3.0', '2026-02-03')).toThrow('is empty');
  });

  it('gives the notes of a version, up to the link lines when it is the oldest', () => {
    expect(releaseNotes(SAMPLE, '1.2.0')).toBe('### Fixed\n\n- Old thing.\n');
    expect(() => releaseNotes(SAMPLE, '1.1.0')).toThrow('no section for 1.1.0');
    expect(releaseNotes(changelog, '0.8.0')).toContain('**Download 3D:**');
  });

  it('changes only the version lines of package.json and package-lock.json', () => {
    for (const text of [packageFile, lockFile]) {
      const before = text.split('\n');
      const after = withVersion(text, '9.9.9').split('\n');
      const changed = after.filter((line, index) => line !== before[index]);
      expect(after).toHaveLength(before.length);
      expect(changed.length).toBeGreaterThan(0);
      expect(changed.every((line) => line.trim() === '"version": "9.9.9",')).toBe(true);
    }
  });
});
