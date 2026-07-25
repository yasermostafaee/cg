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
// A PREMULTIPLIED (matted-against-black) partial-alpha source: left half opaque
// gold, right half half-alpha gold with RGB already darkened — the legacy-archive
// convention that produced the black fringe (D-128).
const PREMULT_FIXTURE = join(HERE, 'fixtures', 'gradient-64x64-premult-bgra.avi');
// A MOTION fixture (the guard the static one lacked): a soft-edged textured particle
// ORBITING the centre, premultiplied, with the four 10×10 corner regions permanently
// transparent in every source frame. Guards the lossy-alpha-leak class end-to-end:
// source-transparent pixels must STAY transparent across motion frames.
const MOTION_FIXTURE = join(HERE, 'fixtures', 'motion-64x64-premult-bgra.avi');

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
  // the RESULT panel (D-128 — conversion verdict shown always); place the element from it
  await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();

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
    // both attempts end at the RESULT panel; place the element from it
    await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
    await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();
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
  // the RESULT panel (D-128 — conversion verdict shown always); place the element from it
  await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();

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

test('a video element is NOT remounted across transform changes — it stays visible on its poster (D-128 Bug 1)', async ({
  app,
  page,
}) => {
  await app.newProject('VideoDrag');
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'drag-clip.avi',
    mimeType: 'video/x-msvideo',
    buffer: readFileSync(FIXTURE),
  });
  await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText('64×64');
  await page.getByRole('button', { name: 'Convert & import' }).click();
  // the RESULT panel (D-128 — conversion verdict shown always); place the element from it
  await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();

  const frame = page.frameLocator('iframe[title="cgpreview"]');
  const videoLoc = frame.locator('video[data-cg-asset-id]');
  await expect(videoLoc).toBeAttached({ timeout: 15_000 });

  // Wait for the poster to seek off 0, then MARK the live node so we can prove it
  // is the SAME element (not a remounted one) after transforms.
  const before = await videoLoc.evaluate(async (v: HTMLVideoElement & { __cgMark?: string }) => {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && !(v.readyState >= 1 && v.currentTime > 0)) {
      await new Promise((r) => setTimeout(r, 100));
    }
    v.__cgMark = 'keep-me';
    return { t: v.currentTime, rs: v.readyState };
  });
  expect(before.t).toBeGreaterThan(0); // showing a real (non-blank) poster frame

  // Several transform changes → several full scene-replaces (the drag simulacrum).
  // BEFORE the fix each of these tore down + reloaded the <video> (blank for a beat).
  for (const rot of [10, 25, 40, 15]) await app.setInspectorNumber('Rotation', rot);

  const after = await videoLoc.evaluate((v: HTMLVideoElement & { __cgMark?: string }) => ({
    mark: v.__cgMark,
    t: v.currentTime,
    rs: v.readyState,
    hasSrc: (v.getAttribute('src') || '').indexOf('blob:') === 0,
  }));
  expect(after.mark).toBe('keep-me'); // SAME node → never remounted
  expect(after.hasSrc).toBe(true); // media still wired
  expect(after.rs).toBeGreaterThanOrEqual(1); // still decoded (not reset to a blank load)
  expect(after.t).toBeGreaterThan(0); // never fell back to the transparent frame 0
});

test('a premultiplied-alpha source imports WITHOUT the black fringe (D-128 un-premultiply)', async ({
  app,
  page,
}) => {
  await app.newProject('VideoFringe');
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'gradient-64x64-premult-bgra.avi',
    mimeType: 'video/x-msvideo',
    buffer: readFileSync(PREMULT_FIXTURE),
  });
  await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText('64×64');
  // the premultiplied-alpha toggle is present and defaults ON (the client's archive)
  await expect(page.getByTestId('video-premultiplied-toggle')).toBeChecked();

  // convert with the default (un-premultiply ON), then decode the stored WebM
  await page.getByRole('button', { name: 'Convert & import' }).click();
  // the RESULT panel (D-128 — conversion verdict shown always); place the element from it
  await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();

  // Sample the DECODED pixels: draw the stored <video> to a canvas and read a pixel
  // deep in the HALF-ALPHA right region. Straight-alpha source colour is gold
  // (255,215,0); WITHOUT the fix the stored RGB is premultiplied (~126,106,0) and
  // composites to a black-edged halo. getImageData returns STRAIGHT rgba, so a
  // correct un-premultiply reads the right region back at ~gold, matching the
  // opaque LEFT half — proving the semi-transparent pixels are NOT darkened.
  const px = await page.evaluate(async () => {
    const assets = await window.cg.assets.list();
    const vid = assets.find((a) => a.kind === 'video');
    if (vid === undefined) return { ok: false as const, why: 'no stored video asset' };
    const url = await window.cg.assets.url(vid.assetId);
    if (url === null) return { ok: false as const, why: 'url() returned null' };
    return await new Promise<
      { ok: true; left: number[]; right: number[]; w: number } | { ok: false; why: string }
    >((resolve) => {
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      const deadline = Date.now() + 12_000;
      v.onerror = () => resolve({ ok: false, why: `decode error: ${v.error?.message ?? '?'}` });
      const sample = (): void => {
        const c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d');
        if (ctx === null) return resolve({ ok: false, why: 'no 2d context' });
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(v, 0, 0);
        const at = (fx: number): number[] => [
          ...ctx.getImageData(Math.round(v.videoWidth * fx), Math.round(v.videoHeight / 2), 1, 1)
            .data,
        ];
        resolve({ ok: true, left: at(0.25), right: at(0.78), w: v.videoWidth });
      };
      const tryDraw = (): void => {
        if (v.readyState >= 2 && v.videoWidth > 0) sample();
        else if (Date.now() < deadline) setTimeout(tryDraw, 100);
        else resolve({ ok: false, why: `never decoded rs=${String(v.readyState)}` });
      };
      v.onloadeddata = tryDraw;
      v.src = url;
    });
  });
  expect(px, JSON.stringify(px)).toMatchObject({ ok: true });
  if (px.ok) {
    // opaque LEFT half is gold (control)
    expect(px.left[0]).toBeGreaterThan(200); // R
    expect(px.left[1]).toBeGreaterThan(160); // G
    // half-alpha RIGHT half is RESTORED to ~gold — NOT the darkened premult (~126)
    expect(px.right[0]).toBeGreaterThan(200); // R (would be <150 with the fringe bug)
    expect(px.right[1]).toBeGreaterThan(160); // G
    // and it is genuinely semi-transparent (partial alpha carried through)
    expect(px.right[3]).toBeGreaterThan(60);
    expect(px.right[3]).toBeLessThan(210);
  }
});

test('MOTION keeps transparency: source-transparent pixels stay transparent across moving frames (lossy-alpha guard)', async ({
  app,
  page,
}) => {
  await app.newProject('VideoMotionAlpha');
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'motion-64x64-premult-bgra.avi',
    mimeType: 'video/x-msvideo',
    buffer: readFileSync(MOTION_FIXTURE),
  });
  await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText('64×64');
  await page.getByRole('button', { name: 'Convert & import' }).click();
  // the RESULT panel (D-128 — conversion verdict shown always); place the element from it
  await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();

  // Decode the stored WebM and sample the four 10×10 CORNER regions — transparent in
  // EVERY source frame — at several timestamps across the orbit (motion on every frame).
  // The lossy-alpha bug decoded such pixels at α up to 30 over BLACK during motion; the
  // bounded-quantiser encode + alpha bleed must keep them fully transparent, and nothing
  // in those regions may read as visible black.
  const scan = await page.evaluate(async () => {
    const assets = await window.cg.assets.list();
    const vid = assets.find((a) => a.kind === 'video');
    if (vid === undefined) return { ok: false as const, why: 'no stored video asset' };
    const url = await window.cg.assets.url(vid.assetId);
    if (url === null) return { ok: false as const, why: 'url() returned null' };
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = url;
    const loaded = await new Promise<boolean>((res) => {
      const t = setTimeout(() => res(false), 12_000);
      v.onloadeddata = () => {
        clearTimeout(t);
        res(true);
      };
      v.onerror = () => {
        clearTimeout(t);
        res(false);
      };
    });
    if (!loaded || v.videoWidth === 0) return { ok: false as const, why: 'decode failed' };
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx === null) return { ok: false as const, why: 'no 2d context' };
    const corners = [
      [0, 0],
      [c.width - 10, 0],
      [0, c.height - 10],
      [c.width - 10, c.height - 10],
    ] as const;
    let maxAlpha = 0;
    let visibleLeak = 0; // α ≥ 8 — would read as a smudge on air
    let sampled = 0;
    for (const t of [0.06, 0.3, 0.55, 0.8, 1.05]) {
      const sought = await new Promise<boolean>((res) => {
        const tm = setTimeout(() => res(false), 5_000);
        v.onseeked = () => {
          clearTimeout(tm);
          res(true);
        };
        v.currentTime = t;
      });
      if (!sought) return { ok: false as const, why: `seek to ${String(t)} never fired` };
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(v, 0, 0);
      for (const [cx, cy] of corners) {
        const d = ctx.getImageData(cx, cy, 10, 10).data;
        for (let i = 0; i < d.length; i += 4) {
          sampled++;
          const a = d[i + 3]!;
          if (a > maxAlpha) maxAlpha = a;
          if (a >= 8) visibleLeak++;
        }
      }
    }
    return { ok: true as const, sampled, maxAlpha, visibleLeak };
  });
  expect(scan, JSON.stringify(scan)).toMatchObject({ ok: true });
  if (scan.ok) {
    expect(scan.sampled).toBe(5 * 4 * 100); // 5 timestamps × 4 corners × 100 px
    // fully transparent must STAY fully transparent (≤2 tolerates canvas rounding only)
    expect(scan.maxAlpha).toBeLessThanOrEqual(2);
    // and NOTHING in a source-transparent region may be visible (the black-smudge class)
    expect(scan.visibleLeak).toBe(0);
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
  // the RESULT panel (D-128 — conversion verdict shown always); place the element from it
  await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();
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
