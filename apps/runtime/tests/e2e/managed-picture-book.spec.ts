import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { createMock } from '@cg/amcp-mock';
import { createBridge } from '@cg/caspar-bridge';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import {
  managedResumePageCountFromHtml,
  pageListsOf,
  SequenceElementSchema,
  withPageLists,
  type AssetMeta,
} from '@cg/shared-schema';
import { cgCss, cgJsIife, ExporterSingleFile } from '@cg/single-file-export';
import { lowerThirdScene } from '../../../../packages/template-runtime/tests/fixtures.js';
import { playoutPair } from '../../../../tools/caspar-bridge/tests/support/managed-playout-pair.js';
import { solidPng } from './fixtures/pictures.js';
import { expect, RuntimeApp, test } from './fixtures/runtime.js';

const layerNumber = 81;
const sequenceId = 'bundled-book';
const pictureColours = [
  [220, 25, 30],
  [35, 190, 40],
  [20, 60, 230],
] as const;

async function exportPictureBook() {
  const scene = structuredClone(lowerThirdScene);
  const layer = scene.layers[0];
  const caption = layer?.children.find((child) => child.type === 'text');
  if (layer === undefined || caption?.type !== 'text') throw new Error('Missing fixture caption.');

  const pictures = new Map<string, { metadata: AssetMeta; bytes: Buffer }>();
  const items = pictureColours.map((colour, index) => {
    const assetId = 'bundled-picture-' + String(index);
    const filename = 'page-' + String(index + 1) + '.png';
    const bytes = solidPng(64, 36, colour);
    pictures.set(assetId, {
      bytes,
      metadata: {
        assetId,
        kind: 'image',
        filename,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byteSize: bytes.length,
        workingPath: filename,
        width: 64,
        height: 36,
      },
    });
    return { id: 'page-' + String(index), kind: 'image', assetId, name: filename };
  });
  layer.children.push(
    SequenceElementSchema.parse({
      ...caption,
      id: sequenceId,
      name: 'Sequence',
      type: 'sequence',
      transform: {
        ...caption.transform,
        position: { x: 120, y: 700 },
        size: { w: 320, h: 180 },
      },
      items,
      imageFit: 'contain',
      advance: 'manual',
      repeat: 1,
      transitionIn: 'none',
      transitionOut: 'none',
    }),
  );

  const prepared = withPageLists(scene);
  const { html } = await new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: {
      get: async (assetId) => pictures.get(assetId)?.metadata ?? null,
      bytes: async (assetId) => pictures.get(assetId)?.bytes ?? null,
    },
  }).produce(prepared);
  return { html, fields: prepared.fields, pageLists: pageListsOf(prepared) };
}

async function attach(page: Page, url: string): Promise<RuntimeApp> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(
    'window.__CG_BRIDGE_URL__ = ' + JSON.stringify(url) + '; window.__CG_SPLASH_DISABLED__ = true;',
  );
  const app = new RuntimeApp(page);
  await app.goto();
  return app;
}

test('managed Cut picture books turn to Previous and Go in Control and recover on the new owner', async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  const directory = mkdtempSync(join(tmpdir(), 'cg-managed-picture-book-'));
  const cleanup: (() => Promise<void> | void)[] = [
    () => rmSync(directory, { recursive: true, force: true }),
  ];
  try {
    const { html, fields, pageLists } = await exportPictureBook();
    expect(managedResumePageCountFromHtml(html)).toBe(3);
    expect(pageLists).toHaveLength(1);
    const [bookList] = pageLists;
    if (bookList === undefined) throw new Error('Missing picture book metadata.');
    const pair = await playoutPair(cleanup);
    const core = await createMock({ amcpPort: 0 });
    cleanup.push(() => core.stop());
    const bank = defaultFixedLayerBank();
    const boot = () =>
      createBridge({
        port: 0,
        connection: {
          servers: { A: { host: '127.0.0.1', amcpPort: core.amcpPort, oscPort: 0 } },
          strategy: 'mirror-sync',
          autoFailoverEnabled: false,
        },
        fixedLayers: { ...bank, visibility: { ...bank.visibility, [layerNumber]: true, 82: true } },
        stackPath: join(directory, 'stack.json'),
        templatesDir: join(directory, 'templates'),
        managedCgPilot: { channel: 1, commands: pair.executor() },
      });
    let bridge = await boot();
    let running: typeof bridge | undefined = bridge;
    cleanup.push(async () => running?.close());
    const template = {
      templateId: 'managed-picture-book',
      templateType: 'lower-third',
      name: 'Bundled picture book',
      hasNext: true,
      fields,
      pageLists,
    };
    expect(bridge.runtime.templateImport(template, html, 1).registered).toBe(true);
    await bridge.runtime.whenServerHealthy(8_000);
    const app = await attach(page, bridge.url);
    const result = await page.evaluate(
      (layer) =>
        window.cg.fixedLayers.load({
          channel: 1,
          layer,
          itemId: 'book-row',
          templateId: 'managed-picture-book',
          fields: { anchor: 'استودیو' },
        }),
      layerNumber,
    );
    expect(result).toMatchObject({ accepted: true });
    await app.selectStackRow('managed-picture-book');
    const book = app.inspector.locator('[data-book]');
    const previous = book.getByRole('button', { name: /^Previous page/ });
    const next = book.getByRole('button', { name: /^Next page/ });
    const pageBox = book.getByRole('textbox', { name: /^Page number/ });
    const go = book.getByRole('button', { name: /^Go to page/ });
    const counter = book.getByTestId('book-counter');
    const row = app.layerRow(layerNumber);
    await expect(book.getByRole('button', { name: /^Manage pages/ })).toHaveCount(0);
    await expect(book.getByRole('group', { name: /^Advance/ })).toHaveCount(0);
    await expect(previous).toBeDisabled();
    await expect(next).toBeDisabled();
    await expect(pageBox).toBeDisabled();
    await expect(row.getByRole('button', { name: 'NEXT', exact: true })).toBeDisabled();
    expect(pair.posts).toHaveLength(0);

    await row.getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect(counter).toHaveText('1 / 3');
    await expect(app.layerState(layerNumber)).toHaveText(/ON AIR/i);
    expect(pair.posts[0]?.command.layout[0]?.page).toBe(0);

    await app.showMonitors();
    await row.getByRole('button', { name: 'ON PVW', exact: true }).click();
    const preview = page.locator('[data-pvw-controls]');
    const previewFrame = page.frameLocator('iframe[data-rehearsal-frame]');
    await preview.getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect(previewFrame.locator('img[data-cg-asset-id="bundled-picture-0"]')).toBeVisible();
    await preview.getByRole('button', { name: 'NEXT', exact: true }).click();
    const previewPicture = previewFrame.locator('img[data-cg-asset-id="bundled-picture-1"]');
    await expect(previewPicture).toBeVisible();
    await expect(counter).toHaveText('1 / 3');
    expect(pair.posts).toHaveLength(1);

    await row.getByRole('button', { name: 'NEXT', exact: true }).click();
    await expect(counter).toHaveText('2 / 3');
    await previous.click();
    await expect(counter).toHaveText('1 / 3');
    await expect(previous).toBeDisabled();
    await pageBox.fill('۳');
    await go.click();
    await expect(counter).toHaveText('3 / 3');
    await expect(next).toBeDisabled();
    await expect(row.locator('[data-page-counter]')).toHaveText('3 / 3');
    await expect(previewPicture).toBeVisible();
    expect(pair.posts.map(({ command }) => command.layout[0]?.page)).toEqual([0, 1, 0, 2]);
    const applied = pair.posts.at(-1)?.command.layout[0];
    if (applied === undefined) throw new Error('Missing confirmed picture page.');
    expect(applied.graphicInstanceId).toBe(pair.posts[0]?.command.layout[0]?.graphicInstanceId);
    expect(
      bridge.runtime.templateImport({ ...template, name: 'Replacement book' }, html, 1),
    ).toMatchObject({ registered: false, message: /clear the managed picture book/i });
    expect(
      await bridge.runtime.update(
        'book-row',
        { [bookList.fieldId]: [{ kind: 'image', id: 'external', media: 'a'.repeat(64) }] },
        'merge',
      ),
    ).toMatchObject({ accepted: false, errorCode: 'managed-cg-book-read-only' });
    expect(pair.posts).toHaveLength(4);

    const fresh = await browser.newPage();
    cleanup.push(() => fresh.close());
    await fresh.setViewportSize({ width: 1920, height: 1080 });
    await fresh.setContent(html);
    await fresh.evaluate(
      (value) =>
        (
          window as unknown as { apasaiCg: { applyState: (state: unknown) => Promise<void> } }
        ).apasaiCg.applyState(JSON.parse(value) as unknown),
      JSON.stringify({ ...applied, revision: 4, resume: true, resumeWithoutReplay: true }),
    );
    const painted = fresh.locator(
      '[data-cg-element-id="bundled-book"] img[data-cg-asset-id="bundled-picture-2"]:visible',
    );
    await expect(painted).toHaveCount(1);
    expect(
      await painted.evaluate(async (node) => {
        const picture = node as HTMLImageElement;
        await picture.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('No canvas context.');
        context.drawImage(picture, 0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
      }),
    ).toEqual(pictureColours[2]);

    pair.switchOwner();
    running = undefined;
    await bridge.close();
    bridge = await boot();
    running = bridge;
    const reopened = await browser.newPage();
    cleanup.push(() => reopened.close());
    const second = await attach(reopened, bridge.url);
    await second.selectStackRow('managed-picture-book');
    await expect(second.layerState(layerNumber)).toHaveText(/ON AIR/i);
    await expect(second.inspector.getByTestId('book-counter')).toHaveText('3 / 3');
    await second.inspector.getByRole('button', { name: /^Previous page/ }).click();
    await expect(second.inspector.getByTestId('book-counter')).toHaveText('2 / 3');
    expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A', 'A', 'A', 'B']);
    expect(pair.posts.at(-1)?.command.layout[0]?.page).toBe(1);
    expect(pair.posts.at(-1)?.command.layout[0]?.graphicInstanceId).toBe(applied.graphicInstanceId);

    const unsupportedHtml = html.replace(/<meta name="cg-managed-sequence-resume"[^>]*>/, '');
    expect(managedResumePageCountFromHtml(unsupportedHtml)).toBeUndefined();
    expect(
      bridge.runtime.templateImport(
        {
          templateId: 'unsupported-picture-book',
          templateType: 'lower-third',
          name: 'Legacy picture book',
          hasNext: true,
          fields,
          pageLists,
        },
        unsupportedHtml,
        1,
      ).registered,
    ).toBe(true);
    expect(
      await reopened.evaluate(() =>
        window.cg.fixedLayers.load({
          channel: 1,
          layer: 82,
          itemId: 'unsupported-book-row',
          templateId: 'unsupported-picture-book',
          fields: { anchor: 'استودیو' },
        }),
      ),
    ).toMatchObject({ accepted: true });
    await second.selectStackRow('unsupported-picture-book');
    const unsupported = second.inspector.locator('[data-book]');
    await expect(
      unsupported.getByText('Page controls unavailable in External CG v2.'),
    ).toBeVisible();
    await expect(unsupported.getByRole('button', { name: /^Previous page/ })).toHaveCount(0);
    await expect(unsupported.getByRole('button', { name: /^Go to page/ })).toHaveCount(0);
    await expect(unsupported.getByRole('button', { name: /^Manage pages/ })).toHaveCount(0);
    await expect(
      second.layerRow(82).getByRole('button', { name: 'NEXT', exact: true }),
    ).toBeDisabled();
    expect(pair.posts).toHaveLength(5);

    expect(
      core.receivedCommands().every(({ line }) => /^(?:VERSION|INFO|OSC SUBSCRIBE)\b/i.test(line)),
    ).toBe(true);
  } finally {
    for (const close of cleanup.reverse()) await close();
  }
});
