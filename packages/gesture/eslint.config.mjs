import { base, renderer } from '@cg/eslint-config';

export default [
  ...base,
  renderer({ files: ['src/**/*.ts'] }),
  {
    ignores: ['dist/**', 'coverage/**', '*.tsbuildinfo'],
  },
];
