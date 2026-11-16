import * as dgram from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createMock, defaultHandlers, type MockHandle } from '@cg/amcp-mock';
import { DEFAULT_LAYER_POLICY } from '@cg/caspar-client';
import {
  TAKE_ON_AIR_CODE,
  parseWsFrame,
  serializeWsFrame,
  type ConnectionConfig,
  type FixedLayerBank,
  type TemplateInfo,
  type WsFrame,
} from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { validateFixedBank } from '../src/fixed-layers-store.js';
import { awaitChannelModeRead, HEALTH_MS, track } from './support/harness.js';
import { standardBank, twoChannelRig, writes } from './support/two-channel-rig.js';

/**
 * 🔴 `FIELD-FIXES-01-A` DECISION 2 — **A TAKE OF A ROW ALREADY ON AIR IS REFUSED BY THE BRIDGE, WITH
 * NOTHING SENT — AND SO IS A TAKE WHILE THE ROW'S PREVIOUS TAKE HAS NOT RESOLVED.**
 *
 * The console has always greyed PLAY on an on-air row. That was a courtesy: a second console (the
 * owner runs `dev:station` beside the installed app) or a take whose reply was slow reached the
 * bridge with the page on air, and the re-take re-`PLAY`ed plates that were working. The bridge is
 * now the one authority, for every console.
 *
 * The slow reply is the other half. The 5 s is `INTENT_TIMEOUT_MS`, armed before the take's
 * `CG PLAY`; its expiry retracted the take's play evidence, so the row read `loaded` while its
 * graphic was on air and PLAY came back. It now stays `unconfirmed` until the take's own reply
 * resolves it. The bound is injected small here (`intentTimeoutMs`) — the path is the same.
 */

// ──────────────────────────── two consoles, through the real bridge ────────────────────────────

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = track(new WebSocket(url), (w) => {
      w.close();
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

interface Console {
  ask(channel: string, payload: unknown): Promise<{ payload?: unknown; error?: string }>;
}

async function openConsole(url: string, name: string): Promise<Console> {
  const ws = await connect(url);
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });
  let n = 0;
  return {
    async ask(channel, payload) {
      n += 1;
      const id = `${name}-${String(n)}`;
      ws.send(serializeWsFrame({ type: 'request', id, channel, payload }));
      const deadline = Date.now() + 8000;
      while (!frames.some((f) => f.type === 'response' && f.id === id)) {
        if (Date.now() > deadline) throw new Error(`no response to ${channel} on ${name}`);
        await new Promise((r) => setTimeout(r, 10));
      }
      const resp = frames.find((f) => f.type === 'response' && f.id === id);
      if (resp?.type !== 'response') throw new Error('no response');
      return { payload: resp.payload, ...(resp.error ? { error: resp.error.message } : {}) };
    },
  };
}

describe('Decision 2 — the bridge refuses a take of a row already on air, for every console', () => {
  it('🔴 a SECOND console gets the same refusal as the first, and nothing reaches CasparCG', async () => {
    const rig = await twoChannelRig({ banks: [standardBank(1)] });
    expect(
      await rig.handle.runtime.loadFixed({ channel: 1, layer: 99 }, 'logo-1', 'logo', {}),
    ).toEqual({ accepted: true });
    const installed = await openConsole(rig.handle.url, 'installed');
    const devStation = await openConsole(rig.handle.url, 'dev-station');

    expect((await installed.ask('stack.take', { itemId: 'logo-1' })).payload).toMatchObject({
      accepted: true,
    });
    const before = (await rig.lines()).length;

    for (const console of [devStation, installed]) {
      const res = await console.ask('stack.take', { itemId: 'logo-1' });
      expect(res.error).toBeUndefined();
      expect(res.payload).toMatchObject({ accepted: false, errorCode: TAKE_ON_AIR_CODE });
    }
    // Nothing was written to CasparCG (the bridge's own INFO reads are not writes).
    expect(writes((await rig.lines()).slice(before))).toEqual([]);
    expect(rig.mock.layerState({ channel: 1, layer: 99 })?.onAir).toBe(true);

    // CONTROL — once the row is taken out, the same console's take is accepted and reaches air.
    expect((await installed.ask('stack.out', { itemId: 'logo-1' })).payload).toMatchObject({
      accepted: true,
    });
    const control = (await rig.lines()).length;
    expect((await devStation.ask('stack.take', { itemId: 'logo-1' })).payload).toMatchObject({
      accepted: true,
    });
    expect((await rig.lines()).slice(control).some((l) => l.startsWith('CG 1-99 PLAY'))).toBe(true);
  }, 30_000);
});

// ──────────────────────────── the slow reply, on the runtime ────────────────────────────

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
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

const BANK: FixedLayerBank = { channel: 1, start: 80, count: 20, low: { start: 50, count: 10 } };
const LOGO: TemplateInfo = { templateId: 'logo', templateType: 'logo', fields: [] };
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const BOUND_MS = 300;
const PLAY = 'CG 1-99 PLAY 0';

async function bootSlow(replyMayArrive: Promise<void>): Promise<{
  r: CasparRuntime;
  core: MockHandle;
}> {
  const oscPort = await freeUdpPort();
  const core = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  mock = core;
  const cg = defaultHandlers().get('CG');
  if (cg === undefined) throw new Error('no default CG');
  // Run PLAY on the core and hold its reply until the test has checked the overdue take.
  core.setHandler('CG', async (req, ctx) => {
    const response = await cg(req, ctx);
    if (req.raw === PLAY) await replyMayArrive;
    return response;
  });
  const config: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: core.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
  const r = new CasparRuntime(
    config,
    {},
    {
      fixedSlots: validateFixedBank(BANK, { policy: DEFAULT_LAYER_POLICY, reservedLayers: [] }),
      fixedBanks: [BANK],
      layerPolicy: DEFAULT_LAYER_POLICY,
      reservedLayers: [],
      intentTimeoutMs: BOUND_MS,
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(LOGO, '<!doctype html><html><body>logo</body></html>');
  await r.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(r);
  await delay(250);
  return { r, core };
}

const statusOf = (r: CasparRuntime): string | undefined =>
  r.stackSnapshot(1).find((i) => i.itemId === 'logo-1')?.status;

/**
 * On air AS THE ROW SHOWS IT: `on-air` (OSC-confirmed) or a settled `playing` (acknowledged, not
 * pending) — the two statuses the row's own mark reads ON AIR (`badgeTone`). OSC reaches the
 * Reconciler on a producer TRANSITION, so a take whose reply comes more than a second after its
 * `CG ADD` rests at the acknowledged `playing` with nothing newer to promote it.
 */
const readsOnAir = (r: CasparRuntime): boolean => {
  const item = r.stackSnapshot(1).find((i) => i.itemId === 'logo-1');
  return (
    item !== undefined && !item.pending && (item.status === 'on-air' || item.status === 'playing')
  );
};

describe('Decision 2 — a slow reply leaves the take unresolved, never "loaded"', () => {
  it('🔴 past the bound the row reads UNCONFIRMED and a take is refused with nothing sent; when the reply arrives the row reads ON AIR', async () => {
    let releaseReply = (): void => undefined;
    const replyMayArrive = new Promise<void>((resolve) => {
      releaseReply = resolve;
    });
    const { r, core } = await bootSlow(replyMayArrive);
    expect(await r.loadFixed({ channel: 1, layer: 99 }, 'logo-1', 'logo', {})).toEqual({
      accepted: true,
    });

    const first = r.take('logo-1');
    try {
      await vi.waitFor(
        () => {
          expect(core.layerState({ channel: 1, layer: 99 })?.onAir).toBe(true);
          expect(statusOf(r)).toBe('unconfirmed');
        },
        { interval: 10, timeout: 1500 },
      );

      const from = core.receivedCommands().length;
      expect(await r.take('logo-1')).toMatchObject({
        accepted: false,
        errorCode: TAKE_ON_AIR_CODE,
      });

      releaseReply();
      expect(await first).toEqual({ accepted: true });
      expect(core.receivedCommands().slice(from)).toEqual([]);
      expect(statusOf(r)).not.toBe('unconfirmed');
      expect(readsOnAir(r)).toBe(true);
    } finally {
      releaseReply();
    }
  }, 30_000);
});
