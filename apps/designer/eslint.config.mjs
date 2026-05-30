// Composes @cg/eslint-config tiers across the app's directory structure.
// Requires `pnpm --filter @cg/eslint-config build` to have run first
// (turbo orchestrates this via the `lint` task's dependsOn).
//
// Browser SPA: the whole app (renderer UI + the in-process platform bridge)
// is Renderer-tier. Node-tier rules only apply to build scripts + tests.
import { base, node, renderer } from '@cg/eslint-config';

export default [
  ...base,
  renderer({ files: ['src/**/*.{ts,tsx,mts,cts}'] }),
  node({ files: ['scripts/**/*.{mjs,js}', 'tests/**/*.{ts,tsx}'] }),
  {
    files: ['scripts/**/*.{mjs,js}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Config files run in Node but live outside the tier dirs above.
    files: ['*.config.{ts,mts,cts,js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/**', '.vite/**', 'src/generated/**', '*.tsbuildinfo'],
  },
];
