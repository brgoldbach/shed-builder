import { defineConfig } from '@playwright/test';

// The browser test (`npm run test:ui`): the built app in Chromium.
export default defineConfig({
  testDir: 'tests/ui',
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173' },
});
