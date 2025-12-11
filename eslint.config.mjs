// ESLint flat config for React Native + TypeScript
// Note: TypeScript files are checked by tsc, so we focus on JS files here
export default [
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'build/**',
      'dist/**',
      '.git/**',
      '*.config.js',
      'metro.config.js',
      '**/*.ts',
      '**/*.tsx',
    ],
  },
];
