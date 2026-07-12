import { base, broadcast, node } from '@cg/eslint-config';

export default [
  ...base,
  // The exporter is browser-tier (DOM globals: btoa, fetch, document, Blob, URL).
  broadcast({ files: ['src/**/*.ts'] }),
  {
    // B-066 — the broadcast tier's CEF built-in bans do NOT apply to the
    // exporter's OWN code: it runs in the apps' modern browsers and only
    // PRODUCES the CEF page. What actually ships to CEF is the generated
    // runtime bundle, guarded where it matters — the artifact scan in
    // tests/cef-compat.test.ts (plus the broadcast-tier lint on
    // @cg/template-runtime / @cg/shared-schema sources themselves).
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
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
