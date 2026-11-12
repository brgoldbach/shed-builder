// The file edits of a release, for .github/workflows. Node 26 loads changelog.ts as is.
//   node scripts/release.mjs prepare X.Y.Z   sets the version, and dates [Unreleased] in CHANGELOG.md
//   node scripts/release.mjs notes X.Y.Z     prints the version's CHANGELOG section
import { readFileSync, writeFileSync } from 'node:fs';
import { checkVersion, releaseChangelog, releaseNotes, withVersion } from './changelog.ts';

const PACKAGE_FILES = ['package.json', 'package-lock.json'];
const read = (file) => readFileSync(file, 'utf8');
const [command, version] = process.argv.slice(2);

try {
  if (command === 'prepare') {
    checkVersion(version, JSON.parse(read('package.json')).version);
    // The release date is the maintainer's local date.
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const changelog = releaseChangelog(read('CHANGELOG.md'), version, date);
    for (const file of PACKAGE_FILES) writeFileSync(file, withVersion(read(file), version));
    writeFileSync('CHANGELOG.md', changelog);
  } else if (command === 'notes') {
    process.stdout.write(releaseNotes(read('CHANGELOG.md'), version));
  } else {
    throw new Error('Usage: node scripts/release.mjs prepare|notes X.Y.Z');
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
