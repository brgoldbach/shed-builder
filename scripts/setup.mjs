// Checks Node against package.json, installs the locked dependencies, then runs the tests and a
// build to prove the install. Run it with `npm run setup` from any shell.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { engines } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const parse = (text) => text.split('.').map(Number);
const atLeast = (version, minimum) => {
  const difference = version.map((part, index) => part - minimum[index]).find((part) => part !== 0);
  return difference === undefined || difference > 0;
};
// engines.node holds "^X.Y.Z" (same major, at least X.Y.Z) and ">=X.Y.Z" terms joined by "||".
const satisfies = (version, range) =>
  range.split('||').some((term) => {
    const [, operator, minimum] = term.trim().match(/^(\^|>=)(\d+\.\d+\.\d+)$/) ?? [];
    if (!minimum) return false;
    const floor = parse(minimum);
    return atLeast(version, floor) && (operator === '>=' || version[0] === floor[0]);
  });

if (!satisfies(parse(process.versions.node), engines.node)) {
  console.error(`Node ${process.versions.node} is not supported. Install Node ${engines.node}, then run "npm run setup" again.`);
  process.exit(1);
}

for (const command of ['npm ci', 'npm test', 'npm run build']) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit' });
}
console.log('\nSetup is complete. Run "npm run dev", then open http://localhost:5173.');
