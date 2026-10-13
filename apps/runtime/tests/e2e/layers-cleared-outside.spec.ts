import * as dgram from 'node:dgram';
import * as net from 'node:net';
import type { Page } from '@playwright/test';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `B-292` (`RELEASE-091-01` DELTA B, B4) — **ANOTHER CLIENT ON THE SAME CASPARCG, SEEN FROM THE
 * CONSOLE.** One real `@cg/caspar-bridge` and one real `@cg/amcp-mock` (`pvw-from-bridge.spec.ts`'s
 * shape), plus a RAW AMCP client on a plain socket standing in for the other station — never a second
 * bridge (DELTA B, B0).
 *
 * 1. B1 — the other client CLEARs a row's layer: the row leaves ON AIR, the strip says so in the
 *    owner's sentence, and nothing is re-sent. Control: the row it did not touch stays ON AIR.
 * 2. B3 — the other client leaves video in our bands: the strip lists it with a CLEAR, one row clears
 *    on its own and CLEAR ALL LISTED clears the rest, one `CLEAR <ch>-<layer>` each. Control: a layer
 *    above the bands is listed with no CLEAR and is never sent.
 *
 * The bridge's timing (the row off air within 2 s of the clear) is measured in
 * `media-plates.integration.test.ts`; this spec reads what the operator sees.
 */

const BANK: FixedLayerBank = { channel: 1, start: 80, count: 20, low: { start: 50, count: 10 } };
const TEMPLATE = {
  templateId: 'tpl-cleared-outside',
  name: 'زیرنویس خبر',
  templateType: 'lower-third',
  fields: [],
};
const HTML =
  '<!doctype html><html><head><meta charset="utf-8"><style>' +
  'html,body{width:1920px;height:1080px;margin:0;overflow:hidden;background:transparent}' +
  '.cg-stage{position:absolute;inset:0}</style></head><body><div class="cg-stage"></div>' +
  '<script>window.play=function(){};window.stop=function(){};' +
  'window.update=function(){};window.next=function(){};</script></body></html>';

let bridge: BridgeHandle | null = null;
let mock: MockHandle | null = null;

test.afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
});

// A real bridge and a real mock per test: serial, as a LOAD bound (`retention-honesty.spec.ts`).
test.describe.configure({ mode: 'serial' });

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

async function boot(): Promise<{ handle: BridgeHandle; server: MockHandle }> {
  const oscPort = await freeUdpPort();
  const server = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10 });
  mock = server;
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: server.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
  // A leftover surfaces after two consecutive sweeps; at the 5 s default that is up to ten seconds
  // of an operator-visible wait this spec is not about.
  const handle = await createBridge({
    port: 0,
    connection,
    fixedLayers: BANK,
    runtimeTuning: { sweepMs: 300 },
  });
  bridge = handle;
  return { handle, server };
}

async function openConsole(page: Page, url: string): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(
    ([u]) => {
      const w = window as unknown as { __CG_BRIDGE_URL__: string; __CG_SPLASH_DISABLED__: boolean };
      w.__CG_BRIDGE_URL__ = u as string;
      w.__CG_SPLASH_DISABLED__ = true;
    },
    [url],
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Bridge link' })).not.toContainText('DISCONNECTED');
}

/** The other station: ONE line on a raw AMCP socket, and the reply's first line. */
function otherClient(server: MockHandle, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: server.host, port: server.amcpPort }, () => {
      socket.write(`${line}\r\n`);
    });
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf('\r\n');
      if (end < 0) return;
      socket.end();
      resolve(buffer.slice(0, end));
    });
    socket.once('error', reject);
  });
}

const row = (page: Page, layer: number) =>
  page
    .getByRole('region', { name: 'Layers' })
    .locator(`[data-layer="${String(layer)}"]`)
    .first();

/** Import the template and bind it to a row, then take it — the operator's LOAD and PLAY. */
async function takeRow(page: Page, layer: number, itemId: string): Promise<void> {
  await page.evaluate(
    async ([tpl, html, l, id]) => {
      const w = window as unknown as {
        cg: {
          templates: { import: (r: unknown) => Promise<unknown> };
          fixedLayers: { load: (r: unknown) => Promise<unknown> };
        };
      };
      await w.cg.templates.import({ template: tpl, html, channel: 1 });
      await w.cg.fixedLayers.load({
        channel: 1,
        layer: l,
        itemId: id,
        templateId: 'tpl-cleared-outside',
        fields: {},
      });
    },
    [TEMPLATE, HTML, layer, itemId] as const,
  );
  await expect(row(page, layer)).toHaveAttribute('data-item-id', itemId);
  await page.evaluate(async (id) => {
    const w = window as unknown as { cg: { stack: { take: (r: unknown) => Promise<unknown> } } };
    await w.cg.stack.take({ itemId: id });
  }, itemId);
  await expect(row(page, layer)).toContainText('ON AIR');
}

/** What the bridge's tap has heard on a row's layer — the silence question needs it HEARD first. */
function observedOn(page: Page, layer: number): Promise<string | undefined> {
  return page.evaluate(async (l) => {
    const w = window as unknown as {
      cg: { fixedLayers: { state: () => Promise<FixedSlotState[]> } };
    };
    const slot = (await w.cg.fixedLayers.state()).find((s) => s.channel === 1 && s.layer === l);
    return slot?.observed.kind === 'producer' ? slot.observed.producer : slot?.observed.kind;
  }, layer);
}

test('🔴 B-292 — another client CLEARs a row’s layer: the row leaves ON AIR and the strip says so, nothing is re-sent — control: the other row stays ON AIR', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { handle, server } = await boot();
  await openConsole(page, handle.url);
  await takeRow(page, 99, 'item-99');
  await takeRow(page, 98, 'item-98');
  await expect.poll(() => observedOn(page, 99)).toBe('html');

  const from = server.receivedCommands().length;
  expect(await otherClient(server, 'CLEAR 1-99')).toMatch(/^202 /);

  const strip = page.getByRole('alert', { name: 'Layers cleared outside CG Control' });
  await expect(strip).toContainText('Layer 99 on CH 1 was cleared outside CG Control');
  await expect(row(page, 99)).not.toContainText('ON AIR');
  // CONTROL — the row the other client did not touch is still ON AIR.
  await expect(row(page, 98)).toContainText('ON AIR');

  // Nothing was put back: the only line on 1-99 since the clear is the other client's own CLEAR
  // (which is also the positive control that this log reads the wire at all).
  const onThatLayer = server
    .receivedCommands()
    .slice(from)
    .map((c) => c.line)
    .filter((l) => /\b1-99\b/.test(l));
  expect(onThatLayer).toEqual(['CLEAR 1-99']);

  // The strip is this family's: dismissible, and it goes.
  await strip.getByRole('button', { name: 'Dismiss this notice' }).click();
  await expect(strip).toHaveCount(0);
});

test('🔴 B-292 — video another client left in our bands is listed and clears from the strip: one CLEAR, then CLEAR ALL LISTED — control: the layer above the bands has no CLEAR and is never sent', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { handle, server } = await boot();
  await openConsole(page, handle.url);

  for (const layer of [70, 71, 72, 120]) {
    expect(
      await otherClient(server, `PLAY 1-${String(layer)} "C:/Media/left-${String(layer)}.mov"`),
    ).toMatch(/^202 /);
  }
  const from = server.receivedCommands().length;

  const strip = page.getByRole('status', { name: 'Layers in use by other systems' });
  for (const layer of [70, 71, 72, 120]) {
    await expect(strip).toContainText(`Layer 1-${String(layer)} is carrying video`);
  }
  // CONTROL — above the bands: listed, no CLEAR, and it says so.
  await expect(strip.getByRole('button', { name: 'Clear layer 1-120' })).toHaveCount(0);
  await expect(strip).toContainText('Not clearable from here.');

  // One row, on its own.
  await strip.getByRole('button', { name: 'Clear layer 1-70' }).click();
  const one = page.getByRole('dialog', { name: 'Clear layer 1-70?' });
  await one.getByRole('button', { name: 'Clear layer', exact: true }).click();
  await expect(strip).not.toContainText('Layer 1-70 is carrying video');

  // Everything else it may clear, in one confirm.
  await strip.getByRole('button', { name: 'Clear all listed layers' }).click();
  const all = page.getByRole('dialog', { name: 'Clear 2 layers?' });
  await expect(all).toContainText('1-71, 1-72');
  await expect(all).not.toContainText('1-120');
  await all.getByRole('button', { name: 'Clear 2 layers', exact: true }).click();
  await expect(strip).not.toContainText('Layer 1-71 is carrying video');
  await expect(strip).not.toContainText('Layer 1-72 is carrying video');
  await expect(strip).toContainText('Layer 1-120 is carrying video');

  // The wire: one CLEAR per layer, never a channel-wide CLEAR, never the layer above the bands.
  const clears = server
    .receivedCommands()
    .slice(from)
    .map((c) => c.line)
    .filter((l) => l.startsWith('CLEAR'));
  expect(clears).toEqual(['CLEAR 1-70', 'CLEAR 1-71', 'CLEAR 1-72']);
});
