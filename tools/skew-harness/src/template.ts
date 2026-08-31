import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import type { Scene } from '@cg/shared-schema';

/**
 * Build the ONE self-contained HTML string the bridge serves and CEF fetches.
 *
 * `TemplateRegistry` stores a single HTML document per template and
 * `TemplateHttpServer` answers `GET /template/<id>` with exactly that string, so there is no
 * second asset to fetch: the runtime bundle and the scene are inlined here.
 *
 * 🔴 **It is the REAL `@cg/template-runtime`, bundled from source.** The page half of `k` is
 * style recalc, layout, paint and CEF's handoff for the actual mask writes
 * (`applyLiveSourceMask` writes eight properties per punched element), so a stand-in page
 * that moved a coloured `div` would measure a different and smaller quantity — which is
 * precisely the category error `B-174` was re-scoped for.
 *
 * ⚠ `target: 'chrome71'` matches what `@cg/template-fixtures` ships. The production CEF is
 * far newer, but building for the same floor keeps this page and the product's own export
 * on one syntax level, so the harness cannot accidentally measure a page the exporter could
 * not have produced.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));

function runtimeEntry(): string {
  // dist/ and src/ are both two levels under the workspace root, so one relative path serves
  // the built harness and a `tsx`-style source run alike.
  return path.resolve(HERE, '..', '..', '..', 'packages', 'template-runtime', 'src', 'index.ts');
}

export async function bundleTemplateRuntime(): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [runtimeEntry()],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome71',
    write: false,
    minify: false,
    sourcemap: false,
  });
  const file = result.outputFiles?.[0];
  if (file === undefined) throw new Error('esbuild produced no output for @cg/template-runtime');
  return file.text;
}

/**
 * The page.
 *
 * It does NOT auto-play. The bridge's `take` issues `CG ADD` then `CG PLAY`, and a page that
 * played itself on a timer would put content on the channel at a moment no command chose —
 * which would land inside a recording window and read as a transition.
 */
export function buildTemplateHtml(scene: Scene, runtimeBundle: string): string {
  const sceneJson = JSON.stringify(scene);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>B-174 skew harness</title>
    <style>
      html, body { margin: 0; padding: 0; width: 1920px; height: 1080px; overflow: hidden; background: transparent; }
    </style>
  </head>
  <body class="cg-pending">
    <script type="module">
${runtimeBundle}
      const scene = ${sceneJson};
      const runtime = createRuntime(scene, { mode: 'output' });
      installCasparGlobals(runtime);
      window.__cgSkewReady = false;
      runtime.ready.then(function () { window.__cgSkewReady = true; });
    </script>
  </body>
</html>
`;
}
