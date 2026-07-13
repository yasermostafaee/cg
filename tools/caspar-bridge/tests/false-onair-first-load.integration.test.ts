import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-053 — the false ON AIR badge on the FIRST Load per (channel, layer) per
 * bridge process. The regression this pins: `CG ADD` (play-on-load OFF)
 * stage-plays a HIDDEN page, so the resulting `producer='html'` OSC report is
 * NOT play evidence — a never-taken item must rest `loaded` (READY), never
 * `on-air`, and must not revert-and-stick when the 1 s truth TTL decays.
 *
 * The mock runs `disableOsc` (transition-only) DELIBERATELY: it reproduces the
 * real first-observation-emits / later-suppressed change-tracker asymmetry.
 * Tick mode re-broadcasts erased layers as 'empty' (which real CasparCG never
 * does — a cleared layer goes silent), re-priming the tracker and masking the
 * asymmetry this bug depends on.
 */

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

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 15));
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function connectionFor(amcpPort: number, oscPort: number, oscPortB: number): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort, oscPort },
      B: { host: '127.0.0.1', amcpPort, oscPort: oscPortB },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

it(
  'a first Load per layer rests READY (loaded), never ON AIR — across fresh, reused, and second-fresh layers',
  { timeout: 20000 },
  async () => {
    const oscPort = await freeUdpPort();
    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', disableOsc: true });
    runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
    runtime.start();
    await runtime.startServing();
    runtime.templateImport(TEMPLATE, HTML);
    await runtime.whenServerHealthy(HEALTH_MS);

    // Every published status per itemId — the sticky badge is exactly "the
    // last published word", so the SEQUENCE is what the regression pins.
    const published = new Map<string, string[]>();
    runtime.stackChanged.subscribe((snapshot) => {
      for (const item of snapshot) {
        const list = published.get(item.itemId) ?? [];
        list.push(item.status);
        published.set(item.itemId, list);
      }
    });
    const item = (id: string): { status: string; pending: boolean } => {
      const s = runtime?.stackSnapshot().find((i) => i.itemId === id);
      if (!s) throw new Error(`${id} missing from the stack snapshot`);
      return { status: s.status, pending: s.pending };
    };

    // ── 1. First Load onto a FRESH layer (10): the ADD's 'html' report is the
    // tracker's first observation on that layer and DOES reach the Reconciler.
    // Pre-fix it published a sticky 'on-air'; it must read 'loaded'. ──
    expect((await runtime.load('item1', 'lower-third', { title: 'یک' })).accepted).toBe(true);
    await waitFor(() => mock?.layerState({ channel: 1, layer: 10 })?.producer === 'html');
    await sleep(300); // UDP delivery + the 20 ms coalesce flush
    expect(published.get('item1')).not.toContain('on-air');
    expect(item('item1')).toMatchObject({ status: 'loaded', pending: false });

    // …and it does not revert-and-stick after the 1 s truth TTL decays.
    await sleep(1200);
    expect(item('item1')).toMatchObject({ status: 'loaded', pending: false });

    // ── 2. Remove, then Load again (layer 10 REUSED): the tracker still holds
    // 'html' (remove() drops interest before its CLEAR), so this ADD's report
    // is suppressed — the resting state comes from the ack. ──
    expect((await runtime.remove('item1')).accepted).toBe(true);
    expect((await runtime.load('item2', 'lower-third', { title: 'دو' })).accepted).toBe(true);
    await sleep(300);
    expect(published.get('item2')).not.toContain('on-air');
    expect(item('item2')).toMatchObject({ status: 'loaded', pending: false });

    // ── 3. An additional Load while item2 holds layer 10 → a SECOND fresh
    // layer (11): first observation again — the B-053 "every newly imported
    // template" field case. ──
    expect((await runtime.load('item3', 'lower-third', { title: 'سه' })).accepted).toBe(true);
    await waitFor(() => mock?.layerState({ channel: 1, layer: 11 })?.producer === 'html');
    await sleep(300);
    expect(published.get('item3')).not.toContain('on-air');
    expect(item('item3')).toMatchObject({ status: 'loaded', pending: false });

    // ── 4. Take renders ON AIR (acked 'playing', or 'on-air' while truth is
    // fresh) — the fix must not dull the real take. ──
    expect((await runtime.take('item2')).accepted).toBe(true);
    await waitFor(() => ['playing', 'on-air'].includes(item('item2').status));
    expect(item('item2').pending).toBe(false);

    // ── 5. Out rests idle (B-044 ack settle) — unchanged. ──
    expect((await runtime.out('item2')).accepted).toBe(true);
    await waitFor(() => item('item2').status === 'idle');

    // The never-taken items never showed ON AIR at ANY point.
    expect(published.get('item1')).not.toContain('on-air');
    expect(published.get('item3')).not.toContain('on-air');
  },
);
