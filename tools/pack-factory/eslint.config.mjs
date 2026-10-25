import { base, node } from '@cg/eslint-config';

export default [
  ...base,
  node({ files: ['src/**/*.ts', 'tests/**/*.ts', 'bin/**/*.mjs', '*.config.ts'] }),
  {
    ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**', '*.tsbuildinfo'],
  },
];
