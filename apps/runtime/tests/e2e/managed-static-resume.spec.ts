import { readFile } from 'node:fs/promises';
import { cgCss, cgJsIife, ExporterSingleFile } from '@cg/single-file-export';
import { expect, test, type Page } from '@playwright/test';
import { lowerThirdScene } from '../../../../packages/template-runtime/tests/fixtures.js';

const snapshot = {
  revision: 8,
  graphicInstanceId: 'static-pilot',
  page: 0,
  visibility: 'shown',
  data: { anchor: 'استودیوی آزمایشی' },
  transform: {
    fill: { x: 0, y: 0, width: 1, height: 1 },
    crop: { x: 0, y: 0, width: 1, height: 1 },
  },
  animationOrigin: null,
  resume: true,
  resumeWithoutReplay: true,
};

// This page runs the exported template, whose globals differ from CG Control's IPC globals.
type BroadcastWindow = {
  apasaiCg?: { applyState: (value: unknown) => Promise<void> };
  cg?: {
    play: (value: unknown) => Promise<void>;
    on: (event: string, listener: () => void) => void;
  };
};

async function prepareScene(page: Page, html: string): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.setContent(html);
  await expect(page.locator('meta[name="cg-managed-static-resume"]')).toHaveAttribute(
    'content',
    '1',
  );
  await page.evaluate(() => {
    const broadcast = window as unknown as BroadcastWindow;
    broadcast.cg?.on('play.start', () => {
      document.body.dataset['entered'] = '1';
    });
  });
  await expect(page.locator('[data-cg-element-id="name"]')).toBeHidden();
}

const title = (page: Page) => page.locator('[data-cg-element-id="name"]');

test('an exported static template recovers a Persian caption on a fresh page without an entrance', async ({
  context,
  page,
}) => {
  const scene = structuredClone(lowerThirdScene);
  const caption = scene.layers.flatMap(({ children }) => children).find(({ id }) => id === 'name');
  if (caption === undefined) throw new Error('Missing caption in test scene.');
  caption.transform.position.x = 850;
  const fontPath = '/fonts/vazirmatn/vazirmatn-arabic-700-normal.woff2';
  const exporter = new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '@font-face{font-family:Vazirmatn;font-weight:700;src:url(' + fontPath + ')}',
    assets: { get: async () => null, bytes: async () => null },
    fetchUrl: async () => {
      const bytes = await readFile(new URL('../../public' + fontPath, import.meta.url));
      return Uint8Array.from(bytes).buffer;
    },
  });
  const { html } = await exporter.produce(scene);

  await prepareScene(page, html);
  await page.evaluate((data) => (window as unknown as BroadcastWindow).cg?.play(data), snapshot.data);
  await expect(title(page)).toHaveText(snapshot.data.anchor);
  await expect(page.locator('body')).toHaveAttribute('data-entered', '1');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const authoredGeometry = await title(page).boundingBox();
  expect(authoredGeometry).not.toBeNull();

  const replica = await context.newPage();
  await prepareScene(replica, html);
  await replica.evaluate(async (value) => {
    const managed = (window as unknown as BroadcastWindow).apasaiCg;
    if (managed === undefined) throw new Error('The exported runtime has no managed callback.');
    await managed.applyState(value);
  }, snapshot);
  await expect(title(replica)).toHaveText(snapshot.data.anchor);
  await expect(title(replica)).toBeVisible();
  expect(await title(replica).boundingBox()).toEqual(authoredGeometry);
  await expect(replica.locator('body')).not.toHaveAttribute('data-entered', '1');
  expect(await replica.evaluate(() => document.fonts.status)).toBe('loaded');

  await replica.evaluate((value) => (window as unknown as BroadcastWindow).apasaiCg?.applyState(value), {
    ...snapshot,
    revision: 9,
    visibility: 'stopped',
  });
  await expect(title(replica)).toBeHidden();
  await replica.evaluate(
    (value) => (window as unknown as BroadcastWindow).apasaiCg?.applyState(value),
    snapshot,
  );
  await expect(title(replica)).toBeVisible();
  await expect(title(replica)).toHaveText(snapshot.data.anchor);
  await expect(replica.locator('body')).not.toHaveAttribute('data-entered', '1');
});
