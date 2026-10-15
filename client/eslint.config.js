import js from '@eslint/js';
import react from 'eslint-plugin-react';
import globals from 'globals';

export default [
  { ignores: ['dist/**'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React 17+ automatic JSX runtime (used by @vitejs/plugin-react) never requires React in scope.
      'react/react-in-jsx-scope': 'off',
      // No PropTypes or TypeScript in this project (CLAUDE.md: plain JavaScript) —
      // disabled explicitly rather than adding a dependency neither spec calls for.
      'react/prop-types': 'off',
    },
  },
  {
    // Test files run under Vitest (Node), and vite.config.js itself is Node
    // tooling config — both need Node globals (`global`, `process`) on top
    // of the browser globals the app code itself runs under.
    files: ['**/*.test.{js,jsx}', 'vite.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
