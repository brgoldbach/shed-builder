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

export default defineConfig({
  plugins: [react(), versionFile],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
