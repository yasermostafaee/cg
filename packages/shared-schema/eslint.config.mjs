import { base, cefCompat } from '@cg/eslint-config';

export default [
  ...base,
  // B-066 — shared-schema source is BUNDLED INTO the broadcast output (it
  // rides into the served template bundle via @cg/template-runtime), so it
  // must stay on CasparCG's CEF baseline: no post-Chromium-71 built-ins.
  cefCompat({ files: ['src/**/*.ts'] }),
  {
    ignores: ['dist/**', 'coverage/**', '*.tsbuildinfo'],
  },
];
