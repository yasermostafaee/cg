import { base, node } from '@cg/eslint-config';

export default [
  ...base,
  node({ files: ['build.mjs', '*.scene.mjs'] }),
  {
    files: ['build.mjs'],
    rules: {
      // Build scripts log progress; that's the point.
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        HTMLElement: 'readonly',
      },
    },
  },
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
];
