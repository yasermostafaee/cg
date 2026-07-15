import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * D-125 Phase 1 — the Lottie element driven through the real UI: import a bodymovin
 * JSON (validated through the allowlist), drag it onto the canvas, and confirm it
 * mounts a real player (an `<svg>`, not a placeholder) in the canvas AND the preview.
 * The Inspector is OPAQUE — it exposes speed / hold behaviour / the phase mapping but
 * no internal keyframes. Render math + export inlining are covered by the package unit
 * tests; this guards the integrated Designer flow.
 */

// A minimal, allowlist-clean bodymovin export: one filled-rect shape layer (no 3D /
// expressions / effects / audio) + intro-end / outro-start markers.
const BODYMOVIN = JSON.stringify({
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 60,
  w: 400,
  h: 200,
  nm: 'furniture',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'bar',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'rc',
              d: 1,
              s: { a: 0, k: [300, 80] },
              p: { a: 0, k: [0, 0] },
              r: { a: 0, k: 0 },
            },
            { ty: 'fl', c: { a: 0, k: [1, 0.2, 0.2, 1] }, o: { a: 0, k: 100 }, r: 1 },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          ],
          nm: 'Group',
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
  ],
  markers: [
    { tm: 10, cm: 'intro-end', dr: 0 },
    { tm: 50, cm: 'outro-start', dr: 0 },
  ],
});

// A bodymovin export whose INTRO animates the graphic ON from nothing: the layer
// scale keyframes 0 → 100 over frames 0..10 (intro-end at 10). So frame 0 (`ip`) is
// visually EMPTY (scale 0) and the settled/hold frame (intro-end = 10) is full-size —
// the shape a real AE "furniture" export has. The editor canvas must show the settled
// frame, not the invisible intro-start.
// A MARKER-LESS furniture clip — the real-world shape that broke the editor canvas.
// The layer scales 0→100 over f0–10 (intro ON), HOLDS at 100 over f10–50, then scales
// 100→0 over f50–60 (outro OFF). There is NO `markers` array, so the import derives no
// phases and the runtime's `introEnd` falls back to `op` (the LAST frame = the outro-END,
// scale 0 = INVISIBLE). Parking the static canvas there shows an EMPTY box (both ends of
// the clip are blank); only the middle HOLD is visible. The canvas must poster the clip
// MIDPOINT (f30 = held, full-size), not `op`.
const MARKERLESS_FURNITURE = JSON.stringify({
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 60,
  w: 400,
  h: 200,
  nm: 'furniture-nomarkers',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'bar',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        // Intro ON (0→10), HOLD (10→50), outro OFF (50→60). Both ends are scale-0.
        s: {
          a: 1,
          k: [
            {
              t: 0,
              s: [0, 0, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            {
              t: 10,
              s: [100, 100, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            {
              t: 50,
              s: [100, 100, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            { t: 60, s: [0, 0, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'rc',
              d: 1,
              s: { a: 0, k: [300, 80] },
              p: { a: 0, k: [0, 0] },
              r: { a: 0, k: 0 },
            },
            { ty: 'fl', c: { a: 0, k: [1, 0.2, 0.2, 1] }, o: { a: 0, k: 100 }, r: 1 },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          ],
          nm: 'Group',
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
  ],
  // NO `markers` key — a hand-exported furniture clip with no phase markers.
});

const ANIMATED_INTRO = JSON.stringify({
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 60,
  w: 400,
  h: 200,
  nm: 'intro-furniture',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'bar',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [200, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        // Intro: scale 0 → 100 over frames 0..10 (frame 0 is invisible).
        s: {
          a: 1,
          k: [
            {
              t: 0,
              s: [0, 0, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            { t: 10, s: [100, 100, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'rc',
              d: 1,
              s: { a: 0, k: [300, 80] },
              p: { a: 0, k: [0, 0] },
              r: { a: 0, k: 0 },
            },
            { ty: 'fl', c: { a: 0, k: [1, 0.2, 0.2, 1] }, o: { a: 0, k: 100 }, r: 1 },
            {
              ty: 'tr',
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          ],
          nm: 'Group',
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
  ],
  markers: [
    { tm: 10, cm: 'intro-end', dr: 0 },
    { tm: 50, cm: 'outro-start', dr: 0 },
  ],
});

/** Import a bodymovin JSON via Project Assets and drag it onto the canvas. */
async function importAndPlaceLottie(
  app: DesignerApp,
  filename: string,
  json: string,
): Promise<void> {
  await app.page.getByRole('button', { name: 'Project assets', exact: true }).click();
  await app.page.getByRole('button', { name: 'Add asset', exact: true }).click();
  const chooser = app.page.waitForEvent('filechooser');
  await app.page.getByRole('menuitem', { name: /Lottie/ }).click();
  await (
    await chooser
  ).setFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(json) });
  const panel = app.page.locator('aside[aria-label="Project assets"]');
  const tile = panel
    .locator('[draggable="true"]')
    .filter({ hasText: filename.replace(/\.json$/, '') })
    .first();
  await expect(tile).toBeVisible();
  await tile.dragTo(app.canvas, { targetPosition: { x: 220, y: 130 } });
}

test.describe('Lottie element (D-125 Phase 1)', () => {
  test('import → place → renders a player in the canvas + preview; the inspector is opaque', async ({
    app,
  }) => {
    await app.newProject('Lottie');

    // Open the Project Assets panel (the left rail defaults to Compositions).
    await app.page.getByRole('button', { name: 'Project assets', exact: true }).click();

    // Import a bodymovin JSON through Project Assets → Add asset → Lottie…
    await app.page.getByRole('button', { name: 'Add asset', exact: true }).click();
    const chooser = app.page.waitForEvent('filechooser');
    await app.page.getByRole('menuitem', { name: /Lottie/ }).click();
    await (
      await chooser
    ).setFiles({
      name: 'furniture.json',
      mimeType: 'application/json',
      buffer: Buffer.from(BODYMOVIN),
    });

    // The validated asset lands as a tile in Project Assets.
    const panel = app.page.locator('aside[aria-label="Project assets"]');
    const tile = panel.locator('[draggable="true"]').filter({ hasText: 'furniture' }).first();
    await expect(tile).toBeVisible();

    // Drag the tile onto the canvas → a Lottie element mounts its player (a real
    // <svg>, NOT a placeholder div).
    await tile.dragTo(app.canvas, { targetPosition: { x: 220, y: 130 } });
    const lottieNode = app.canvasFrame.locator('[data-cg-element-id]:has(svg)');
    await expect(lottieNode.first()).toBeVisible();

    // The Inspector is opaque: it shows the Lottie section (speed + hold behaviour +
    // the marker-sourced phase mapping) but NO internal-keyframe editor.
    await expect(app.inspector.getByText('Lottie', { exact: false })).toBeVisible();
    await expect(app.inspector.getByRole('combobox', { name: /hold/i })).toBeVisible();
    // Phase mapping was read from the bodymovin markers.
    await expect(app.inspector.getByText(/from markers/i)).toBeVisible();

    // It also mounts a player in the preview modal (the player bundle is loaded
    // there too). The broadcast modal starts BLANK (cg-pending) and reveals on play.
    await app.openPreviewModal();
    const previewLottie = app.previewFrame.locator('[data-cg-element-id]:has(svg)').first();
    await expect(previewLottie).toBeAttached(); // the player mounted (an <svg> is present)
    await app.play();
    await expect(previewLottie).toBeVisible(); // revealed + playing on the injected clock
    await app.stop();
  });

  test('a placed Lottie whose intro animates ON renders a settled frame on the EDITOR canvas (not the invisible frame 0)', async ({
    app,
  }) => {
    await app.newProject('Lottie canvas');
    await importAndPlaceLottie(app, 'intro-furniture.json', ANIMATED_INTRO);

    // The player mounts (an <svg> exists) — Phase 1 already guaranteed this.
    const svg = app.canvasFrame.locator('[data-cg-element-id] svg').first();
    await expect(svg).toBeAttached();

    // The DESIGN SURFACE is static (it never plays), so it must park on a
    // REPRESENTATIVE frame — the settled hold frame (intro-end), where the graphic is
    // fully ON — not `ip` (frame 0), where the intro has scaled the graphic to nothing.
    // Assert the RENDERED CONTENT has a non-zero painted size: getBBox() collapses to
    // ~0 at the scale-0 intro-start and is full-size at the settled frame. This bites
    // the pre-fix "empty box on the canvas" state.
    await expect
      .poll(
        async () =>
          svg.evaluate((el) => {
            try {
              const b = (el as unknown as SVGGraphicsElement).getBBox();
              return Math.min(b.width, b.height);
            } catch {
              return 0;
            }
          }),
        { timeout: 5000 },
      )
      .toBeGreaterThan(5);
  });

  test('a MARKER-LESS furniture clip renders a VISIBLE poster on the editor canvas (not the invisible outro-end)', async ({
    app,
  }) => {
    await app.newProject('Lottie no-markers');
    await importAndPlaceLottie(app, 'furniture-nomarkers.json', MARKERLESS_FURNITURE);

    // The real furniture bug: with NO phase markers the runtime's `introEnd` fell back to
    // `op` (the LAST frame = outro-END, scale 0 = invisible), and #338's poster parked
    // there — so the canvas showed an EMPTY box while Preview (which the operator PLAYS)
    // worked. The player DID mount; the poster FRAME was invisible.

    // The lottie_light player is mounted on the EDITOR CANVAS (a real <svg>, in the
    // canvas iframe — the parent-doc selection gizmo <polygon> is NOT in this frame).
    const svg = app.canvasFrame.locator('[data-cg-element-id] svg').first();
    await expect(svg).toBeAttached();
    await expect(svg).toHaveAttribute('viewBox', /\d/); // a real lottie_light svg, not a stub

    // And it posters a VISIBLE frame (the clip midpoint, in the held region): the rendered
    // content has a non-zero painted size. On the pre-fix build the poster is `op` (the
    // scale-0 outro-end) and this collapses to ~0 — the test bites.
    await expect
      .poll(
        async () =>
          svg.evaluate((el) => {
            try {
              const b = (el as unknown as SVGGraphicsElement).getBBox();
              return Math.min(b.width, b.height);
            } catch {
              return 0;
            }
          }),
        { timeout: 5000 },
      )
      .toBeGreaterThan(5);
  });
});
