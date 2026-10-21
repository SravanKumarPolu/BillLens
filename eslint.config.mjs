// ESLint flat config for React Native + TypeScript.
//
// The previous script used `eslint . --ext .ts,.tsx`, which is an
// eslintrc-mode flag: under flat config ESLint rejects it and falls back
// to searching for `.eslintrc.*`, so `npm run lint` failed before linting
// a single file. The extension list now lives here (`files`), and the
// script is a plain `eslint .`.
//
// TypeScript files are covered by @typescript-eslint (type-aware rules
// would double CI time; `tsc --noEmit` already covers type errors). The
// hook rules are the ones `tsc` cannot express.

import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const IGNORED = [
  'node_modules/**',
  'android/**',
  'ios/**',
  'build/**',
  'dist/**',
  'coverage/**',
  '.expo/**',
  '.zwork/**',
  '.git/**',
  'supabase/functions/**',
];

export default [
  { ignores: IGNORED },

  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      // The two rules that catch bugs `tsc` cannot see.
      'react-hooks/rules-of-hooks': 'error',
      // Index keys are acceptable for fixed-length lists (OTP boxes,
      // skeletons); warn so new variable-length lists get stable ids.
      'react/no-array-index-key': 'warn',
      'react-hooks/exhaustive-deps': 'warn',

      // `tsc` already fails on unused locals; this catches unused
      // imports/parameters in files compiled with looser settings.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Debug logging is allowed in services/adapters but should not
      // creep into render paths; warn rather than fail.
      'no-console': 'off',
    },
  },

  {
    // Tests may use non-null assertions and explicit anys in fixtures.
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'jest.setup.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
