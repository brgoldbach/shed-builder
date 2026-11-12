import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

// The release workflow reads the live version from it.
const versionFile: Plugin = {
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.txt', source: `${packageJson.version}\n` });
  },
};

// The standard MIT permission notice, for a package that ships no license file.
const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

// With no license file: the copyright lines of the package's main file, and the license.
function noticeOf(directory: string, license: string): string {
  const { main = 'index.js' } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const source = existsSync(join(directory, main)) ? readFileSync(join(directory, main), 'utf8') : '';
  const copyright = source.split('\n').filter((line) => /copyright/i.test(line)).map((line) => line.replace(/^[\s/*]+/, ''));
  return [...new Set(copyright), '', license === 'MIT' ? MIT : `License: ${license}`].join('\n').trim();
}

// The license of each package in the bundle, which MIT and the others ask to ship with the code.
const licenses: Plugin = {
  name: 'third-party-licenses',
  generateBundle(_, bundle) {
    const packages = new Set<string>();
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk') continue;
      for (const id of chunk.moduleIds) {
        const at = id.lastIndexOf('node_modules/');
        if (at < 0) continue;
        const name = /^(@[^/]+\/)?[^/]+/.exec(id.slice(at + 'node_modules/'.length))![0];
        packages.add(id.slice(0, at + 'node_modules/'.length) + name);
      }
    }
    const notices = [...packages].sort().map((directory) => {
      const { name, version, license } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      const file = readdirSync(directory).find((entry) => /^(licen[cs]e|copying)/i.test(entry));
      const text = file && existsSync(join(directory, file)) ? readFileSync(join(directory, file), 'utf8').trim() : noticeOf(directory, license);
      return `${name} ${version} (${license})\n\n${text}`;
    });
    const header = `Shed Builder includes these packages. Each is used under its license, below.\n\n`;
    this.emitFile({ type: 'asset', fileName: 'third-party-licenses.txt', source: header + notices.join(`\n\n${'-'.repeat(72)}\n\n`) + '\n' });
  },
};

export default defineConfig({
  plugins: [react(), versionFile, licenses],
  build: {
    // The 3D and PDF chunks load on demand and are mostly Three.js and jsPDF, each over 500 kB.
    chunkSizeWarningLimit: 750,
    rolldownOptions: {
      output: {
        // The libraries the form needs at once change only with a dependency update, so a release
        // leaves them cached. Three.js and the PDF code, with React's server renderer, stay in
        // their own on-demand chunks.
        codeSplitting: { groups: [{ name: 'vendor', test: /node_modules[\\/](react|scheduler|zod|react-dom(?![\\/].*server))[\\/]/ }] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
