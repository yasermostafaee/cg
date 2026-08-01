import { base, node } from '@cg/eslint-config';

export default [
  ...base,
  node({ files: ['src/**/*.ts', 'src/**/*.mjs', 'tests/**/*.ts'] }),
  {
    ignores: ['coverage/**', '*.tsbuildinfo'],
  },
];
