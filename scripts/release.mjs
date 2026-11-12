// The file edits of a release, for .github/workflows. Node 26 loads changelog.ts as is.
//   node scripts/release.mjs prepare X.Y.Z|patch|minor|major
//       sets the version, dates [Unreleased] in CHANGELOG.md, and prints the version
//   node scripts/release.mjs notes X.Y.Z
//       prints the version's CHANGELOG section
import { readFileSync, writeFileSync } from 'node:fs';
import { checkVersion, releaseChangelog, releaseNotes, resolveVersion, withVersion } from './changelog.ts';

const PACKAGE_FILES = ['package.json', 'package-lock.json'];
const read = (file) => readFileSync(file, 'utf8');
const [command, request] = process.argv.slice(2);

try {
  if (command === 'prepare') {
    const current = JSON.parse(read('package.json')).version;
    const version = resolveVersion(request, current);
    checkVersion(version, current);
    // The release date is the maintainer's local date.
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const changelog = releaseChangelog(read('CHANGELOG.md'), version, date);
    for (const file of PACKAGE_FILES) writeFileSync(file, withVersion(read(file), version));
    writeFileSync('CHANGELOG.md', changelog);
    console.log(version);
  } else if (command === 'notes') {
    process.stdout.write(releaseNotes(read('CHANGELOG.md'), request));
  } else {
    throw new Error('Usage: node scripts/release.mjs prepare X.Y.Z|patch|minor|major, or notes X.Y.Z');
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
