import { createMock } from '@cg/amcp-mock';
import { createBridge } from '@cg/caspar-bridge';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import { expect, test } from '@playwright/test';
import { createSocket } from 'node:dgram';
import { WebSocket } from 'ws';
import type { RuntimeBridge } from '../../src/shared/runtime-bridge.js';
import { APP, STATION_KEY, asCgControl, deadPort } from './fixtures/cg-control.js';

const HOST = '127.0.0.1';
const SESSION_KEY = 'cg.runtime.playoutSession';

function freeOscPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, HOST, () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

test('R-098 connects to raw CasparCG, repairs server A and plays without a Playout session', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const missing = await deadPort(HOST);
  const oscPort = await freeOscPort();
  const caspar = await createMock({ amcpPort: 0, oscPort });
  let bridge: Awaited<ReturnType<typeof createBridge>> | undefined;
  try {
    bridge = await createBridge({
      port: 0,
      stationMode: 'standalone',
      fixedLayers: defaultFixedLayerBank(),
      connection: {
        servers: { A: { host: HOST, amcpPort: missing, oscPort } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
    });
    await asCgControl(page, null);
    await page.addInitScript((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({ accessToken: 'old-playout-token', expiresAtMs: Date.now() + 60_000 }),
      );
    }, SESSION_KEY);
    const outgoing: { type?: string; channel?: string }[] = [];
    const target = bridge.url;
    // Playwright serves a synthetic tauri.localhost origin. Relay to the real bridge with the
    // installed Origin so Chromium's local-network permission does not stand in for WebView2.
    await page.routeWebSocket(`${target}/`, (ws) => {
      const upstream = new WebSocket(target, { origin: APP });
      const waiting: string[] = [];
      upstream.on('open', () => {
        for (const frame of waiting.splice(0)) upstream.send(frame);
      });
      upstream.on('message', (frame) => ws.send(String(frame)));
      upstream.on('close', () => ws.close());
      upstream.on('error', () => ws.close());
      ws.onMessage((frame) => {
        const payload = String(frame);
        outgoing.push(JSON.parse(payload) as (typeof outgoing)[number]);
        if (upstream.readyState === WebSocket.OPEN) upstream.send(payload);
        else waiting.push(payload);
      });
      ws.onClose(() => upstream.close());
    });
    await page.setViewportSize({ width: 1600, height: 960 });
    await page.goto(`${APP}/`);
    const gate = page.getByRole('dialog', { name: 'Set up CG Control' });
    await expect(gate.getByLabel('Station mode')).toHaveValue('playout');
    await gate.getByLabel('Station mode').selectOption('standalone');
    await expect(gate.getByLabel('Playout host')).toHaveCount(0);
    await expect(gate.getByLabel('CG Bridge host')).toHaveAttribute('placeholder', HOST);
    await gate.getByLabel('CG Bridge host').fill('localhost');
    await gate.getByLabel('CG Bridge port').fill(String(bridge.port));
    await gate.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(gate.getByRole('status')).toContainText(`port ${String(missing)}`);
    await expect(gate.getByRole('status')).toContainText('Settings → Connection');
    expect(await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)).toBeNull();
    await gate.getByRole('button', { name: 'Continue to CG Control' }).click();

    await expect(gate).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
    expect(
      JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)) ?? 'null'),
    ).toEqual({
      mode: 'standalone',
      bridgeAddress: `${HOST}:${String(bridge.port)}`,
    });

    await page.getByRole('button', { name: 'Open Station setup', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Station setup' });
    await settings.getByRole('tab', { name: 'Connection' }).click();
    const standalone = settings.getByRole('region', { name: 'No Playout', exact: true });
    await expect(standalone.getByLabel('CG Bridge host')).toHaveValue(HOST);
    await expect(standalone.getByLabel('CG Bridge port')).toHaveValue(String(bridge.port));
    await expect(settings.getByLabel('Primary host')).toHaveValue(HOST);
    await expect(settings.getByLabel('Primary OSC port')).toBeEditable();
    await settings.getByLabel('Primary AMCP port').fill(String(caspar.amcpPort));
    await settings.getByRole('button', { name: 'Apply server settings' }).click();
    await expect(settings.getByText('Applied. All listeners remain loopback-only.')).toBeVisible();
    await standalone.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(standalone.getByRole('button', { name: 'Checking…', exact: true })).toHaveCount(0);
    const show = standalone.getByRole('button', { name: 'Show all', exact: false });
    if (await show.count()) await show.click();
    await expect(standalone.getByText(/answered VERSION/)).toBeVisible();
    await settings.getByRole('button', { name: 'Close', exact: true }).click();

    await bridge.runtime.whenServerHealthy();
    await page.evaluate(async () => {
      const { cg } = window as unknown as { cg: RuntimeBridge };
      const templateId = 'tpl-standalone-check';
      await cg.templates.import({
        template: { templateId, name: 'Standalone check', templateType: 'lower-third', fields: [] },
        html: '<!doctype html><html><body>Standalone CG</body></html>',
        channel: 1,
      });
      await cg.fixedLayers.load({
        channel: 1,
        layer: 99,
        itemId: 'standalone-check',
        templateId,
        fields: {},
      });
    });
    const row = page.locator('[data-item-id="standalone-check"]');
    await row.getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect(row).toHaveAttribute('data-row-state', 'onair');
    expect(outgoing.filter((frame) => frame.channel === 'setup.check-standalone')).toHaveLength(2);
    expect(outgoing.some((frame) => frame.type === 'auth' || frame.channel === 'setup.check')).toBe(
      false,
    );
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toContain(
      'old-playout-token',
    );
  } finally {
    await bridge?.close();
    await caspar.stop();
  }
});

test('R-098 refuses a remote Bridge address and ordinary auth-off Bridge', async ({ page }) => {
  await asCgControl(page, null);
  const outgoing: string[] = [];
  await page.routeWebSocket('ws://127.0.0.1:5280/', (ws) => {
    ws.onMessage((raw) => {
      const frame = JSON.parse(String(raw)) as { id: string; channel: string };
      outgoing.push(frame.channel);
      ws.send(
        JSON.stringify({ type: 'response', id: frame.id, payload: { channels: [], auth: 'off' } }),
      );
    });
  });
  await page.goto(`${APP}/`);
  const gate = page.getByRole('dialog', { name: 'Set up CG Control' });
  await gate.getByLabel('Station mode').selectOption('standalone');
  const host = gate.getByLabel('CG Bridge host');
  const connect = gate.getByRole('button', { name: 'Connect', exact: true });
  await host.fill('192.0.2.20');
  await connect.click();
  await expect(gate.getByRole('status')).toContainText('requires CG Bridge on this computer');
  expect(outgoing).toEqual([]);
  await host.clear();
  await connect.click();
  await expect(gate.getByRole('status')).toContainText('is not set up for No Playout');
  expect(outgoing).toEqual(['bridge.capabilities']);
  expect(await page.evaluate((key) => localStorage.getItem(key), STATION_KEY)).toBeNull();
});
