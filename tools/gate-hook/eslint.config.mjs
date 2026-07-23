import { base, node } from '@cg/eslint-config';

export default [
  ...base,
  node({ files: ['src/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.ts', 'types/**/*.ts'] }),
  {
    ignores: ['*.tsbuildinfo'],
  },
];
