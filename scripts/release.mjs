// The file edits of a release, for .github/workflows. Node 26 loads changelog.ts as is.
//   node scripts/release.mjs prepare X.Y.Z|patch|minor|major
//       sets the version, dates [Unreleased] in CHANGELOG.md, keeps copies of changed designs in
//       tests/fixtures/saved/vX.Y.Z, and prints the version
//   node scripts/release.mjs notes X.Y.Z
//       prints the version's CHANGELOG section
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { checkVersion, releaseChangelog, releaseNotes, resolveVersion, withVersion } from './changelog.ts';

const PACKAGE_FILES = ['package.json', 'package-lock.json'];
const SAVED = 'tests/fixtures/saved';
const read = (file) => readFileSync(file, 'utf8');
const jsonFiles = (directory, recursive = false) =>
  readdirSync(directory, { recursive }).filter((file) => file.endsWith('.json')).map((file) => `${directory}/${file}`);

// Each preset and test design that differs from every saved copy, as this release has it, so
// tests/saved.test.ts keeps loading it in later releases.
function keepSavedCopies(version) {
  const known = new Set(jsonFiles(SAVED, true).map(read));
  for (const file of [...jsonFiles('presets'), ...jsonFiles('tests/fixtures')]) {
    if (known.has(read(file))) continue;
    mkdirSync(`${SAVED}/v${version}`, { recursive: true });
    writeFileSync(`${SAVED}/v${version}/${basename(file)}`, read(file));
  }
}
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
    keepSavedCopies(version);
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
