import { base, node } from '@cg/eslint-config';

export default [
  ...base,
  node({ files: ['src/**/*.ts', 'bin/**/*.mjs'] }),
  {
    ignores: ['dist/**', 'public/**', '*.tsbuildinfo'],
  },
];
