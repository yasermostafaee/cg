import { readFile } from 'node:fs/promises';
import { unpack, verify } from '@cg/vcg-format';
import { expect, test } from './fixtures/designer.js';

test('Export (.vcg) saves a rendered thumbnail at the authored Hold start', async ({ app }) => {
  await app.newProject('Animated thumbnail');
  await app.setSceneDuration(100);
  await app.addRectangle({ x: 240, y: 130 });

  await app.setInspectorNumber('Opacity', 0);
  await app.toggleInspectorKeyframe('opacity');
  await app.scrubToFrame(18);
  await app.setInspectorNumber('Opacity', 100);
  await expect(app.inspectorDiamond('opacity')).toHaveAttribute('data-variant', 'at-frame');
  await app.scrubToFrame(27);
  await app.toggleInspectorKeyframe('opacity');
  await app.scrubToFrame(31);
  await app.setInspectorNumber('Opacity', 0);
  await expect(app.inspectorDiamond('opacity')).toHaveAttribute('data-variant', 'at-frame');

  await app.addOutPoint();
  await app.page.getByRole('button', { name: 'Set hold start' }).click();
  await app.dragContentStartMarkerToFraction(0.22);
  await app.scrubToFrame(0);
  await expect(app.firstCanvasElement).toHaveCSS('opacity', '0');

  const [download] = await Promise.all([
    app.page.waitForEvent('download'),
    app.page.getByRole('button', { name: 'Export .vcg', exact: true }).click(),
  ]);
  const vcg = await readFile(await download.path());
  expect((await verify(vcg)).ok).toBe(true);
  const { scene, files } = await unpack(vcg);
  expect(scene.lifecycle?.contentStart).toBeGreaterThanOrEqual(20);
  expect(scene.lifecycle?.contentStart).toBeLessThanOrEqual(24);
  const thumbnail = files.get('thumbnails/320.png');
  if (thumbnail === undefined) throw new Error('The exported VCG has no thumbnail');

  const picture = await app.page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('Cannot decode thumbnail pixels');
      ctx.drawImage(bitmap, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let visibleRectangle = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        const [red, green, blue, alpha] = rgba.subarray(i, i + 4);
        if (red === 190 && green === 190 && blue === 190 && alpha === 255) visibleRectangle += 1;
      }
      return { width: bitmap.width, height: bitmap.height, visibleRectangle };
    } finally {
      bitmap.close();
    }
  }, Buffer.from(thumbnail).toString('base64'));

  expect(picture).toMatchObject({ width: 320, height: 180 });
  expect(picture.visibleRectangle).toBeGreaterThan(60);
});
