import { base, node } from '@cg/eslint-config';

export default [
  ...base,
  node({ files: ['src/**/*.ts', 'tests/**/*.ts', 'bin/**/*.mjs'] }),
  {
    ignores: ['dist/**', 'evidence/**', '*.tsbuildinfo'],
  },
];
