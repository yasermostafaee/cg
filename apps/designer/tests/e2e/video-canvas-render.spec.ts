import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * D-128 — a stored, playability-verified clip must RENDER on the canvas: the
 * canvas-blank regression guard.
 *
 * THE FIELD BUG (root-caused 2026-07-25): ffmpeg/libvpx encodes the WebM alpha
 * plane as a SECOND VP8 stream (BlockAdditional) whose keyframes are placed on
 * the alpha encoder's own schedule — they need not align with the main
 * stream's. A COLD seek (preload='metadata') into a GOP whose governing main
 * keyframe carries an alpha INTER frame hands Chromium's freshly-initialized
 * alpha decoder a reference-less frame → terminal `PIPELINE_ERROR_DECODE`, a
 * permanently blank element — while metadata, a 5-point seek sweep on an
 * eager-loading element, and full sequential playback ALL pass (which is why
 * the import modal's "✓ Output plays" verdict was honestly true on a clip whose
 * canvas render was blank). NOT blob scope, NOT CSP, NOT a size threshold: the
 * same bytes fetch + hash identically inside the iframe, and a 2.1 MB clip
 * failed while a 4.3 MB clip rendered.
 *
 * FIXTURES (committed, generated with the app's EXACT encoder args — crf 4,
 * qmax 16, b:v 20M, g 25, auto-alt-ref 0, yuva420p — via native ffmpeg 8.1.2):
 *
 *   ffmpeg -f lavfi -i "testsrc2=rate=25:size=<SIZE>" -t 3.5 \
 *     -filter_complex "[0:v]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':\
 *       a='255*gt(mod(X+T*20,64),44)'[out]" -map "[out]" \
 *     -c:v libvpx -pix_fmt yuva420p -auto-alt-ref 0 -crf 4 -qmax 16 -b:v 20M \
 *     -g 25 -deadline good -cpu-used 5 -an -r 25 out.webm
 *
 * - `fragile-alpha-seek-320x90.webm` — container-verified alpha keyframes exist
 *   only in the FIRST GOP; every cold seek from t=1.0s to the end (including
 *   the mid-clip poster at 1.76s) dies with PIPELINE_ERROR_DECODE pre-fix.
 * - `seek-safe-64x64.webm` — same recipe/content at 64×64; libvpx happened to
 *   emit aligned alpha keyframes throughout, every cold seek decodes. The A/B
 *   control: same pipeline, only the alpha keyframe placement differs.
 *
 * The bytes are injected via `assets.storeBytes` (the modal's own post-convert
 * store path) rather than re-encoding through the single-threaded wasm — a
 * 3.5 s encode would blow the B-078 budgets and the encoder is not what this
 * spec guards. Placement uses the drag-from-assets path.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAGILE = join(HERE, 'fixtures', 'fragile-alpha-seek-320x90.webm');
const SAFE = join(HERE, 'fixtures', 'seek-safe-64x64.webm');

/** storeBytes + drag-drop placement; returns the assetId. */
async function storeAndPlace(page: Page, file: string, filename: string): Promise<string> {
  const b64 = readFileSync(file).toString('base64');
  const assetId = await page.evaluate(
    async ({ data, name }) => {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const { asset } = await window.cg.assets.storeBytes({
        bytes,
        filename: name,
        kind: 'video',
      });
      return asset.assetId;
    },
    { data: b64, name: filename },
  );
  const dropped = await page.evaluate(async (id) => {
    const canvas = document.querySelector('[data-testid="canvas-surface"]');
    if (canvas === null) return false;
    const dt = new DataTransfer();
    dt.setData('application/x-cg-asset-id', id);
    dt.setData('application/x-cg-asset-kind', 'video');
    for (const type of ['dragover', 'drop']) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      canvas.dispatchEvent(ev);
    }
    return true;
  }, assetId);
  expect(dropped).toBe(true);
  return assetId;
}

/**
 * Wait for the canvas iframe's <video> for `assetId` to show a REAL poster
 * frame: blob src wired, no media error, decoded data, off frame 0, and —
 * the actual "not blank" assertion — visible pixels when drawn to a canvas.
 */
async function expectCanvasVideoRenders(page: Page, assetId: string): Promise<void> {
  const frame = page.frameLocator('iframe[title="cgpreview"]');
  const videoLoc = frame.locator(`video[data-cg-asset-id="${assetId}"]`);
  await expect(videoLoc).toBeAttached({ timeout: 15_000 });
  const render = await videoLoc.evaluate(async (v: HTMLVideoElement) => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (v.error !== null) return { ok: false, error: v.error.message };
      const src = v.getAttribute('src') ?? '';
      // SETTLED poster, not merely progressing: the routine's recovery rung
      // plays muted at 16x toward the poster time, so a mid-recovery sample
      // would read currentTime > 0 with playbackRate 16. Settled = paused with
      // the rate restored (rung 1 never plays; rung 2 pauses + restores on
      // reaching the poster).
      if (
        src.startsWith('blob:') &&
        v.readyState >= 2 &&
        v.currentTime > 0 &&
        v.paused &&
        v.playbackRate === 1
      ) {
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d');
        if (ctx === null) return { ok: false, error: 'no 2d context' };
        ctx.drawImage(v, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let visible = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]! >= 8) visible++;
        return {
          ok: true,
          currentTime: v.currentTime,
          visibleFrac: visible / (d.length / 4),
          playbackRate: v.playbackRate,
          paused: v.paused,
        };
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return {
      ok: false,
      error: `never rendered: rs=${String(v.readyState)} t=${String(v.currentTime)} src=${v.getAttribute('src') ?? ''}`,
    };
  });
  expect(render, JSON.stringify(render)).toMatchObject({ ok: true });
  if (render.ok) {
    // The mid-clip poster, not the (transparent) frame 0.
    expect(render.currentTime).toBeGreaterThan(1.2);
    // NOT BLANK — the moving band pattern is ~31% opaque at any frame.
    expect(render.visibleFrac).toBeGreaterThan(0.05);
    // The recovery rung must leave the element ready for a REAL play.
    expect(render.playbackRate).toBe(1);
    expect(render.paused).toBe(true);
  }
}

test('a seek-fragile VP8+alpha clip (the canvas-blank class) renders its poster on the canvas AND in the assets panel', async ({
  app,
  page,
}) => {
  await app.newProject('VideoFragileSeek');
  // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
  await app.setSceneDuration(500);
  const assetId = await storeAndPlace(page, FRAGILE, 'fragile-alpha-seek.webm');
  // The element lands and is selected (the drop's metadata probe resolved).
  await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).toHaveValue('Video');
  await expectCanvasVideoRenders(page, assetId);

  // A PARENT-document thumbnail (assets-panel tile / Inspector strip — both are
  // the shared VideoPoster) runs the same routine — pre-fix these were equally
  // blank (same cold seek, same terminal error class).
  await page.getByRole('button', { name: 'Project assets' }).click();
  const tile = page.locator('video').first();
  await expect(tile).toBeAttached({ timeout: 10_000 });
  const tileState = await tile.evaluate(async (v: HTMLVideoElement) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (v.error !== null) return { ok: false, error: v.error.message };
      // Same settled-poster condition as the canvas check (a mid-recovery
      // sample reads rate 16 while the routine plays toward the poster).
      if (v.readyState >= 2 && v.currentTime > 0 && v.paused && v.playbackRate === 1) {
        return { ok: true, t: v.currentTime, rate: v.playbackRate };
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false, error: `rs=${String(v.readyState)} t=${String(v.currentTime)}` };
  });
  expect(tileState, JSON.stringify(tileState)).toMatchObject({ ok: true });
});

test('A/B: the seek-safe control and the fragile clip BOTH render on one canvas (size/pipeline is not the variable)', async ({
  app,
  page,
}) => {
  // Sized at authoring time for its content — TWO sequential 15s-bounded media
  // waits plus app boot — not a bumped budget covering a flake (B-078 rule).
  test.setTimeout(60_000);
  await app.newProject('VideoSeekAB');
  // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
  await app.setSceneDuration(500);
  const safeId = await storeAndPlace(page, SAFE, 'seek-safe.webm');
  const fragileId = await storeAndPlace(page, FRAGILE, 'fragile-alpha-seek.webm');
  await expectCanvasVideoRenders(page, safeId);
  await expectCanvasVideoRenders(page, fragileId);
});
