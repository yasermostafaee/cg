// Composes @cg/eslint-config tiers across the app's directory structure.
// Requires `pnpm --filter @cg/eslint-config build` to have run first
// (turbo orchestrates this via the `lint` task's dependsOn).
//
// Browser SPA: the whole app (renderer UI + the in-process platform bridge)
// is Renderer-tier. Node-tier rules only apply to tests.
import { base, jsxA11y, node, renderer } from '@cg/eslint-config';

export default [
  ...base,
  renderer({ files: ['src/**/*.{ts,tsx,mts,cts}'] }),
  // Accessibility rules (warn-level) for the React UI. This app has no
  // canvas/Konva editor or template-output JSX, so nothing is excluded.
  jsxA11y({ files: ['src/**/*.tsx'] }),
  node({ files: ['tests/**/*.{ts,tsx}'] }),
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
    // `*.timestamp-*.mjs` are transient Vite config-load artifacts.
    ignores: ['dist/**', '.vite/**', '*.tsbuildinfo', '*.timestamp-*.mjs'],
  },
];
