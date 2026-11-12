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
