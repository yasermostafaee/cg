// Points the EXISTING curated CEF banned-builtins list (@cg/eslint-config — the same list
// packages/single-file-export/tests/cef-compat.test.ts scans exports with) at the two
// hardware artifacts. Requires @cg/eslint-config to be BUILT (pnpm --filter @cg/eslint-config build).
//
//   node tools/spikes/video-convert/check-cef.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(dir, '..', '..', '..');
// The package is ESM-only (exports: import), so pull the built dist directly — the same
// curated list cef-compat.test.ts uses (the spike itself deliberately has no package.json).
const { CEF_BANNED_BUILTINS, CEF_CHROMIUM_BASELINE } = await import(
  pathToFileURL(join(repoRoot, 'packages', 'eslint-config', 'dist', 'index.js')).href
);

const artifacts = readdirSync(join(dir, 'artifacts')).filter((f) => f.endsWith('.html'));
if (artifacts.length === 0) {
  console.error('no artifacts found — build them first (test.mjs or the page)');
  process.exit(1);
}

let bad = 0;
for (const name of artifacts) {
  const text = readFileSync(join(dir, 'artifacts', name), 'utf8');
  const hits = [];
  for (const banned of CEF_BANNED_BUILTINS) {
    for (const needle of banned.needles) {
      const n = text.split(needle).length - 1;
      if (n > 0) hits.push(`${banned.name} (Chromium ${banned.minChromium}+): "${needle}" ×${n}`);
    }
  }
  if (hits.length) {
    bad++;
    console.error(
      `✗ ${name} — banned built-ins vs CEF baseline (Chromium ${CEF_CHROMIUM_BASELINE}):`,
    );
    for (const h of hits) console.error(`    ${h}`);
  } else {
    console.log(`✓ ${name} — clean vs CEF baseline (Chromium ${CEF_CHROMIUM_BASELINE})`);
  }
}
process.exit(bad === 0 ? 0 : 1);
