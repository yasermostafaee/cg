import { base, broadcast } from '@cg/eslint-config';

export default [
  ...base,
  broadcast({ files: ['src/**/*.ts'] }),
  {
    // Test fixtures legitimately use `!` to narrow array access. The
    // package's source tree still enforces the rule.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['dist/**', 'coverage/**', '*.tsbuildinfo'],
  },
];
