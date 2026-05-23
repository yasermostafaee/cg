import { base, node } from '@cg/eslint-config';

export default [
  ...base,
  node({ files: ['src/**/*.ts'] }),
  {
    ignores: ['dist/**', 'coverage/**', '*.tsbuildinfo'],
  },
];
