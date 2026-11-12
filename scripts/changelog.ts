// The release edits as text in, text out: scripts/release.mjs applies them to the files.

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASES = 'https://github.com/brgoldbach/shed-builder/releases/tag';
const UNRELEASED = '## [Unreleased]\n';
const PARTS = ['major', 'minor', 'patch'];

/** The version a release asks for: X.Y.Z as given, or `major`, `minor`, or `patch` counted up from `current`. */
export function resolveVersion(request: string, current: string): string {
  const part = PARTS.indexOf(request);
  if (part < 0) return request;
  return current
    .split('.')
    .map((value, index) => (index < part ? Number(value) : index === part ? Number(value) + 1 : 0))
    .join('.');
}

/** Throw unless `next` is an X.Y.Z version above `current`. */
export function checkVersion(next: string, current: string) {
  const parts = VERSION.exec(next);
  if (!parts) throw new Error(`"${next}" is not a version of the form X.Y.Z`);
  const now = current.split('.').map(Number);
  const difference = parts
    .slice(1)
    .map((part, index) => Number(part) - now[index])
    .find((part) => part !== 0);
  if (difference === undefined || difference < 0) throw new Error(`${next} is not above the current version ${current}`);
}

/** The changelog with `[Unreleased]` renamed to the version and date, and the version's link line added. */
export function releaseChangelog(text: string, version: string, date: string): string {
  const start = text.indexOf(UNRELEASED);
  if (start < 0) throw new Error('CHANGELOG.md has no "## [Unreleased]" section. Is the version already set?');
  if (section(text, start + UNRELEASED.length).trim() === '') throw new Error('The [Unreleased] section is empty');
  const links = text.search(/^\[\d+\.\d+\.\d+\]: /m);
  if (links < 0) throw new Error('CHANGELOG.md has no version link lines');
  const linked = `${text.slice(0, links)}[${version}]: ${RELEASES}/v${version}\n${text.slice(links)}`;
  return linked.replace(UNRELEASED, `## [${version}] - ${date}\n`);
}

/** The body of the version's changelog section, for the release notes. */
export function releaseNotes(text: string, version: string): string {
  const heading = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\].*\\n`, 'm').exec(text);
  if (!heading) throw new Error(`CHANGELOG.md has no section for ${version}`);
  return `${section(text, heading.index + heading[0].length).trim()}\n`;
}

/** package.json or package-lock.json text with the app's version set. */
export function withVersion(text: string, version: string): string {
  const data = JSON.parse(text);
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
}

// The text from `from` to the next `## ` heading or the link lines.
function section(text: string, from: number): string {
  const rest = text.slice(from);
  const end = rest.search(/^(## |\[[^\]]+\]: )/m);
  return end < 0 ? rest : rest.slice(0, end);
}
