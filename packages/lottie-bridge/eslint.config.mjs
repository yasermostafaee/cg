import { base, broadcast } from '@cg/eslint-config';

export default [
  ...base,
  broadcast({ files: ['src/**/*.ts'] }),
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
