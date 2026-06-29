import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * B-0xx — the checkered FRAME page stays `scene.resolution`-sized; only the dark
 * pasteboard EXTENT grows with off-frame content; Fit fits the resolution-sized frame.
 * Guards the regression where dragging a shape off-frame appeared to grow the visible
 * page (the frame/extent/fit were conflated), even though scene.resolution is untouched.
 */
test.describe('Scene size vs pasteboard extent — invariants (B-0xx)', () => {
  // The checkered FRAME page = the runtime's `.cg-stage` inside the iframe; its layout
  // size is the scene resolution (transform: scale() doesn't change offset metrics).
  const frameW = (app: DesignerApp): Promise<number> =>
    app.page
      .frameLocator('iframe[title="cgpreview"]')
      .locator('.cg-stage')
      .evaluate((el) => (el as HTMLElement).offsetWidth);
  const frameH = (app: DesignerApp): Promise<number> =>
    app.page
      .frameLocator('iframe[title="cgpreview"]')
      .locator('.cg-stage')
      .evaluate((el) => (el as HTMLElement).offsetHeight);
  // The dark pasteboard EXTENT = the iframe element's INLINE width (scene-px extent). Read
  // the inline style, NOT offsetWidth — offsetWidth resolves `width:100%` to the scaled
  // stage size mid-settle under load, which flakes.
  const extentW = (app: DesignerApp): Promise<number> =>
    app.page
      .locator('iframe[title="cgpreview"]')
      .evaluate((el) => parseFloat((el as HTMLElement).style.width));

  async function setXY(app: DesignerApp, x?: number, y?: number): Promise<void> {
    if (x !== undefined) {
      const xf = app.inspector.getByRole('spinbutton', { name: 'X position' });
      await xf.fill(String(x));
      await xf.press('Enter');
    }
    if (y !== undefined) {
      const yf = app.inspector.getByRole('spinbutton', { name: 'Y position' });
      await yf.fill(String(y));
      await yf.press('Enter');
    }
  }

  /** The composition width input (visible only when nothing is selected). */
  async function compositionWidth(app: DesignerApp): Promise<string | null> {
    await app.deselect();
    return app.inspector.getByRole('spinbutton', { name: 'Composition width' }).inputValue();
  }

  test('drag far off-frame changes NEITHER the fixed pasteboard extent NOR the frame page / scene.resolution (B-027)', async ({
    app,
  }) => {
    await app.newProject('FramePinned'); // default 1920×1080
    await app.addRectangle({ x: 240, y: 200 });

    // The checkered frame page is the scene resolution.
    await expect.poll(() => frameW(app)).toBe(1920);
    await expect.poll(() => frameH(app)).toBe(1080);
    // The iframe element's own width = the fixed 3× extent (poll: under load the iframe
    // element resizes a tick after the in-iframe .cg-stage settles to the new resolution).
    await expect.poll(() => extentW(app)).toBe(1920 * 3);
    const baseExtent = await extentW(app);

    // Park the shape FAR off the right + bottom.
    await setXY(app, 5000, 4000);

    // B-027 — the dark pasteboard extent is FIXED: it does NOT grow to contain the shape…
    expect(await extentW(app)).toBe(baseExtent);
    // …the checkered FRAME page stays resolution-sized…
    expect(await frameW(app)).toBe(1920);
    expect(await frameH(app)).toBe(1080);
    // …and scene.resolution is untouched (the inspector W still reads 1920).
    expect(await compositionWidth(app)).toBe('1920');
  });

  test('Fit fits the resolution-sized frame after a custom scene size (not the extent)', async ({
    app,
  }) => {
    await app.newProject('CustomSize');
    // Set a custom resolution via the composition size inputs.
    await app.deselect();
    const wInput = app.inspector.getByRole('spinbutton', { name: 'Composition width' });
    const hInput = app.inspector.getByRole('spinbutton', { name: 'Composition height' });
    await wInput.fill('1280');
    await wInput.press('Enter');
    await hInput.fill('720');
    await hInput.press('Enter');

    // The frame page tracks the new resolution.
    await expect.poll(() => frameW(app)).toBe(1280);
    await expect.poll(() => frameH(app)).toBe(720);

    // Fit, then the resolution-sized frame is centered in the scroll viewport.
    await app.page.getByRole('button', { name: 'Fit' }).click();
    const viewport = app.page.getByTestId('canvas-viewport');
    const vb = (await viewport.boundingBox())!;
    const fb = (await app.canvas.boundingBox())!; // canvas-surface = the FRAME box
    const frameCx = fb.x + fb.width / 2;
    const frameCy = fb.y + fb.height / 2;
    const viewCx = vb.x + vb.width / 2;
    const viewCy = vb.y + vb.height / 2;
    // Centered (within a small tolerance) AND the frame fits inside the viewport.
    expect(Math.abs(frameCx - viewCx)).toBeLessThan(24);
    expect(Math.abs(frameCy - viewCy)).toBeLessThan(24);
    expect(fb.width).toBeLessThanOrEqual(vb.width + 1);
    expect(fb.height).toBeLessThanOrEqual(vb.height + 1);
  });
});
