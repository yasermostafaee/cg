import { base, node } from '@cg/eslint-config';

export default [
  ...base,
  node({ files: ['src/**/*.ts', 'tests/**/*.ts'] }),
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['dist/**', 'coverage/**', '*.tsbuildinfo'],
  },
];
