import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, FixedLayerBank, StackRestoreReport } from '@cg/shared-ipc';
import type { RetainedStackItem } from '@cg/shared-schema';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { openClient, type Client } from './support/auth-harness.js';
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
const clients: Client[] = [];
let dir: string | null = null;

afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.close();
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

it('🔴 B-108 at the bridge — a row the start’s restore could not bring back is in the STANDING report, for every console; one console’s dismissal clears it for all', async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-own-stack-report-'));
  const stackPath = path.join(dir, 'bridge-stack.json');
  // A stack whose one row names a template the bridge no longer holds.
  fs.writeFileSync(
    stackPath,
    JSON.stringify({
      version: 1,
      items: [
        {
          itemId: 'row-gone',
          templateId: 'tpl-missing',
          fields: {},
          state: 'loaded',
          slot: { channel: 1, layer: 99, server: 'primary' },
        },
      ],
    }),
    'utf8',
  );
  mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const b = await bridgeOn(mock, await freeUdpPort(), stackPath);
  expect(b.stack).toMatchObject({ source: 'file', restored: 0 });

  const a = await openClient(b);
  const c = await openClient(b);
  clients.push(a, c);
  for (const console_ of [a, c]) {
    const report = (await console_.ask(`r-${String(Math.random())}`, 'stack.restore-report'))
      .payload as StackRestoreReport | null;
    expect(report?.skipped).toEqual([
      {
        itemId: 'row-gone',
        reason: 'unknown-template',
        templateId: 'tpl-missing',
        slot: { channel: 1, layer: 99, server: 'primary' },
      },
    ]);
  }

  expect((await a.ask('d', 'stack.dismiss-restore-report', { part: 'skipped' })).payload).toEqual({
    ok: true,
  });
  // The OTHER console is told, with no request of its own…
  await waitFor(
    () =>
      c
        .publishes()
        .some((f) => f.type === 'publish' && f.channel === 'stack.restore-report-changed'),
    'the push to the other console',
  );
  const pushed = c
    .publishes()
    .filter((f) => f.type === 'publish' && f.channel === 'stack.restore-report-changed')
    .at(-1);
  expect(pushed?.type === 'publish' ? pushed.payload : 'no push').toBeNull();
  // …and a dismissal of nothing is not a success (CONTROL: the first one did something).
  expect((await c.ask('d2', 'stack.dismiss-restore-report', { part: 'skipped' })).payload).toEqual({
    ok: false,
  });
});

it('the report never carries the BENIGN skip, and a dismissal NAMING a channel leaves the other channels’ rows', async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-own-stack-scope-'));
  const stackPath = path.join(dir, 'bridge-stack.json');
  const row = (itemId: string, channel: number): RetainedStackItem => ({
    itemId,
    templateId: 'tpl-missing',
    fields: {},
    state: 'loaded',
    slot: { channel, layer: 99, server: 'primary' },
  });
  // Two rows that cannot come back: one on channel 1 (its template is gone), one on channel 2
  // (not declared here).
  fs.writeFileSync(
    stackPath,
    JSON.stringify({ version: 1, items: [row('on-1', 1), row('on-2', 2)] }),
    'utf8',
  );
  mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const b = await bridgeOn(mock, await freeUdpPort(), stackPath);
  const skippedIds = (): string[] =>
    (b.runtime.restoreReport()?.skipped ?? []).map((s) => s.itemId).sort();
  expect(skippedIds()).toEqual(['on-1', 'on-2']);

  // A dismissal NAMING channel 1 leaves channel 2's row — its operator has not read it yet.
  expect(b.runtime.dismissRestoreReport('skipped', 1)).toEqual({ ok: true });
  expect(skippedIds(), 'channel 1’s dismissal cleared channel 2’s row').toEqual(['on-2']);
  expect(b.runtime.dismissRestoreReport('skipped', 1), 'nothing left on channel 1').toEqual({
    ok: false,
  });
  // `CENTRAL-BRIDGE-01` (D4) — a dismissal by a console told only channel 1 names no channel and
  // still reaches only what it was told: channel 2's row stays for channel 2's console.
  expect(b.runtime.dismissRestoreReport('skipped', undefined, (c) => c === 1)).toEqual({
    ok: false,
  });
  expect(skippedIds(), 'a channel-1 console cleared channel 2’s row').toEqual(['on-2']);
  // A dismissal naming none, by a console holding every channel, takes the rest.
  expect(b.runtime.dismissRestoreReport('skipped')).toEqual({ ok: true });
  expect(b.runtime.restoreReport()).toBeNull();

  // The benign skip — a row the live bridge already holds — never joins the report; CONTROL: a
  // real skip in the same restore does.
  b.runtime.templateImport(TEMPLATE, HTML);
  const held = {
    itemId: 'held',
    templateId: TEMPLATE.templateId,
    fields: {},
    state: 'loaded' as const,
    slot: { channel: 1, layer: 98, server: 'primary' as const },
  };
  expect((await b.runtime.restore([held])).restored).toBe(1);
  const again = await b.runtime.restore([held, row('on-3', 1)]);
  expect(again.skipped.map((s) => [s.itemId, s.reason])).toEqual([
    ['held', 'already-held'],
    ['on-3', 'unknown-template'],
  ]);
  expect(skippedIds()).toEqual(['on-3']);

  // `CENTRAL-BRIDGE-01` (D4) — the scoped dismissal's positive half: a channel-2 console cannot
  // reach channel 1's row, and a channel-1 console's bare dismissal takes it.
  expect(b.runtime.dismissRestoreReport('skipped', undefined, (c) => c === 2)).toEqual({
    ok: false,
  });
  expect(b.runtime.dismissRestoreReport('skipped', undefined, (c) => c === 1)).toEqual({
    ok: true,
  });
  expect(b.runtime.restoreReport()).toBeNull();
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
