import { base, broadcast, node } from '@cg/eslint-config';

export default [
  ...base,
  // The exporter is browser-tier (DOM globals: btoa, fetch, document, Blob, URL).
  broadcast({ files: ['src/**/*.ts'] }),
  // The build-time bundle generator runs in Node.
  node({ files: ['scripts/**/*.mjs'] }),
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['dist/**', 'coverage/**', 'src/generated/**', '*.tsbuildinfo'],
  },
];
