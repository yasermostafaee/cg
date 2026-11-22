import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMock } from '@cg/amcp-mock';
import { createBridge } from '@cg/caspar-bridge';
import { CG_MANAGED_STATIC_RESUME_PAGE_MARKER } from '@cg/shared-schema';
import { playoutPair } from '../../../../tools/caspar-bridge/tests/support/managed-playout-pair.js';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import { expect, RuntimeApp, test } from './fixtures/runtime.js';

test('managed CG row buttons use Playout and reattach after Bridge restart and owner transfer', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const cleanup: (() => Promise<void> | void)[] = [];
  const directory = mkdtempSync(join(tmpdir(), 'cg-managed-control-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  try {
    const pair = await playoutPair(cleanup);
    const coreA = await createMock({ amcpPort: 0 });
    cleanup.push(() => coreA.stop());
    const coreB = await createMock({ amcpPort: 0 });
    cleanup.push(() => coreB.stop());
    const bank = defaultFixedLayerBank();
    const boot = () =>
      createBridge({
        port: 0,
        connection: {
          servers: {
            A: { host: '127.0.0.1', amcpPort: coreA.amcpPort, oscPort: 0 },
            B: { host: '127.0.0.1', amcpPort: coreB.amcpPort, oscPort: 0 },
          },
          strategy: 'mirror-sync',
          autoFailoverEnabled: false,
        },
        fixedLayers: { ...bank, visibility: { ...bank.visibility, 81: true } },
        stackPath: join(directory, 'stack.json'),
        templatesDir: join(directory, 'templates'),
        managedCgPilot: { channel: 1, commands: pair.executor() },
      });
    const template = {
      templateId: 'managed-caption',
      templateType: 'logo' as const,
      name: 'Static caption',
      fields: [
        {
          id: 'headline',
          label: 'Headline',
          type: 'text' as const,
          required: false,
          default: 'Caption A',
        },
      ],
    };
    const bridge = await boot();
    let activeBridge: Awaited<ReturnType<typeof boot>> | undefined = bridge;
    cleanup.push(async () => activeBridge?.close());
    bridge.runtime.templateImport(
      template,
      '<!doctype html><html><head>' +
        CG_MANAGED_STATIC_RESUME_PAGE_MARKER +
        '</head><body>Static caption fixture</body></html>',
      1,
    );
    await bridge.runtime.whenServerHealthy(8_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(
      'window.__CG_BRIDGE_URL__ = ' +
        JSON.stringify(bridge.url) +
        '; window.__CG_SPLASH_DISABLED__ = true;',
    );
    const app = new RuntimeApp(page);
    await app.goto();
    const row = app.layerRow(81);
    await expect(row).toBeVisible();
    const loaded = await page.evaluate(async () =>
      window.cg.fixedLayers.load({
        channel: 1,
        layer: 81,
        itemId: 'managed-row',
        templateId: 'managed-caption',
        fields: { headline: 'Caption A' },
      }),
    );
    expect(loaded).toMatchObject({ accepted: true });

    await row.getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect.poll(() => pair.posts.map(({ engine }) => engine)).toEqual(['A']);
    await expect(app.layerState(81)).toHaveText(/ON AIR/i);
    expect(pair.posts[0]?.command.layout[0]?.data).toEqual({ headline: 'Caption A' });
    const instance = pair.posts[0]?.command.layout[0]?.graphicInstanceId;

    await app.selectLayerRow(81);
    await app.inspector.getByRole('textbox', { name: 'Headline' }).fill('Caption updated');
    await app.applyEdits();
    await expect.poll(() => pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A']);
    expect(pair.posts[1]?.command.layout[0]).toMatchObject({
      graphicInstanceId: instance,
      data: { headline: 'Caption updated' },
    });

    pair.switchOwner();
    activeBridge = undefined;
    await bridge.close();
    const restarted = await boot();
    activeBridge = restarted;
    expect(restarted.runtime.stackSnapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'managed-row',
          status: 'playing',
          fields: { headline: 'Caption updated' },
        }),
      ]),
    );
    expect(pair.posts).toHaveLength(2);
    const nextPage = await page.context().newPage();
    await nextPage.setViewportSize({ width: 1440, height: 900 });
    await nextPage.addInitScript(
      'window.__CG_BRIDGE_URL__ = ' +
        JSON.stringify(restarted.url) +
        '; window.__CG_SPLASH_DISABLED__ = true;',
    );
    const reopened = new RuntimeApp(nextPage);
    await reopened.goto();
    await expect(reopened.layerState(81)).toHaveText(/ON AIR/i);
    await reopened.layerRow(81).getByRole('button', { name: 'STOP', exact: true }).click();
    await expect.poll(() => pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A', 'B']);
    expect(pair.posts[2]?.command.layout[0]).toMatchObject({
      graphicInstanceId: instance,
      visibility: 'stopped',
    });

    await reopened.layerRow(81).getByRole('button', { name: 'CLEAR', exact: true }).click();
    const confirmation = nextPage.getByRole('dialog', { name: /clear/i });
    if (await confirmation.isVisible())
      await confirmation.getByRole('button', { name: /clear/i }).click();
    await expect.poll(() => pair.posts.map(({ engine }) => engine)).toEqual(['A', 'A', 'B', 'B']);
    expect(pair.posts[3]?.command.layout).toEqual([]);

    const coreLines = [...coreA.receivedCommands(), ...coreB.receivedCommands()].map(
      ({ line }) => line,
    );
    expect(coreLines).toContain('VERSION');
    expect(coreLines.every((line) => /^(?:VERSION|INFO|OSC SUBSCRIBE)\b/i.test(line))).toBe(true);
  } finally {
    for (const close of cleanup.reverse()) await close();
  }
});
