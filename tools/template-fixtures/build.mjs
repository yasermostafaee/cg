#!/usr/bin/env node
// Builds starter .vcg fixtures by:
//   1. Bundling @cg/template-runtime to a single ESM file (cg.js).
//   2. Reading the per-fixture scene + extras + CSS.
//   3. Writing index.html / cg.js / cg.css / template.json to
//      fixtures/templates/<name>/.
//   4. Calling @cg/vcg-format.pack() to produce a packed .vcg too.

import * as esbuild from 'esbuild';
import { pack, verify } from '@cg/vcg-format';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEMPLATE_RUNTIME_ENTRY = path.resolve(
  REPO_ROOT,
  'packages/template-runtime/src/index.ts',
);

const FIXTURES = [
  {
    name: 'persian-lower-third',
    sourceModule: './persian-lower-third.scene.mjs',
  },
];

async function bundleRuntime() {
  console.log('[build] bundling @cg/template-runtime...');
  const result = await esbuild.build({
    entryPoints: [TEMPLATE_RUNTIME_ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    minify: false,
    sourcemap: false,
  });
  const file = result.outputFiles[0];
  if (!file) throw new Error('esbuild produced no output');
  console.log(`[build] bundled runtime: ${(file.contents.byteLength / 1024).toFixed(1)} KB`);
  return file.text;
}

function buildIndexHtml(scene) {
  // Single-file HTML that boots the runtime. The runtime is loaded as ESM
  // (modern CEF supports it). Fonts load via the per-template cg.css.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${scene.resolution.width}, initial-scale=1" />
    <title>${escapeHtml(scene.name)}</title>
    <link rel="stylesheet" href="./cg.css" />
  </head>
  <body class="cg-pending">
    <script type="module">
      import { createRuntime, installCasparGlobals } from './cg.js';
      (async () => {
        try {
          const res = await fetch('./template.json');
          const scene = await res.json();
          const runtime = createRuntime(scene);
          installCasparGlobals(runtime);
          await runtime.ready;
          // Auto-play after a short delay so the template is usable when
          // loaded via PLAY [HTML] alone (no CG PLAY required). CasparCG's
          // CG PLAY behavior on HTML producer is fragile (M1 Spike D);
          // browser/desktop previews also benefit from this.
          setTimeout(() => {
            if (document.body.classList.contains('cg-pending')) {
              void runtime.play({});
            }
          }, 500);
        } catch (e) {
          // Surface boot errors so the operator sees something
          const pre = document.createElement('pre');
          pre.style.cssText = 'color:#F87171;background:#000;padding:16px;font:14px monospace;white-space:pre-wrap;';
          pre.textContent = 'cg boot error: ' + (e && e.message ? e.message : String(e));
          document.body.appendChild(pre);
          document.body.classList.remove('cg-pending');
        }
      })();
    </script>
  </body>
</html>
`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

async function buildOne(fixture, cgJs) {
  console.log(`[build] === ${fixture.name} ===`);
  const sourcePath = path.resolve(__dirname, fixture.sourceModule);
  const mod = await import(`file://${sourcePath.replace(/\\/g, '/')}`);
  const { scene, manifestExtras, cgCss } = mod;
  if (!scene || !manifestExtras || !cgCss) {
    throw new Error(`Fixture ${fixture.name} missing scene/manifestExtras/cgCss`);
  }

  const indexHtml = buildIndexHtml(scene);

  const outDir = path.resolve(REPO_ROOT, 'fixtures', 'templates', fixture.name);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'index.html'), indexHtml, 'utf-8');
  await fs.writeFile(path.join(outDir, 'cg.js'), cgJs, 'utf-8');
  await fs.writeFile(path.join(outDir, 'cg.css'), cgCss, 'utf-8');
  await fs.writeFile(
    path.join(outDir, 'template.json'),
    JSON.stringify(scene, null, 2),
    'utf-8',
  );
  console.log(`[build]   unpacked → ${path.relative(REPO_ROOT, outDir)}`);

  // Pack to .vcg too — exercises the vcg-format pipeline on real data.
  const vcg = await pack({
    scene,
    manifestExtras,
    indexHtml,
    cgJs,
    cgCss,
  });
  const vcgPath = path.resolve(REPO_ROOT, 'fixtures', 'templates', `${fixture.name}.vcg`);
  await fs.writeFile(vcgPath, vcg);
  console.log(
    `[build]   packed   → ${path.relative(REPO_ROOT, vcgPath)} (${(vcg.byteLength / 1024).toFixed(1)} KB)`,
  );

  // Round-trip verify
  const result = await verify(vcg);
  if (!result.ok) {
    console.error(`[build]   verify FAILED:\n  - ${result.errors.join('\n  - ')}`);
    throw new Error(`${fixture.name}: .vcg failed verify()`);
  }
  console.log('[build]   verify   → ok');
}

async function main() {
  const cgJs = await bundleRuntime();
  for (const fixture of FIXTURES) {
    await buildOne(fixture, cgJs);
  }
  console.log('\n[build] done');
}

await main();
