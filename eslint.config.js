import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  { languageOptions: { globals: globals.browser } },
  { files: ['scripts/**'], languageOptions: { globals: globals.node } },
  {
    // The model and the drawings run in Node: no React, no DOM, no Three.js.
    files: ['src/core/**', 'src/drawings/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-dom', 'react/*', 'react-dom/*', 'three', 'three/*', '**/ui/*', '**/view3d/*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
    },
  },
);
