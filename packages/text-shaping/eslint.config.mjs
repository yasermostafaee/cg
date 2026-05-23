import { base } from '@cg/eslint-config';

export default [
  ...base,
  {
    ignores: ['dist/**', 'coverage/**', '*.tsbuildinfo'],
  },
];
