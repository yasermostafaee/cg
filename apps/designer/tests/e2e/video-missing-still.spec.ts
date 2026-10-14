import { test, expect } from './fixtures/designer.js';

/**
 * 🔴 `B-138` (owner, 2026-10-14, Q3 (a)) — a video whose file cannot be found shows the image
 * "missing" picture as its still frame, on the canvas and in Preview (both are the same preview
 * document). It used to paint NOTHING: the unresolved leg of the asset walk handled `<img>` only,
 * so a `<video>` with no src was indistinguishable from an element never placed.
 *
 * Measured in the real engine, not read from the DOM (golden rule 12): the canvas iframe is handed
 * a scene whose video names an asset with no URL, and the pixels Chromium paints inside the
 * element's box must be the missing picture's fill (`#2a2f45`), not transparent.
 */
test('B-138 — a video whose file is missing shows the "missing" picture as its still frame', async ({
  app,
}) => {
  await app.newProject('VideoMissing');
  const frame = app.page.frameLocator('iframe[title="cgpreview"]');
  await expect(frame.locator('.cg-stage')).toBeAttached();

  // Hand the canvas document a scene with ONE video on an asset that resolves to nothing.
  await frame.locator('body').evaluate((body) => {
    const tf = {
      position: { x: 100, y: 100 },
      size: { w: 480, h: 270 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    };
    const scene = {
      schemaVersion: 1,
      id: 'b138',
      name: 'b138',
      templateType: 'custom',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      editorBackdrop: 'transparent',
      layers: [
        {
          id: 'L',
          name: 'L',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'vid',
              name: 'Video',
              type: 'video',
              visible: true,
              locked: false,
              opacity: 1,
              zIndex: 0,
              transform: tf,
              assetId: 'asset-that-is-gone',
              durationMs: 2000,
              holdBehavior: 'loop',
            },
          ],
        },
      ],
      compositions: [],
      fonts: [],
      fields: [],
      bindings: [],
    };
    body.ownerDocument.defaultView?.postMessage(
      { kind: 'cg-preview', action: 'scene-replace', scene, assetUrls: {} },
      '*',
    );
  });

  const video = frame.locator('video[data-cg-element-id="vid"]');
  await expect(video).toHaveAttribute('data-cg-missing', '1');
  await expect(video).toHaveAttribute('poster', /^data:image\/svg\+xml/);

  // The pixels: the centre of the element's box is the missing picture's fill, not the page
  // behind it. Sampled from a screenshot, so it is what Chromium painted.
  await expect
    .poll(async () => {
      const shot = await video.screenshot();
      return await app.page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (ctx === null) return 'no-ctx';
        ctx.drawImage(img, 0, 0);
        const [r, g, b] = ctx.getImageData(
          Math.floor(img.width / 2),
          Math.floor(img.height / 4),
          1,
          1,
        ).data;
        return `${String(r)},${String(g)},${String(b)}`;
      }, shot.toString('base64'));
    })
    .toBe('42,47,69');
});
