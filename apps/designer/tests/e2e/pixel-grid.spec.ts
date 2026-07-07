import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * D-120 — high zoom (up to 6400%) + a pixel grid that appears only at high zoom, for
 * pixel-perfect work. The grid is a non-interactive CSS layer over the whole pasteboard, shown
 * when one scene pixel maps to ≥ 8 screen px (zoom ≥ 800%). These specs pin: the grid is ABSENT
 * at normal zoom and PRESENT at high zoom, the max zoom reaches 6400%, and a 1px arrow nudge at
 * high zoom moves the shape exactly one scene pixel (so the move is visible cell-by-cell). The
 * exact 800% on/off threshold is pinned precisely by the `pixelGridVisible` unit test; here we
 * use clearly-separated zoom levels (100% vs ≥ 1600%) to avoid the readout's rounding boundary.
 */
test.describe('D-120 — high zoom + pixel grid', () => {
  const grid = (app: DesignerApp) => app.page.getByTestId('pixel-grid');
  const readZoom = async (app: DesignerApp): Promise<number> =>
    Number((await app.page.getByTestId('zoom-readout').textContent())!.replace('%', ''));
  const readX = async (app: DesignerApp): Promise<number> =>
    Number(await app.inspector.getByRole('spinbutton', { name: 'X position' }).inputValue());

  // Zoom in until the readout reaches `target`% (or `maxClicks` is hit). Returns the final %.
  async function zoomInUntil(app: DesignerApp, target: number, maxClicks = 70): Promise<number> {
    const zoomIn = app.page.getByRole('button', { name: 'Zoom in', exact: true });
    let pct = await readZoom(app);
    for (let i = 0; i < maxClicks && pct < target; i++) {
      await zoomIn.click();
      pct = await readZoom(app);
    }
    return pct;
  }

  test('the pixel grid is ABSENT at normal zoom and PRESENT at high zoom', async ({ app }) => {
    await app.newProject('PixelGrid');

    // Reset to 100% — well below the 800% grid threshold → no grid (no clutter at normal zoom).
    await app.page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
    await expect(app.page.getByTestId('zoom-readout')).toHaveText('100%');
    await expect(grid(app)).toHaveCount(0); // hidden at 100%

    // Zoom to a clearly-high level (≥ 1600%, well past the 800% threshold) → grid present.
    expect(await zoomInUntil(app, 1600)).toBeGreaterThanOrEqual(1600);
    await expect(grid(app)).toHaveCount(1);
    await expect(grid(app)).toBeVisible();

    // The grid is a device-pixel-snapped <canvas> (snapping → crisp at fractional zoom; the line
    // math + ruler alignment are pinned by the `pixelGridLines` unit tests). Confirm it actually
    // rendered: a CANVAS with a non-zero backing store (viewport · devicePixelRatio).
    const c = await app.page.evaluate(() => {
      const g = document.querySelector('[data-testid="pixel-grid"]') as HTMLCanvasElement;
      return { tag: g.tagName, w: g.width, h: g.height };
    });
    expect(c.tag).toBe('CANVAS');
    expect(c.w).toBeGreaterThan(0);
    expect(c.h).toBeGreaterThan(0);

    // Zooming back to 100% hides it again (a clean on/off, no clutter at low zoom).
    await app.page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
    await expect(app.page.getByTestId('zoom-readout')).toHaveText('100%');
    await expect(grid(app)).toHaveCount(0);
  });

  test('the maximum zoom is 6400% (clamped there, the canvas still renders)', async ({ app }) => {
    await app.newProject('MaxZoom');
    await app.page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
    await expect(app.page.getByTestId('zoom-readout')).toHaveText('100%');

    // Zoom in hard, past the ceiling — it clamps at 6400% (further clicks don't exceed it).
    expect(await zoomInUntil(app, 6400)).toBe(6400);
    const zoomIn = app.page.getByRole('button', { name: 'Zoom in', exact: true });
    await zoomIn.click(); // one more — still clamped
    expect(await readZoom(app)).toBe(6400);
    // The grid + canvas render fine at the extreme zoom (huge pasteboard, no crash).
    await expect(grid(app)).toHaveCount(1);
    await expect(app.page.getByTestId('canvas-stage')).toBeVisible();
  });

  test('a 1px arrow-nudge at high zoom moves the shape exactly one scene pixel', async ({
    app,
  }) => {
    await app.newProject('NudgeAtZoom');
    await app.addRectangle({ x: 240, y: 200 }); // auto-selected, placed at fit zoom
    const x0 = await readX(app);

    // Zoom to a high level so the pixel grid is showing and a 1px move spans a full cell.
    expect(await zoomInUntil(app, 1600)).toBeGreaterThanOrEqual(1600);
    await expect(grid(app)).toHaveCount(1);

    // Nudge RIGHT once. Dispatch on `window` (the global handler's target) so the result is
    // independent of which control the zoom clicks left focused (matches arrow-nudge.spec.ts).
    await app.page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      ),
    );
    // The D-073 nudge still moves exactly ONE scene pixel — one full grid cell — at any zoom.
    await expect.poll(() => readX(app)).toBe(x0 + 1);
    // The shape stays selected/interactive with the grid on top (the grid is non-interactive).
    await expect(app.gizmoFrame).toBeAttached();
  });
});

/**
 * B-042 — grid ↔ rendered-content alignment. The grid canvas layer must be a faithful window onto
 * the PHYSICAL device-pixel raster (backing shown at raster scale exactly 1; layer origin on an
 * integer device px via a sub-CSS-px nudge), and every painted stroke must sit within ½ device px
 * of the content's composited position for its integer scene coordinate — at 6400% AND a
 * fractional zoom, at integer and FRACTIONAL devicePixelRatio. Asserted numerically: the stroke
 * positions are read back from the grid canvas's own BITMAP (not re-derived from the drawing
 * formula), mapped to the screen through the canvas element's actual rect, and compared against
 * the content mapping from the preview iframe's rect (the recon measured the scaled iframe to
 * composite un-snapped at exactly this ideal position). Pre-fix this fails: at dpr 1.25 the
 * backing stretch ramped the misalignment to > ½ device px across the viewport, and the canvas
 * layer sat at a fractional device offset the compositor snapped/resampled.
 */
for (const dpr of [1, 1.25, 2]) {
  test.describe(`B-042 — pixel grid ↔ content alignment at deviceScaleFactor ${String(dpr)}`, () => {
    test.use({ deviceScaleFactor: dpr });

    // The B-042 repro composition: 1920×1080 → pasteboard frame offset (5000, 3000).
    const FRAME_X = 5000;
    const EXTENT_W = 11920;

    /** Click zoom-in until the readout reaches `target`% (mirrors the D-120 helper above). */
    async function zoomToAtLeast(app: DesignerApp, target: number): Promise<number> {
      const zoomIn = app.page.getByRole('button', { name: 'Zoom in', exact: true });
      const read = async (): Promise<number> =>
        Number((await app.page.getByTestId('zoom-readout').textContent())!.replace('%', ''));
      let pct = await read();
      for (let i = 0; i < 80 && pct < target; i++) {
        await zoomIn.click();
        pct = await read();
      }
      return pct;
    }

    /** Scroll the rectangle's right edge (scene x=320) into the middle of the viewport. */
    async function scrollEdgeIntoView(app: DesignerApp): Promise<void> {
      await app.page.evaluate(
        ({ FRAME_X, EXTENT_W }) => {
          const outer = document.querySelector('[data-testid="canvas-viewport"]')!;
          const stage = document.querySelector('[data-testid="canvas-stage"]')!;
          const orect = outer.getBoundingClientRect();
          const srect = stage.getBoundingClientRect();
          const zoom = srect.width / EXTENT_W;
          outer.scrollLeft +=
            srect.left - orect.left + (FRAME_X + 320) * zoom - 0.55 * outer.clientWidth;
          outer.scrollTop +=
            srect.top - orect.top + 3000 * zoom + 6 * zoom - 0.5 * outer.clientHeight;
        },
        { FRAME_X, EXTENT_W },
      );
      // settle: scroll event → measure() → grid repaint effect
      await app.page.waitForTimeout(300);
    }

    interface AlignmentReport {
      dpr: number;
      zoom: number;
      leftFracDevice: number;
      topFracDevice: number;
      widthScaleError: number;
      strokes: { col: number; sceneX: number; delta: number }[];
      adjacentPairs: number;
    }

    /** Read the grid bitmap + rects and report every vertical stroke's screen position vs the
     *  content's composited position for its integer scene coordinate (all in device px). */
    async function measureAlignment(app: DesignerApp): Promise<AlignmentReport> {
      return app.page.evaluate(
        ({ FRAME_X, EXTENT_W }) => {
          const grid = document.querySelector<HTMLCanvasElement>('[data-testid="pixel-grid"]')!;
          const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="cgpreview"]')!;
          const stage = document.querySelector('[data-testid="canvas-stage"]')!;
          const dpr = window.devicePixelRatio;
          const grect = grid.getBoundingClientRect();
          const irect = iframe.getBoundingClientRect();
          const zoom = stage.getBoundingClientRect().width / EXTENT_W;
          // Layer alignment: origin on an integer device px (± the 1/64-CSS-px layout quantum)…
          const leftDevice = grect.left * dpr;
          const topDevice = grect.top * dpr;
          const frac = (v: number): number => Math.min(v - Math.floor(v), Math.ceil(v) - v);
          // …and the CSS box shows the backing at raster scale exactly 1 (no stretch).
          const widthScaleError = Math.abs(grect.width * dpr - grid.width);
          // Read the painted strokes back from the BITMAP: a vertical stroke has alpha in EVERY
          // row; a horizontal line only in its own row — so take the per-column MIN across a few
          // spread-out rows.
          const ctx = grid.getContext('2d')!;
          const rows = [0.13, 0.29, 0.47, 0.61, 0.83].map((f) => Math.floor(grid.height * f));
          const minAlpha = new Float64Array(grid.width).fill(255);
          for (const y of rows) {
            const data = ctx.getImageData(0, y, grid.width, 1).data;
            for (let x = 0; x < grid.width; x++) {
              const a = data[x * 4 + 3]!;
              if (a < minAlpha[x]!) minAlpha[x] = a;
            }
          }
          const cols: number[] = [];
          for (let x = 0; x < grid.width; x++) if (minAlpha[x]! > 0) cols.push(x);
          let adjacentPairs = 0;
          for (let i = 1; i < cols.length; i++) {
            const gap = (cols[i] ?? 0) - (cols[i - 1] ?? 0);
            if (gap === 1) adjacentPairs++;
          }
          const strokes = cols.map((col) => {
            // through the canvas element's ACTUAL rect (catches a broken nudge/backing size)
            const strokeCenter = leftDevice + (col + 0.5) * ((grect.width * dpr) / grid.width);
            // nearest integer scene coordinate + the content's composited device position for it
            const sceneX = Math.round((strokeCenter / dpr - irect.left) / zoom - FRAME_X);
            const contentDevice = (irect.left + (FRAME_X + sceneX) * zoom) * dpr;
            return { col, sceneX, delta: strokeCenter - contentDevice };
          });
          return {
            dpr,
            zoom,
            leftFracDevice: frac(leftDevice),
            topFracDevice: frac(topDevice),
            widthScaleError,
            strokes,
            adjacentPairs,
          };
        },
        { FRAME_X, EXTENT_W },
      );
    }

    /** Measure once the grid repaint has settled: the scroll → measure() → redraw chain is
     *  async, so poll until two consecutive reads agree (same strokes, same layer position). */
    async function settleAndMeasure(app: DesignerApp): Promise<AlignmentReport> {
      let prev = await measureAlignment(app);
      for (let i = 0; i < 20; i++) {
        await app.page.waitForTimeout(150);
        const next = await measureAlignment(app);
        const same =
          next.strokes.length === prev.strokes.length &&
          next.strokes.every((s, j) => s.col === prev.strokes[j]!.col) &&
          Math.abs(next.leftFracDevice - prev.leftFracDevice) < 1e-6;
        if (same) return next;
        prev = next;
      }
      return prev;
    }

    function assertAligned(r: AlignmentReport, ctxLabel: string): void {
      // devicePixelRatio really is the emulated one
      expect(r.dpr, ctxLabel).toBe(dpr);
      // canvas layer device-aligned: integer device origin (1/64-CSS-px layout quantum tolerance)
      expect(r.leftFracDevice, `${ctxLabel}: layer x off the device raster`).toBeLessThanOrEqual(
        0.06,
      );
      expect(r.topFracDevice, `${ctxLabel}: layer y off the device raster`).toBeLessThanOrEqual(
        0.06,
      );
      // backing shown at raster scale exactly 1 (pre-fix: 0.25 device px error at dpr 1.25)
      expect(r.widthScaleError, `${ctxLabel}: backing↔CSS scale`).toBeLessThanOrEqual(0.06);
      // enough strokes to span the viewport, each a SINGLE bitmap column (crisp, incl. fractional zoom)
      expect(r.strokes.length, ctxLabel).toBeGreaterThanOrEqual(6);
      expect(r.adjacentPairs, `${ctxLabel}: doubled/blurred strokes`).toBe(0);
      // every stroke within ½ device px (+ layout-quantum tolerance) of its content position:
      // the ideal stroke hugs the boundary's right side (center = boundary + ½). This is ALSO the
      // ruler contract — the rulers use the same stage-rect + frame-offset mapping.
      for (const s of r.strokes) {
        expect(
          Math.abs(s.delta - 0.5),
          `${ctxLabel}: stroke @col ${String(s.col)} (scene ${String(s.sceneX)}) delta ${String(s.delta)}`,
        ).toBeLessThanOrEqual(0.6);
      }
    }

    test('edges at integer scene coords lie on their grid lines at a fractional zoom AND at 6400%', async ({
      app,
    }) => {
      test.setTimeout(120_000);
      await app.newProject('B042');
      await app.addRectangle({ x: 240, y: 200 });
      await app.setInspectorNumber('X position', 0);
      await app.setInspectorNumber('Y position', 0);
      await app.setInspectorNumber('Width', 320);
      await app.setInspectorNumber('Height', 120);
      // Deselect via the Select tool (the Rectangle tool is still active — a bare canvas
      // click would place ANOTHER rectangle instead of deselecting).
      await app.clickCanvas({ x: 6, y: 6 });

      // Stop 1 — a FRACTIONAL zoom (the multiplicative 1.1 steps from the fit zoom land on a
      // fractional value ≥ 4800%; zoom·dpr is fractional → the pre-fix repeating-beat case).
      expect(await zoomToAtLeast(app, 4800)).toBeGreaterThanOrEqual(4800);
      await scrollEdgeIntoView(app);
      assertAligned(await settleAndMeasure(app), 'fractional zoom');

      // Stop 2 — 6400% exactly (zoom·dpr integer at dpr 1 / 1.25 / 2 → the residual must be
      // CONSTANT; pre-fix the backing stretch ramped it past ½ device px across the viewport).
      expect(await zoomToAtLeast(app, 6400)).toBe(6400);
      await scrollEdgeIntoView(app);
      const r = await settleAndMeasure(app);
      assertAligned(r, '6400%');
      // constant residual across the view at integer zoom·dpr: max spread ≪ 1 device px
      const deltas = r.strokes.map((s) => s.delta);
      expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThanOrEqual(0.12);
    });
  });
}

/** B-042 — the D-120 1-px-nudge guarantee holds under a FRACTIONAL devicePixelRatio too. */
test.describe('B-042 — 1px nudge at fractional dpr', () => {
  test.use({ deviceScaleFactor: 1.25 });

  test('a 1px arrow-nudge at high zoom still moves exactly one scene pixel at dpr 1.25', async ({
    app,
  }) => {
    await app.newProject('NudgeDpr125');
    await app.addRectangle({ x: 240, y: 200 });
    const readX = async (): Promise<number> =>
      Number(await app.inspector.getByRole('spinbutton', { name: 'X position' }).inputValue());
    const x0 = await readX();
    const zoomIn = app.page.getByRole('button', { name: 'Zoom in', exact: true });
    for (let i = 0; i < 40; i++) {
      const pct = Number(
        (await app.page.getByTestId('zoom-readout').textContent())!.replace('%', ''),
      );
      if (pct >= 1600) break;
      await zoomIn.click();
    }
    await expect(app.page.getByTestId('pixel-grid')).toHaveCount(1);
    await app.page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      ),
    );
    await expect.poll(() => readX()).toBe(x0 + 1);
  });
});
