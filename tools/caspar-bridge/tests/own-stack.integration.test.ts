import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedLayerBank } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (`B-294`, `C-047`) — **THE BRIDGE KEEPS ITS OWN STACK, AND CHECKS IT AGAINST
 * THE CORE AT START.**
 *
 * One bridge per Playout serves every console, so the stack cannot live in any console's browser
 * any more: the bridge persists it on every change and restores it at start, before the control
 * socket listens. The first connection is then judged from the core's own `INFO <ch>` (the start
 * check): a row whose page still plays is adopted ON AIR; a row whose layer the core has since
 * emptied leaves ON AIR with the restart notice — and NOTHING is sent for either (the owner's
 * standing decision: detect and say; PUT BACK ON AIR is the operator's).
 */

const BANK: FixedLayerBank = { channel: 1, start: 80, count: 20, low: { start: 50, count: 10 } };
const TEMPLATE = { templateId: 'tpl-own-stack', templateType: 'lower-third' as const, fields: [] };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>row</body></html>';

let mock: MockHandle | null = null;
const bridges: BridgeHandle[] = [];
let dir: string | null = null;

afterEach(async () => {
  for (const b of bridges.splice(0)) await b.close();
  await mock?.stop();
  mock = null;
  if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

function single(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

/** Another AMCP client on the same core: one line, and the reply's first line. */
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

async function bridgeOn(m: MockHandle, oscPort: number, stackPath: string): Promise<BridgeHandle> {
  const b = await createBridge({
    port: 0,
    connection: single(m.amcpPort, oscPort),
    fixedLayers: BANK,
    stackPath,
    // The template store persists beside the stack, as a station's does: a restored row needs its
    // template listed on its channel, or `restore()` skips it as `unknown-template`.
    templatesDir: path.join(path.dirname(stackPath), 'templates'),
  });
  bridges.push(b);
  return b;
}

const statusOf = (b: BridgeHandle, itemId: string): string | undefined =>
  b.runtime.stackSnapshot().find((i) => i.itemId === itemId)?.status;

it('🔴 the stack is kept by the bridge, restored at start, and checked with INFO: the emptied row leaves ON AIR with the notice, the playing row stays ON AIR — and nothing is sent for either', async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-own-stack-'));
  const stackPath = path.join(dir, 'bridge-stack.json');
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40 });
  const m = mock;

  // ── bridge 1: two rows on air, then it stops ──
  const first = await bridgeOn(m, oscPort, stackPath);
  first.runtime.templateImport(TEMPLATE, HTML);
  await first.runtime.whenServerHealthy(HEALTH_MS);
  for (const [layer, itemId] of [
    [99, 'row-99'],
    [98, 'row-98'],
  ] as const) {
    expect(
      (await first.runtime.loadFixed({ channel: 1, layer }, itemId, TEMPLATE.templateId, {}))
        .accepted,
    ).toBe(true);
    expect((await first.runtime.take(itemId)).accepted).toBe(true);
  }
  await waitFor(() => m.layerState({ channel: 1, layer: 99 })?.onAir === true, 'the takes');
  await first.close();
  bridges.splice(bridges.indexOf(first), 1);

  // The file holds both rows, ON AIR — the stack no console re-delivers any more.
  const saved = JSON.parse(fs.readFileSync(stackPath, 'utf8')) as {
    items: { itemId: string; state: string }[];
  };
  expect(saved.items.map((i) => [i.itemId, i.state]).sort()).toEqual([
    ['row-98', 'on-air'],
    ['row-99', 'on-air'],
  ]);

  // ── the core loses ONE of the two pages while no bridge is running ──
  expect(await otherClient(m, 'CLEAR 1-99')).toMatch(/^202 /);
  const from = m.receivedCommands().length;

  // ── bridge 2, on the same file ──
  const second = await bridgeOn(m, oscPort, stackPath);
  expect(second.stack).toMatchObject({ source: 'file', restored: 2 });
  await second.runtime.whenServerHealthy(HEALTH_MS);

  // The start check read the core itself…
  await waitFor(() => second.runtime.emptiedAir() !== null, 'the restart notice');
  const sent = m
    .receivedCommands()
    .slice(from)
    .map((c) => c.line);
  expect(sent).toContain('INFO 1');
  // …the emptied row is named by the notice and is off air…
  expect(second.runtime.emptiedAir()?.rows.map((r) => r.itemId)).toEqual(['row-99']);
  expect(statusOf(second, 'row-99')).not.toBe('on-air');
  // …CONTROL: the row whose page still plays stays ON AIR…
  await waitFor(() => statusOf(second, 'row-98') === 'on-air', 'row-98 ON AIR');
  // …and NOTHING was sent for either: no re-ADD, no CLEAR, no PLAY.
  await delay(400);
  const writes = m
    .receivedCommands()
    .slice(from)
    .map((c) => c.line)
    .filter((l) => /^(CG|CLEAR|PLAY|LOAD)\b/.test(l) && /\b1-9[89]\b/.test(l));
  expect(writes).toEqual([]);
  expect(m.layerState({ channel: 1, layer: 99 })?.onStage).toBe(false);
  expect(m.layerState({ channel: 1, layer: 98 })?.onAir).toBe(true);
});

it('an unusable stack file is said and started empty — the file is left for the next change to replace', async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-own-stack-bad-'));
  const stackPath = path.join(dir, 'bridge-stack.json');
  fs.writeFileSync(stackPath, '{ not json', 'utf8');
  mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const b = await bridgeOn(mock, await freeUdpPort(), stackPath);
  expect(b.stack).toMatchObject({ source: 'unusable', restored: 0 });
  expect(b.runtime.stackSnapshot()).toEqual([]);
  // CONTROL — the file is still what it was: nothing was deleted at start.
  expect(fs.readFileSync(stackPath, 'utf8')).toBe('{ not json');
});
