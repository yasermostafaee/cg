import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue } from '@cg/caspar-client';
import {
  fixedBankSlots,
  type ConnectionConfig,
  type FixedLayerBank,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { awaitChannelModeRead, HEALTH_MS, track } from './support/harness.js';

/**
 * 🔴 `DESKTOP-APPS-01-D` — **A STATION OPERATES ONE CHANNEL, AND NOTHING IT DOES REACHES ANOTHER.**
 * Measured at the mock's wire, never at a return value.
 *
 * The owner's installed CG Control was set up on channel 1 — the Playout's programme channel,
 * carrying the Playout's video on `1-5` — took a logo on `1-99`, and was then moved to channel 2
 * by hand with that logo still looping. Every case below is one of the questions that raised:
 *
 *   c — can any clear path reach `1-5`, or any layer in 1–49? (No — pinned.)
 *   d — what does the station see on a channel before declaring it?
 *   e — may the channel be changed in-app, and when not?
 *   j — what becomes of an item of ours left on a channel the station no longer declares?
 *
 * Each negative observation carries a positive control on the same boot.
 */

const SWEEP_MS = 150;
const STALE_MS = 800;
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>آرم</body></html>';
const TEMPLATE: TemplateInfo = { templateId: 'logo', templateType: 'logo', fields: [] };

/** The owner's first-run bank, on a given channel: operator rows 80–99, beds 50–59, all shown. */
function bank(channel: number): FixedLayerBank {
  const shown = (from: number, to: number): Record<string, boolean> => {
    const v: Record<string, boolean> = {};
    for (let l = from; l <= to; l++) v[String(l)] = true;
    return v;
  };
  return {
    channel,
    start: 80,
    count: 20,
    visibility: shown(80, 99),
    low: { start: 50, count: 10, visibility: shown(50, 59) },
  };
}

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

function freeTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(
  cond: () => boolean | Promise<boolean>,
  what: string,
  ms = 8000,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

interface Rig {
  readonly mock: MockHandle;
  readonly handle: BridgeHandle;
  readonly connection: ConnectionConfig;
  lines(): Promise<string[]>;
  /** An AMCP line sent by ANOTHER system — the Playout, or a previous run of ours. */
  foreign(line: string): Promise<void>;
}

async function rig(
  opts: { bank?: FixedLayerBank; firstRun?: boolean; deadAtBoot?: boolean } = {},
): Promise<Rig> {
  const oscPort = await freeUdpPort();
  const tracePath = path.join(
    os.tmpdir(),
    `cg-onechannel-${String(process.pid)}-${String(Date.now())}-${String(Math.trunc(performance.now()))}.ndjson`,
  );
  track(tracePath, (p) => {
    if (fs.existsSync(p)) fs.rmSync(p);
  });
  const mock = track(
    await createMock({
      amcpPort: 0,
      oscPort,
      oscHost: '127.0.0.1',
      oscHz: 40,
      channels: 2,
      tracePath,
    }),
    (m) => m.stop(),
  );
  const connection: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
  const dead: ConnectionConfig = {
    servers: {
      A: { host: '127.0.0.1', amcpPort: await freeTcpPort(), oscPort: await freeUdpPort() },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
  const handle = track(
    await createBridge({
      port: 0,
      connection: opts.deadAtBoot === true ? dead : connection,
      ...(opts.bank !== undefined ? { fixedLayers: opts.bank } : {}),
      ...(opts.firstRun === true ? { firstRun: true } : {}),
      runtimeTuning: { sweepMs: SWEEP_MS, occupancyStaleMs: STALE_MS },
    }),
    (h) => h.close(),
  );
  if (opts.deadAtBoot !== true) {
    await handle.runtime.whenServerHealthy(HEALTH_MS);
    if (opts.bank !== undefined) await awaitChannelModeRead(handle.runtime);
  }
  handle.runtime.templateImport(TEMPLATE, HTML);
  let queue: CommandQueue | null = null;
  return {
    mock,
    handle,
    connection,
    async lines() {
      await mock.traceFlush();
      if (!fs.existsSync(tracePath)) return [];
      return fs
        .readFileSync(tracePath, 'utf-8')
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as { dir: string; line: string })
        .filter((e) => e.dir === 'recv')
        .map((e) => e.line);
    },
    async foreign(line) {
      if (queue === null) {
        const transport = track(new AmcpTransport(), (t) => t.destroy());
        await transport.connect(mock.host, mock.amcpPort);
        queue = track(new CommandQueue(transport), (q) => q.dispose());
      }
      await queue.enqueue(line);
    },
  };
}

/** Every line whose target is on `channel` (`CLEAR 1-20`, `INFO 1`, `CG 1-99 STOP 0`). */
function addressing(lines: readonly string[], channel: number): string[] {
  const targeted = new RegExp(`^[A-Z][A-Z ]*?\\s${String(channel)}(?:-\\d+)?(?:\\s|$)`);
  return lines.filter((l) => targeted.test(l));
}

/** The layer a line addresses on `channel`, or null. */
function layerOf(line: string, channel: number): number | null {
  const m = new RegExp(`\\s${String(channel)}-(\\d+)(?:\\s|$)`).exec(line);
  return m === null ? null : Number(m[1]);
}

async function heard(r: Rig, channel: number, layer: number): Promise<void> {
  await waitFor(
    async () =>
      (await r.handle.runtime.channelOccupancy(channel, 0)).layers.some((l) => l.layer === layer),
    `the tap to hear ${String(channel)}-${String(layer)}`,
  );
}

describe('c — no control reaches a layer outside CG’s bands, or a layer another system holds', () => {
  it('CLEAR ALL, a row CLEAR and a layer CLEAR send NOTHING to 1-5 or 1–49 — control: our band’s clears land', async () => {
    const r = await rig({ bank: bank(1) });
    const rt = r.handle.runtime;
    await r.foreign('PLAY 1-5 "programme-feed"');
    await heard(r, 1, 5);
    // Our logo on air on 1-99, as the owner had it.
    expect(await rt.loadFixed({ channel: 1, layer: 99 }, 'logo-1', 'logo', {})).toEqual({
      accepted: true,
    });
    expect((await rt.take('logo-1')).accepted).toBe(true);
    await waitFor(async () => (await r.lines()).includes('CG 1-99 PLAY 0'), 'the take');
    const before = (await r.lines()).length;

    expect((await rt.clearBankLayer(1, 50)).ok).toBe(true); // a row CLEAR on an EMPTY row
    expect((await rt.clearBankLayer(1, 5)).reason).toBe('not-in-bank');
    expect((await rt.clearLayer(1, 5)).reason).toBe('foreign');
    await rt.clearAll();
    await waitFor(async () => (await r.lines()).includes('CLEAR 1-99'), 'CLEAR ALL to land');
    const after = (await r.lines()).slice(before);

    // 🔴 THE PROPERTY: nothing addressed 1-5, and nothing addressed any layer below 50.
    const onOne = addressing(after, 1);
    expect(onOne.filter((l) => layerOf(l, 1) === 5)).toEqual([]);
    expect(onOne.filter((l) => (layerOf(l, 1) ?? 99) < 50)).toEqual([]);
    // CONTROL: the same capture shows our own band's commands.
    expect(after).toContain('CLEAR 1-50');
    expect(after).toContain('CLEAR 1-99');
  });
});

describe('d — what is already on air on a channel, before it is declared', () => {
  it('channel 1 carrying the Playout’s video reads OCCUPIED on layer 5 — control: channel 2 reads EMPTY', async () => {
    const r = await rig({ firstRun: true });
    await r.foreign('PLAY 1-5 "programme-feed"');
    await waitFor(
      async () => (await r.handle.runtime.channelOccupancy(1, 0)).state === 'occupied',
      'the tap to hear channel 1',
    );
    expect(await r.handle.runtime.channelOccupancy(1)).toEqual({
      state: 'occupied',
      layers: [{ layer: 5, producer: 'ffmpeg' }],
    });
    expect(await r.handle.runtime.channelOccupancy(2)).toEqual({ state: 'empty', layers: [] });
  });
});

describe('e — the channel may be replaced in-app while nothing of ours holds air on it', () => {
  it('an idle station changes channel — control: the declared channel is the new one', async () => {
    const r = await rig({ bank: bank(1) });
    expect(r.handle.runtime.declaredChannels()).toEqual([1]);
    expect(r.handle.runtime.setFixedLayers(bank(2))).toEqual({ ok: true });
    expect(r.handle.runtime.declaredChannels()).toEqual([2]);
  });

  it('refused while our logo is on air on the current channel, in one sentence — control: accepted once it is cleared', async () => {
    const r = await rig({ bank: bank(1) });
    const rt = r.handle.runtime;
    await rt.loadFixed({ channel: 1, layer: 99 }, 'logo-1', 'logo', {});
    await rt.take('logo-1');
    await waitFor(async () => (await r.lines()).includes('CG 1-99 PLAY 0'), 'the take');
    /*
      ⚠ AND THE BOOT VOLUME BLANKET (`R-022`). It re-asserts `VOLUME 1` on every declared row at
      `normal` priority, while the take is `urgent` — so the take landing says nothing about the
      blanket having finished, and a straggler (`MIXER 1-58 VOLUME 1`, a bed row) once landed
      inside the window below and read as the refused change sending something. Wait for every
      row's line, whatever order the queue sends them in; the assertion below is unchanged.
    */
    await waitFor(async () => {
      const lines = await r.lines();
      return fixedBankSlots(bank(1)).every((s) =>
        lines.includes(`MIXER 1-${String(s.layer)} VOLUME 1`),
      );
    }, 'the boot volume blanket');
    const before = (await r.lines()).length;
    expect(rt.setFixedLayers(bank(2))).toEqual({
      ok: false,
      reason: 'channel-change-refused',
      message: 'Something of ours is still on air on channel 1 — take it off air first.',
    });
    expect(rt.declaredChannels()).toEqual([1]);
    expect((await r.lines()).slice(before), 'a refused change sends nothing').toEqual([]);

    // CONTROL: CLEAR it, and the same change is accepted; the cleared row leaves the stack.
    expect((await rt.out('logo-1')).accepted).toBe(true);
    await waitFor(async () => (await r.lines()).includes('CLEAR 1-99'), 'the clear');
    expect(rt.setFixedLayers(bank(2))).toEqual({ ok: true });
    expect(rt.stackSnapshot().map((i) => i.itemId)).toEqual([]);
    expect(rt.strays()).toEqual([]);
  });
});

describe('j — an item of ours on a channel this station does not declare', () => {
  const retainedLogo = {
    itemId: 'logo-ch1',
    templateId: 'logo',
    fields: {},
    state: 'on-air' as const,
    slot: { channel: 1, layer: 99, server: 'primary' as const },
  };

  it('first-run: the console’s remembered channel-1 logo becomes a STRAY and is never seated', async () => {
    const r = await rig({ firstRun: true });
    const rt = r.handle.runtime;
    // Our earlier run's logo, still looping on the programme channel.
    await r.foreign('CG 1-99 ADD 0 "http://127.0.0.1:1/logo" 1');
    await heard(r, 1, 99);
    const before = (await r.lines()).length;

    const restored = await rt.restore([retainedLogo]);
    expect(restored.restored).toBe(0);
    expect(restored.skipped.map((s) => [s.itemId, s.reason])).toEqual([
      ['logo-ch1', 'not-declared'],
    ]);
    expect(rt.strays()).toEqual([
      { itemId: 'logo-ch1', templateId: 'logo', casparChannel: 1, layer: 99, observed: 'producer' },
    ]);
    // First-run declares channel 2; the stray stays a stray, never a row of this station.
    expect(rt.setFixedLayers(bank(2))).toEqual({ ok: true });
    await delay(SWEEP_MS * 4);
    expect(rt.strays().map((s) => [s.casparChannel, s.layer])).toEqual([[1, 99]]);
    expect(rt.stackSnapshot()).toEqual([]);
    // 🔴 Nothing at all was sent to channel 1.
    expect(addressing((await r.lines()).slice(before), 1)).toEqual([]);
  });

  it('take it off air: exactly CG 1-99 STOP 0 then CLEAR 1-99 — control: a coordinate that is not a stray is refused, nothing sent', async () => {
    const r = await rig({ firstRun: true });
    const rt = r.handle.runtime;
    await r.foreign('CG 1-99 ADD 0 "http://127.0.0.1:1/logo" 1');
    await r.foreign('PLAY 1-5 "programme-feed"');
    await heard(r, 1, 99);
    await rt.restore([retainedLogo]);
    expect(rt.setFixedLayers(bank(2))).toEqual({ ok: true });
    const before = (await r.lines()).length;

    // CONTROL first: the Playout's own layer is not a stray, and nothing is sent for it.
    expect((await rt.takeStrayOffAir(1, 5)).ok).toBe(false);
    expect(addressing((await r.lines()).slice(before), 1)).toEqual([]);

    expect(await rt.takeStrayOffAir(1, 99)).toEqual({ ok: true });
    expect(addressing((await r.lines()).slice(before), 1)).toEqual([
      'CG 1-99 STOP 0',
      'CLEAR 1-99',
    ]);
    expect(rt.strays()).toEqual([]);
  });

  it('a stale entry — nothing on 1-99 any more — is dropped, not shown, and nothing is sent', async () => {
    const r = await rig({ firstRun: true });
    const rt = r.handle.runtime;
    await r.foreign('PLAY 1-5 "programme-feed"'); // the tap hears the server; 1-99 is silent
    await heard(r, 1, 5);
    const before = (await r.lines()).length;
    await rt.restore([retainedLogo]);
    expect(rt.strays()).toEqual([]);
    await delay(SWEEP_MS * 4);
    expect(rt.strays()).toEqual([]);
    expect(addressing((await r.lines()).slice(before), 1)).toEqual([]);
  });

  it('a bank installed under a restored channel-1 item strands it — the run-E shape: never re-ADDed on channel 1', async () => {
    // A bank-less bridge (channel 1 by default), link down, the console's resync lands first…
    const r = await rig({ deadAtBoot: true });
    const rt = r.handle.runtime;
    expect((await rt.restore([retainedLogo])).restored).toBe(1);
    const before = (await r.lines()).length;
    // …then first-run writes the connection and, a moment later, channel 2. 1-99 is SILENT: the
    // shape in which the replay put `MIXER 1-99 VOLUME 0` and `CG 1-99 ADD` on channel 1.
    expect((await rt.setConfig(r.connection)).ok).toBe(true);
    expect(rt.setFixedLayers(bank(2))).toEqual({ ok: true });
    await rt.whenServerHealthy(HEALTH_MS);
    await delay(SWEEP_MS * 6);
    const writesToOne = addressing((await r.lines()).slice(before), 1).filter(
      (l) => !l.startsWith('INFO'),
    );
    expect(writesToOne).toEqual([]);
    expect(rt.stackSnapshot()).toEqual([]);
    // CONTROL: the same bridge does write to its declared channel.
    expect(addressing(await r.lines(), 2).length).toBeGreaterThan(0);
  });
});
