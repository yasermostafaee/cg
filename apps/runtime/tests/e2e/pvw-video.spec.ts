import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { test, expect, buildValidVcg } from './fixtures/runtime.js';

/**
 * B-136 — PVW MUST BE ABLE TO PLAY A VIDEO, and the thing that decided it could
 * not was the EMBEDDING page's CSP, not the artifact's own.
 *
 * The Runtime replays an already-exported single-file page inside an
 * `<iframe srcDoc>` (`RehearsalFrame.tsx:236`), and a `srcdoc` document
 * INHERITS its embedder's policy — enforced IN ADDITION to the one the artifact
 * declares for itself, intersection wins. The exported page has carried
 * `media-src data:` since D-128 Phase 5 (`exporter-single-file.ts:410`), so the
 * artifact was always willing to play its own bytes; `apps/runtime/index.html`
 * simply never declared `media-src` at all, so media fell through to
 * `default-src 'self'` and every base64 `data:video/webm` in PVW was refused.
 *
 * WHY THIS TEST HAD TO BE AN E2E. Every existing CSP assertion in the repo
 * tests the ARTIFACT's own policy (`video-export.spec.ts:47`) — none tests the
 * embedder's, which is the one that actually decided this. CSP inheritance into
 * `srcdoc` is real-browser behaviour: jsdom does not enforce CSP at all, so no
 * unit test can observe it. Only a real Chromium can, and that is what runs here.
 *
 * The assertion is deliberately DOUBLE, so a failure says WHY rather than only
 * that something is wrong:
 *  - POSITIVE — the `<video>` reaches `readyState >= HAVE_METADATA`, i.e. the
 *    bytes were actually fetched and decoded. This is "the video renders".
 *  - NEGATIVE — no `securitypolicyviolation` naming `media-src`/`default-src`
 *    was recorded in the frame. This names the mechanism outright.
 *
 * Before the fix the positive assertion fails AND the negative one reports the
 * refusal; after it, both hold.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * The same 64×64 WebM the Designer's video suite uses — a REAL, decodable clip,
 * because a synthetic or truncated one would fail to decode with or without the
 * fix and could never tell the two apart. Inlined as base64 exactly as
 * `@cg/single-file-export` inlines a packaged video, so the byte path under test
 * is the shipped one.
 */
const FIXTURE = join(HERE, 'fixtures', 'seek-safe-64x64.webm');

/**
 * A stand-in for the served self-contained page, carrying a `data:` video.
 *
 * Modelled on `rehearse-composite.spec.ts`'s stub: the offline mock retains no
 * rendered page, so without an override PREVIEW shows its "unavailable in this
 * browser" text and no iframe exists at all. It also declares the artifact's OWN
 * permissive `media-src data:` — mirroring the real exporter — which is what
 * makes this a clean test of the EMBEDDER's policy: the artifact says yes, so
 * anything that still refuses the load came from the page around it.
 */
function stubPageWithVideo(dataUri: string): string {
  return `<!doctype html><html><head>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; media-src data:;" />
  <title>pvw-video</title></head>
<body style="margin:0">
  <div class="cg-stage" style="width:1920px;height:1080px">
    <video data-cg-element-id="vid-1" muted playsinline preload="auto"
           style="width:320px;height:180px" src="${dataUri}"></video>
  </div>
  <script>
    // Record refusals rather than asserting on them here: the spec reads this
    // back, so a blocked load names its own directive instead of surfacing as a
    // bare "readyState stayed 0".
    window.__cgViolations = [];
    document.addEventListener('securitypolicyviolation', function (e) {
      window.__cgViolations.push(e.violatedDirective + ' :: ' + e.blockedURI.slice(0, 24));
    });
    window.CG = { applyOutputPosition: function () {} };
    window.play = function () {}; window.update = function () {};
    window.next = function () {}; window.stop = function () {};
  </script>
</body></html>`;
}

async function stubRetainedPage(page: Page, html: string): Promise<void> {
  await page.evaluate((h: string) => {
    (
      window as unknown as { cg: { templates: { html: () => Promise<string> } } }
    ).cg.templates.html = () => Promise.resolve(h);
  }, html);
}

test('PVW plays a data: video — the Runtime page CSP admits the media its own artifacts carry', async ({
  app,
}) => {
  const page = app.page;
  const dataUri = `data:video/webm;base64,${(await readFile(FIXTURE)).toString('base64')}`;

  await stubRetainedPage(page, stubPageWithVideo(dataUri));
  const layer = await app.importVcg('video.vcg', await buildValidVcg('tpl-pvw-video'));

  await page
    .locator(`[data-layer="${String(layer)}"]`)
    .getByRole('button', { name: 'ON PVW', exact: true })
    .click();

  const frameEl = page.locator('iframe[data-rehearsal-frame]').first();
  await expect(frameEl).toBeAttached();
  const doc = frameEl.contentFrame();

  const video = doc.locator('video[data-cg-element-id]');
  await expect(video).toBeAttached();

  // POSITIVE — the bytes were fetched and decoded. Polled: the fetch of a
  // ~113KB data: URI plus decode is not instantaneous, and a bare read would
  // race it and fail for the wrong reason.
  await expect
    .poll(async () => await video.evaluate((v: HTMLVideoElement) => v.readyState), {
      message: 'the PVW <video> never reached HAVE_METADATA — its bytes were never decoded',
    })
    .toBeGreaterThanOrEqual(1);

  // NEGATIVE — and it was not merely slow: nothing refused the media. This is
  // the assertion that names B-136's mechanism if it ever returns.
  // Read through an element in the frame: a `FrameLocator` has no `evaluate` of
  // its own, and `locator.evaluate` runs in the frame's context, which is where
  // the recorder lives.
  const violations = await video.evaluate(
    () => (window as unknown as { __cgViolations?: string[] }).__cgViolations ?? [],
  );
  expect(violations.filter((v) => /media-src|default-src/.test(v))).toEqual([]);
});
