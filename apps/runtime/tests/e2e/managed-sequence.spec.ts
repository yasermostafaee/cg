import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMock } from '@cg/amcp-mock';
import { createBridge } from '@cg/caspar-bridge';
import { managedResumePageCountFromHtml, SequenceElementSchema } from '@cg/shared-schema';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import { cgCss, cgJsIife, ExporterSingleFile } from '@cg/single-file-export';
import { lowerThirdScene } from '../../../../packages/template-runtime/tests/fixtures.js';
import { playoutPair } from '../../../../tools/caspar-bridge/tests/support/managed-playout-pair.js';
import { expect, RuntimeApp, test } from './fixtures/runtime.js';

const titles = ['صفحهٔ اول', 'صفحهٔ دوم', 'صفحهٔ سوم'] as const;

async function exportSequence(): Promise<string> {
  const scene = structuredClone(lowerThirdScene);
  const layer = scene.layers[0];
  const caption = layer?.children.find((child) => child.type === 'text');
  if (layer === undefined || caption?.type !== 'text') throw new Error('Missing fixture caption.');
  layer.children.push(
    SequenceElementSchema.parse({
      ...caption,
      id: 'managed-pages',
      name: 'Pages',
      type: 'sequence',
      transform: { ...caption.transform, position: { x: 120, y: 700 } },
      items: titles.map((text, index) => ({ kind: 'text', id: 'page-' + index, text })),
      advance: 'manual',
      repeat: 1,
      transitionIn: 'none',
      transitionOut: 'none',
    }),
  );
  const exporter = new ExporterSingleFile({
    cgJsIife,
    cgCss,
    fontsCss: '',
    assets: { get: async () => null, bytes: async () => null },
  });
  const { html } = await exporter.produce(scene);
  return html;
}

test('managed Next resumes the applied sequence page in Control and in a fresh renderer', async ({
  browser,
  page,
}) => {
  test.setTimeout(60_000);
  const directory = mkdtempSync(join(tmpdir(), 'cg-managed-sequence-'));
  const cleanup: (() => Promise<void> | void)[] = [
    () => rmSync(directory, { recursive: true, force: true }),
  ];
  try {
    const html = await exportSequence();
    expect(managedResumePageCountFromHtml(html)).toBe(titles.length);
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
        fixedLayers: { ...bank, visibility: { ...bank.visibility, 81: true } },
        stackPath: join(directory, 'stack.json'),
        templatesDir: join(directory, 'templates'),
        managedCgPilot: { channel: 1, commands: pair.executor() },
      });
    const attach = async (consolePage: typeof page, url: string) => {
      await consolePage.setViewportSize({ width: 1440, height: 900 });
      await consolePage.addInitScript(
        'window.__CG_BRIDGE_URL__ = ' +
          JSON.stringify(url) +
          '; window.__CG_SPLASH_DISABLED__ = true;',
      );
      const app = new RuntimeApp(consolePage);
      await app.goto();
      return app;
    };
    let bridge = await boot();
    let liveBridge: typeof bridge | undefined = bridge;
    cleanup.push(async () => liveBridge?.close());
    expect(
      bridge.runtime.templateImport(
        {
          templateId: 'managed-sequence',
          templateType: 'lower-third',
          name: 'Manual sequence',
          hasNext: true,
          fields: [
            {
              id: 'anchor',
              label: 'Anchor',
              type: 'text',
              required: true,
              default: 'استودیو',
            },
          ],
        },
        html,
        1,
      ).registered,
    ).toBe(true);
    await bridge.runtime.whenServerHealthy(8_000);
    const app = await attach(page, bridge.url);
    const initial = await page.evaluate(() =>
      window.cg.fixedLayers.load({
        channel: 1,
        layer: 81,
        itemId: 'sequence-row',
        templateId: 'managed-sequence',
        fields: { anchor: 'استودیو' },
      }),
    );
    expect(initial).toMatchObject({ accepted: true });
    await app.layerRow(81).getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect(app.layerState(81)).toHaveText(/ON AIR/i);
    expect(pair.posts[0]?.command.layout[0]?.page).toBe(0);
    await app.layerRow(81).getByRole('button', { name: 'NEXT', exact: true }).click();
    await expect.poll(() => pair.posts.at(-1)?.command.layout[0]?.page).toBe(1);
    const layer = pair.posts.at(-1)?.command.layout[0];
    expect(layer?.graphicInstanceId).toBe(pair.posts[0]?.command.layout[0]?.graphicInstanceId);
    expect(layer?.data).toEqual({ anchor: 'استودیو' });

    pair.switchOwner();
    liveBridge = undefined;
    await bridge.close();
    bridge = await boot();
    liveBridge = bridge;
    const newConsole = await browser.newPage();
    cleanup.push(() => newConsole.close());
    const reopened = await attach(newConsole, bridge.url);
    await expect(reopened.layerState(81)).toHaveText(/ON AIR/i);
    expect(pair.posts).toHaveLength(2);

    const freshRenderer = await browser.newPage();
    cleanup.push(() => freshRenderer.close());
    await freshRenderer.setViewportSize({ width: 1920, height: 1080 });
    await freshRenderer.setContent(html);
    await freshRenderer.evaluate(
      (value) =>
        (
          window as unknown as { apasaiCg: { applyState: (state: unknown) => Promise<void> } }
        ).apasaiCg.applyState(JSON.parse(value) as unknown),
      JSON.stringify({ ...layer, revision: 2, resume: true, resumeWithoutReplay: true }),
    );
    const sequence = freshRenderer.locator('[data-cg-element-id="managed-pages"]');
    await expect(sequence).toHaveText(titles[1]);
    await expect(sequence).toBeVisible();
    await reopened.layerRow(81).getByRole('button', { name: 'NEXT', exact: true }).click();
    await expect.poll(() => pair.posts.at(-1)?.command.layout[0]?.page).toBe(2);
    expect(pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A', 'B']);
    expect(pair.posts.at(-1)?.command.layout[0]?.graphicInstanceId).toBe(layer?.graphicInstanceId);
    const last = await newConsole.evaluate(() => window.cg.stack.next({ itemId: 'sequence-row' }));
    expect(last).toMatchObject({ accepted: true });
    expect(pair.posts).toHaveLength(3);
    await reopened.layerRow(81).getByRole('button', { name: 'STOP', exact: true }).click();
    await expect
      .poll(() => {
        const stopped = pair.posts.at(-1)?.command.layout[0];
        return stopped?.visibility === 'stopped' && stopped.page === 0;
      })
      .toBe(true);
    await expect
      .poll(
        () =>
          bridge.runtime.stackSnapshot().find(({ itemId }) => itemId === 'sequence-row')?.status,
      )
      .toBe('loaded');
    await expect(bridge.runtime.take('sequence-row')).resolves.toMatchObject({ accepted: true });
    const release = pair.pauseNextLayout();
    const next = bridge.runtime.nextItem('sequence-row');
    await expect.poll(() => pair.posts.at(-1)?.command.layout[0]?.page).toBe(1);
    const stop = bridge.runtime.stopItem('sequence-row');
    release();
    await expect(next).resolves.toMatchObject({ accepted: true });
    await expect(stop).resolves.toMatchObject({ accepted: true });
    expect(pair.posts.at(-1)?.command.layout[0]?.visibility).toBe('stopped');
    expect(pair.posts.at(-1)?.command.layout[0]?.page).toBe(0);
    expect(
      core.receivedCommands().every(({ line }) => /^(?:VERSION|INFO|OSC SUBSCRIBE)\b/i.test(line)),
    ).toBe(true);
  } finally {
    for (const close of cleanup.reverse()) await close();
  }
});
