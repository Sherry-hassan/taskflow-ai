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
];
