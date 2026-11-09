import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

const RASTER = { width: 1920, height: 1080 };
const VIEW = { width: RASTER.width / 2, height: RASTER.height / 2 };
const PROBES = [
  [180, 300], // the outgoing plate
  [1100, 300], // the incoming plate away from the foreground
  [950, 200], // the incoming foreground rectangle
];
const BACKDROP = [24, 40, 72];
const LIVE = [28, 164, 85];
const FOREGROUND = [190, 190, 190];
const FALLBACK = [0, 0, 0];

/** Paint the producer between the two real exported pages, like the Caspar layer stack. */
const OUTPUT_RIG = `<!doctype html>
<style>
  html,body { margin:0; background:rgb(24,40,72); color-scheme:light; overflow:hidden; }
  iframe { position:absolute; inset:0; width:1920px; height:1080px; border:0;
    transform:scale(0.5); transform-origin:top left; }
  #live { position:absolute; left:40px; top:50px; width:240px; height:135px;
    background:rgb(28,164,85); }
</style>
<iframe id="bed" src="/template?cgpass=background&cgsync=phase-fixture"></iframe>
<div id="live"></div>
<iframe id="foreground" src="/template?cgpass=foreground&cgsync=phase-fixture"></iframe>`;

/** Read final composited pixels, including alpha and actual stacking of the three layers. */
async function pixels(page: Page): Promise<number[][]> {
  const png = await page.screenshot();
  return page.evaluate(
    async ({ data, raster, probes }) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + data;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('No 2D context');
      context.drawImage(image, 0, 0);
      return probes.map(([x = 0, y = 0]) => {
        const px = Math.floor((x / raster.width) * canvas.width);
        const py = Math.floor((y / raster.height) * canvas.height);
        return Array.from(context.getImageData(px, py, 1, 1).data.slice(0, 3));
      });
    },
    { data: png.toString('base64'), raster: RASTER, probes: PROBES },
  );
}

test('a preset cut holds the incoming fallback through the mixer handoff and preserves its foreground', async ({
  app,
}) => {
  await app.newProject('PresetFallbackPhase');
  await app.showCompositions();
  const main = (await app.page.locator('.cg-comp-row').first().innerText()).trim();
  const canvas = await app.canvas.boundingBox();
  if (canvas === null) throw new Error('Canvas is missing');
  const createAt = { x: Math.round(canvas.width * 0.4), y: Math.round(canvas.height * 0.4) };
  await app.addMultiFrameGroup();
  const addPlate = async (preset: string, x: number): Promise<void> => {
    await app.addLook();
    await app.openComposition(preset);
    await app.addLiveSource(createAt);
    await app.setLiveSourceId('guest-1');
    await app.setInspectorNumber('X position', x);
    await app.setInspectorNumber('Y position', 100);
    await app.setInspectorNumber('Width', 480);
    await app.setInspectorNumber('Height', 270);
    await app.inspector.getByRole('button', { name: 'fallback', exact: true }).click();
    await app.page
      .getByRole('dialog', { name: 'Choose picture for fallback' })
      .getByRole('button', { name: 'Solid colour', exact: true })
      .click();
    await expect(
      app.inspector.getByRole('checkbox', { name: 'Show fallback on air', exact: true }),
    ).toBeChecked();
    await app.deselect();
  };
  await addPlate('preset-1', 80);
  await app.openComposition(main);
  await addPlate('preset-2', 820);

  await app.addRectangle(createAt);
  await app.setInspectorNumber('X position', 900);
  await app.setInspectorNumber('Y position', 170);
  await app.setInspectorNumber('Width', 100);
  await app.setInspectorNumber('Height', 64);
  await app.inspector.getByRole('button', { name: 'Toggle Live foreground' }).click();
  await app.inspector
    .getByRole('combobox', { name: 'Live order', exact: true })
    .selectOption('above');
  const [foregroundId] = await app.timelineRowIds();
  if (foregroundId === undefined) throw new Error('Foreground is missing');
  await app.openComposition(main);
  const { html } = await app.exportHtml();

  const output = await app.page.context().newPage();
  try {
    await output.setViewportSize(VIEW);
    await output.route('https://cg-output.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: new URL(route.request().url()).pathname === '/template' ? html : OUTPUT_RIG,
      }),
    );
    await output.goto('https://cg-output.test/');
    const bed = output.frameLocator('#bed');
    const foreground = output.frameLocator('#foreground');
    for (const frame of [bed, foreground]) {
      await expect(frame.locator('html')).toHaveAttribute('data-cg-ready', '1');
      await frame.locator('html').evaluate(() => {
        (window as unknown as { play: (json: string) => void }).play(
          JSON.stringify({ __cg: { look: 'look-1' } }),
        );
      });
    }
    await expect(bed.locator('[data-cg-live-fallback]:visible')).toHaveCount(1);
    expect(await pixels(output)).toEqual([LIVE, BACKDROP, BACKDROP]);

    const update = (control: object): Promise<void> =>
      bed.locator('html').evaluate(
        (_element, json) => {
          (window as unknown as { update: (payload: string) => void }).update(json);
        },
        JSON.stringify({ __cg: control }),
      );
    await update({
      look: 'look-2',
      liveFallback: { phase: 'hold', id: 'preset-cut', plateIds: ['guest-1'] },
    });
    const title = foreground.locator(`[data-cg-element-id="${foregroundId}"]`);
    await expect(title).toBeVisible();
    await expect(bed.locator('[data-cg-live-fallback]:visible')).toHaveCount(0);
    expect(await pixels(output)).toEqual([LIVE, BACKDROP, FOREGROUND]);

    const producer = output.locator('#live');
    await producer.evaluate((element) => {
      element.style.left = '410px';
    });
    await update({ liveFallback: { phase: 'release', id: 'preset-cut' } });
    await expect(bed.locator('[data-cg-live-fallback]:visible')).toHaveCount(1);
    expect(await pixels(output)).toEqual([BACKDROP, LIVE, FOREGROUND]);

    await producer.evaluate((element) => element.remove());
    expect(await pixels(output)).toEqual([BACKDROP, FALLBACK, FOREGROUND]);
  } finally {
    await output.close();
  }
});
