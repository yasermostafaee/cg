import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures/designer.js';

/**
 * D-128 Phase 2 — the video import pipeline end-to-end, in the REAL built app:
 * pick → probe → convert (real ffmpeg.wasm, single-threaded) → stored asset →
 * the stored WebM DECODES via a blob-URL `<video>` (the assertion that would
 * have caught the missing `media-src` CSP hole) → drag-from-assets creates a
 * `video` element.
 *
 * The fixture is the Phase-1 spike's 64×64/1.6 s rawvideo-BGRA AVI (committed
 * here so this spec survives the spike dir's eventual deletion). Conversion of
 * it measured ~0.2 s in-app (spike) — comfortably inside the B-078 budgets.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'box-64x64-bgra.avi');

test('a video imports, its stored WebM decodes (CSP media-src), and drag places a video element', async ({
  app,
  page,
}) => {
  await app.newProject('VideoImport');

  // ---- import through the real modal ----
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'box-64x64-bgra.avi',
    mimeType: 'video/x-msvideo',
    buffer: readFileSync(FIXTURE),
  });

  // probe lands (64×64, 25 fps) and the fps conform warning shows (25 ≠ 50)
  const meta = page.locator('[data-testid="video-probe-meta"]');
  await expect(meta).toContainText('64×64');
  await expect(page.getByText(/conforming to the project channel's 50 fps/)).toBeVisible();

  // convert; the modal closes on success (store-then-place)
  await page.getByRole('button', { name: 'Convert & import' }).click();
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached({
    timeout: 25_000,
  });

  // the stored asset is listed as the converted WebM
  await expect(page.getByText('box-64x64-bgra', { exact: false }).first()).toBeVisible();

  // ---- THE CSP GUARD: the stored bytes must decode through a blob-URL <video> ----
  const decode = await page.evaluate(async () => {
    const assets = await window.cg.assets.list();
    const vid = assets.find((a) => a.kind === 'video');
    if (vid === undefined) return { ok: false as const, why: 'no stored video asset' };
    const url = await window.cg.assets.url(vid.assetId);
    if (url === null) return { ok: false as const, why: 'url() returned null' };
    return await new Promise<{ ok: boolean; why: string }>((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () =>
        resolve({
          ok: v.duration > 0 && v.videoWidth === 64,
          why: `duration=${String(v.duration)} ${String(v.videoWidth)}x${String(v.videoHeight)}`,
        });
      v.onerror = () =>
        resolve({ ok: false, why: `decode error: ${v.error?.message ?? 'unknown'}` });
      v.src = url;
    });
  });
  expect(decode, decode.why).toMatchObject({ ok: true });

  // place-on-confirm already created one element; note its presence, then add a
  // second via drag-from-assets (the other entry point).
  const dropped = await page.evaluate(async () => {
    const assets = await window.cg.assets.list();
    const vid = assets.find((a) => a.kind === 'video');
    if (vid === undefined) return false;
    const canvas = document.querySelector('[data-testid="canvas-surface"]');
    if (canvas === null) return false;
    const dt = new DataTransfer();
    dt.setData('application/x-cg-asset-id', vid.assetId);
    dt.setData('application/x-cg-asset-kind', 'video');
    for (const type of ['dragover', 'drop']) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      canvas.dispatchEvent(ev);
    }
    return true;
  });
  expect(dropped).toBe(true);

  // the drop's async metadata probe resolves and selects the new element — the
  // Inspector's name field reads "Video" and no failure toast appeared.
  await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).toHaveValue('Video');
  await expect(page.getByText('could not be decoded')).not.toBeAttached();
  await expect(page.getByText('could not be read')).not.toBeAttached();
});

test('back-to-back conversions of a known-good file BOTH succeed (fresh worker per import) — and the re-import is deduped', async ({
  app,
  page,
}) => {
  // The field gap the original suite missed: on a reused wasm instance the
  // SECOND import of a perfectly good file crashed with `ErrnoError: FS error`
  // (alternating good → crash → good). Every import now gets a fresh worker.
  // The re-import of the SAME bytes is now DETECTED as a duplicate (dedupe by
  // source hash, not filename), so this drives "Convert again" to still force a
  // second real encode — pinning both the dedupe detection AND the fresh worker.
  await app.newProject('VideoTwice');
  await page.getByRole('button', { name: 'Project assets' }).click();
  const buffer = readFileSync(FIXTURE);

  for (const attempt of [1, 2]) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
    await page.getByRole('menuitem', { name: 'Video…' }).click();
    await (
      await chooser
    ).setFiles({
      name: `clip-${String(attempt)}.avi`,
      mimeType: 'video/x-msvideo',
      buffer,
    });
    // the probe must land on READY — never on either failure message
    await expect(
      page.locator('[data-testid="video-probe-meta"]'),
      `import ${String(attempt)} probe`,
    ).toContainText('64×64');
    await expect(page.getByText('internal error')).not.toBeAttached();
    await expect(page.getByText('could not be read as a video')).not.toBeAttached();
    await page.getByRole('button', { name: 'Convert & import' }).click();
    if (attempt === 2) {
      // same bytes as attempt 1 → deduped BEFORE any encode; force a second copy
      await expect(page.getByText('already imported')).toBeVisible({ timeout: 25_000 });
      await page.getByRole('button', { name: 'Convert again' }).click();
    }
    await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached({
      timeout: 25_000,
    });
  }
  await expect(page.getByText('clip-1', { exact: false }).first()).toBeVisible();
});

test('an imported video RENDERS in the canvas frame at a NON-BLANK mid-clip poster (D-128 Phase 3)', async ({
  app,
  page,
}) => {
  await app.newProject('VideoRender');
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'render-clip.avi',
    mimeType: 'video/x-msvideo',
    buffer: readFileSync(FIXTURE),
  });
  await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText('64×64');
  // place-on-confirm creates a video element on the canvas
  await page.getByRole('button', { name: 'Convert & import' }).click();
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached({
    timeout: 25_000,
  });

  // The canvas iframe renders a REAL <video> (not the Phase-2 placeholder box).
  const frame = page.frameLocator('iframe[title="cgpreview"]');
  const videoLoc = frame.locator('video[data-cg-asset-id]');
  await expect(videoLoc).toBeAttached({ timeout: 15_000 });

  // The host seeks it OFF frame 0 to the mid-clip poster (decision (a)): once the
  // blob src is wired + decoded, currentTime advances to ~midpoint of the clip.
  const render = await videoLoc.evaluate(async (v: HTMLVideoElement) => {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const src = v.getAttribute('src') || '';
      if (src.indexOf('blob:') === 0 && v.readyState >= 1 && v.currentTime > 0) {
        return { ok: true, currentTime: v.currentTime, posterMs: Number(v.dataset.cgPosterMs) };
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false, rs: v.readyState, t: v.currentTime, src: v.getAttribute('src') };
  });
  expect(render, JSON.stringify(render)).toMatchObject({ ok: true });
  if (render.ok) {
    // poster time is the clip midpoint (~0.8s of the 1.6s fixture), NOT frame 0
    expect(render.currentTime).toBeGreaterThan(0.4);
    expect(render.posterMs).toBeGreaterThan(400);
  }
});

test('re-importing the same source is deduped: "Use existing" places an element with NO second conversion', async ({
  app,
  page,
}) => {
  await app.newProject('VideoDedupe');
  await page.getByRole('button', { name: 'Project assets' }).click();
  const buffer = readFileSync(FIXTURE);

  const importOnce = async (): Promise<void> => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
    await page.getByRole('menuitem', { name: 'Video…' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'dedupe-clip.avi',
      mimeType: 'video/x-msvideo',
      buffer,
    });
    await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText('64×64');
  };

  // first import converts and stores one video asset
  await importOnce();
  await page.getByRole('button', { name: 'Convert & import' }).click();
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached({
    timeout: 25_000,
  });
  const videosAfterFirst = await page.evaluate(
    async () => (await window.cg.assets.list()).filter((a) => a.kind === 'video').length,
  );
  expect(videosAfterFirst).toBe(1);

  // re-import the same source → duplicate detected → Use existing places an
  // element without creating a second asset
  await importOnce();
  await page.getByRole('button', { name: 'Convert & import' }).click();
  await expect(page.getByText('already imported')).toBeVisible({ timeout: 25_000 });
  await page.getByRole('button', { name: 'Use existing' }).click();
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();
  // still exactly ONE stored video asset (no re-encode, no new asset)
  const videosAfterSecond = await page.evaluate(
    async () => (await window.cg.assets.list()).filter((a) => a.kind === 'video').length,
  );
  expect(videosAfterSecond).toBe(1);
});
