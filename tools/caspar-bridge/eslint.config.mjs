import { base, node } from '@cg/eslint-config';

export default [
  ...base,
  /*
    ⚠ `scripts/**` is here because `eslint .` lints it and it is Node code like `bin/**`.
    `DELTA C` added `scripts/dev-playout.mjs`, and without this the shared base tier lints it as
    environment-less: `process` and `console` come back as `no-undef`. The `.ts` sibling is
    covered too, so the owner-facing demo is held to the same rules as the product.
  */
  node({ files: ['src/**/*.ts', 'tests/**/*.ts', 'bin/**/*.mjs', 'scripts/**/*.{ts,mjs}'] }),
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
