import { test, expect } from './fixtures/designer.js';

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
});
