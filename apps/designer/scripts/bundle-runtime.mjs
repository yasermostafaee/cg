#!/usr/bin/env node
// Bundles @cg/template-runtime to a single ESM file under
// `apps/designer/resources/template-runtime/cg.js`. The Designer reads
// that file at boot and feeds the bytes to ExportService + PreviewService
// as the `cgJs` payload. The export pipeline emits the same payload
// inside every `.vcg` so what the Designer shows IS what the Runtime
// plays.
//
// Mirrors `tools/template-fixtures/build.mjs`'s bundling step — the
// pattern is identical, so when M3.4's fixture builder evolves this
// script should follow.

import * as esbuild from 'esbuild';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const ENTRY = path.resolve(REPO_ROOT, 'packages/template-runtime/src/index.ts');
const OUT_DIR = path.resolve(APP_ROOT, 'resources/template-runtime');
const OUT_FILE = path.join(OUT_DIR, 'cg.js');

const result = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  minify: false,
  sourcemap: false,
});

const out = result.outputFiles[0];
if (!out) throw new Error('esbuild produced no output');

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(OUT_FILE, out.text, 'utf-8');
console.log(
  `[bundle-runtime] wrote ${path.relative(APP_ROOT, OUT_FILE)} (${(out.contents.byteLength / 1024).toFixed(1)} KB)`,
);
