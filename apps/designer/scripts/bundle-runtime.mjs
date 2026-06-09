#!/usr/bin/env node
// Bundles @cg/template-runtime to two payloads under
// `apps/designer/src/generated/`, imported by the browser platform as raw text
// (`?raw`):
//
//   cg-runtime.js       ESM  (es2022) — the preview iframe + the .vcg, which run
//                                       in modern browsers / the project Runtime.
//   cg-runtime.iife.js  IIFE (chrome71) — the file://-safe single-file CasparCG
//                                         export (D-019). Targets the oldest
//                                         supported CEF (CasparCG 2.3 LTS ≈
//                                         Chromium 71) so the output has no
//                                         optional chaining / nullish coalescing,
//                                         and exposes `window.CG = { createRuntime,
//                                         installCasparGlobals, … }`.
//
// Same TypeScript source feeds both — only the bundle format/target differ, so
// what the Designer shows IS what CasparCG plays.

import * as esbuild from 'esbuild';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const ENTRY = path.resolve(REPO_ROOT, 'packages/template-runtime/src/index.ts');
const OUT_DIR = path.resolve(APP_ROOT, 'src/generated');

await fs.mkdir(OUT_DIR, { recursive: true });

/** Bundle the runtime once and write it to `src/generated/<outName>`. */
async function bundle({ format, target, outName, globalName }) {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format,
    platform: 'browser',
    target,
    ...(globalName !== undefined ? { globalName } : {}),
    write: false,
    minify: false,
    sourcemap: false,
  });
  const out = result.outputFiles[0];
  if (!out) throw new Error(`esbuild produced no output for ${outName}`);
  const file = path.join(OUT_DIR, outName);
  await fs.writeFile(file, out.text, 'utf-8');
  console.log(
    `[bundle-runtime] wrote ${path.relative(APP_ROOT, file)} (${(out.contents.byteLength / 1024).toFixed(1)} KB)`,
  );
}

await bundle({ format: 'esm', target: 'es2022', outName: 'cg-runtime.js' });
await bundle({
  format: 'iife',
  target: 'chrome71',
  outName: 'cg-runtime.iife.js',
  globalName: 'CG',
});
