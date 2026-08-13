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
    // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
    await app.setSceneDuration(250);

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

  /**
   * The painted size of the canvas Lottie's rendered content. `getBBox()` collapses to
   * ~0 where the clip has scaled the graphic to nothing (both ends of a furniture clip)
   * and is full-size in the held region — so it reads what the animation ACTUALLY
   * RENDERED, not what the driver was asked to paint. That distinction is the point of
   * asserting this in a browser at all: a spy on `goToFrame` passes whether or not
   * lottie-web honoured the call.
   */
  const paintedSize = (app: DesignerApp): Promise<number> =>
    app.canvasFrame
      .locator('[data-cg-element-id] svg')
      .first()
      .evaluate((el) => {
        try {
          const b = (el as unknown as SVGGraphicsElement).getBBox();
          return Math.min(b.width, b.height);
        } catch {
          return 0;
        }
      });

  // Composition frame 20 maps into the clip's VISIBLE region for every plausible project
  // fps: at 25/30/50 fps a 30 fps clip lands on clip frame 24/20/12, all inside the
  // [10, 50] held span of both fixtures.
  const VISIBLE_FRAME = 20;

  test('the canvas Lottie follows the playhead — INCLUDING at the in-point, which is not a special case', async ({
    app,
  }) => {
    await app.newProject('Lottie canvas');
    // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
    await app.setSceneDuration(250);
    await importAndPlaceLottie(app, 'intro-furniture.json', ANIMATED_INTRO);

    // The player mounts (an <svg> exists) — Phase 1 already guaranteed this.
    const svg = app.canvasFrame.locator('[data-cg-element-id] svg').first();
    await expect(svg).toBeAttached();

    // D-135 — the canvas shows the frame under the PLAYHEAD, and the composition's
    // in-point is not exempt. This clip's intro scales ON from nothing over frames 0..10,
    // so at the in-point the honest picture is the scale-0 intro-START: painted size ~0.
    //
    // This assertion REPLACES a D-125 one that required a VISIBLE "poster" frame here.
    // That requirement is superseded by the owner's decision that the mapping wins at
    // every frame: the poster's rationale was "a design surface that never plays", and
    // the playhead drives the canvas now. See `lottie-driver.ts` `poster()`, where which
    // half of that rationale died is annotated.
    await expect.poll(async () => paintedSize(app), { timeout: 5000 }).toBeLessThan(5);

    // Scrub INTO the clip: the graphic is fully ON, so real content is painted. This is
    // what the retired assertion was really protecting — that the player renders, and
    // that the operator can SEE the clip on the canvas — and it still holds, one gesture
    // later.
    await app.scrubToFrame(VISIBLE_FRAME);
    await expect.poll(async () => paintedSize(app), { timeout: 5000 }).toBeGreaterThan(5);

    // Back to the in-point: blank AGAIN. The in-point's frame is a function of the
    // playhead alone, never of how the playhead got there — the defect this replaces was
    // the opposite, and survived a round trip.
    await app.scrubToFrame(0);
    await expect.poll(async () => paintedSize(app), { timeout: 5000 }).toBeLessThan(5);
  });

  test('a MARKER-LESS furniture clip maps at the in-point too, and its held region renders', async ({
    app,
  }) => {
    await app.newProject('Lottie no-markers');
    // D-151 — the add-time duration guard fires when content outsizes the host; size the host to FIT this spec’s clip so its own subject stays under test.
    await app.setSceneDuration(250);
    await importAndPlaceLottie(app, 'furniture-nomarkers.json', MARKERLESS_FURNITURE);

    // The lottie_light player is mounted on the EDITOR CANVAS (a real <svg>, in the
    // canvas iframe — the parent-doc selection gizmo <polygon> is NOT in this frame).
    const svg = app.canvasFrame.locator('[data-cg-element-id] svg').first();
    await expect(svg).toBeAttached();
    await expect(svg).toHaveAttribute('viewBox', /\d/); // a real lottie_light svg, not a stub

    // A MARKER-LESS clip is the case that can hide a boundary bug: with no `phases` the
    // poster frame is the clip MIDPOINT, far from `ip`, so "poster" and "mapped" can
    // never coincide. At the in-point the mapped frame is `ip` — scale 0 — and that is
    // what must render.
    await expect.poll(async () => paintedSize(app), { timeout: 5000 }).toBeLessThan(5);

    // #338's real value, preserved: the operator can still SEE this clip on the canvas.
    // The old bug was a poster parked on `op` (the invisible outro-end) with no way to
    // reach the held region; now the held region is one scrub away and it renders.
    await app.scrubToFrame(VISIBLE_FRAME);
    await expect.poll(async () => paintedSize(app), { timeout: 5000 }).toBeGreaterThan(5);
  });
});
