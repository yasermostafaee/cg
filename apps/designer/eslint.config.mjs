// Composes @cg/eslint-config tiers across the app's directory structure.
// Requires `pnpm --filter @cg/eslint-config build` to have run first
// (turbo orchestrates this via the `lint` task's dependsOn).
import { base, node, renderer } from '@cg/eslint-config';

export default [
  ...base,
  node({ files: ['src/main/**/*.{ts,mts,cts}', 'src/preload/**/*.{ts,mts,cts}'] }),
  renderer({ files: ['src/renderer/**/*.{ts,tsx,mts,cts}'] }),
  {
    // Config files run in Node but live outside the tier dirs above.
    files: ['*.config.{ts,mts,cts,js,mjs,cjs}', 'electron.vite.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    ignores: ['out/**', 'dist/**', '.vite/**', 'release/**', '*.tsbuildinfo'],
  },
];
