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

    // Pixel-accurate: the rendered MINOR cell (the last background-size layer) equals exactly one
    // scene pixel in screen px — i.e. the stage's px-per-scene-px (`stageW / extentW` = zoom) — so
    // one grid cell IS one scene pixel and the grid cannot drift from the rulers.
    const m = await app.page.evaluate(() => {
      const g = document.querySelector('[data-testid="pixel-grid"]') as HTMLElement;
      const stage = document.querySelector('[data-testid="canvas-stage"]') as HTMLElement;
      const iframe = document.querySelector('iframe[title="cgpreview"]') as HTMLElement;
      const sizes = getComputedStyle(g).backgroundSize.split(',');
      return {
        minorCell: parseFloat(sizes[sizes.length - 1]!), // last layer = minor grid
        zoom: parseFloat(stage.style.width) / parseFloat(iframe.style.width),
      };
    });
    expect(m.minorCell).toBeCloseTo(m.zoom, 1); // 1 cell == 1 scene pixel

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
