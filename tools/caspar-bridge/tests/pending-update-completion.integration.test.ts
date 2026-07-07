import * as dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';

/**
 * B-044 — pending-intent completion. The regression this pins: `updating` /
 * `exiting` must NEVER be resting states. Before the fix, the OK ack parked
 * `ackedStatus='updating'` forever (a CG UPDATE causes no producer transition
 * and the OSC change-tracker suppresses repeated identical values, so no fresh
 * truth ever rescued it); `out` likewise decayed to a permanent `exiting`.
 *
 * Both OSC regimes are pinned deliberately: the 40 Hz heartbeat regime proves
 * the change-tracker suppression cannot mask a regression, and the
 * `disableOsc` regime proves completion never depends on OSC at all.
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

async function bootOnAir(opts: { disableOsc: boolean; intentTimeoutMs?: number }): Promise<{
  status: () => string;
  pending: () => boolean;
}> {
  const oscPort = await freeUdpPort();
  mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    ...(opts.disableOsc ? { disableOsc: true } : { oscHz: 40 }),
  });
  runtime = new CasparRuntime(
    connectionFor(mock.amcpPort, oscPort, await freeUdpPort()),
    {},
    opts.intentTimeoutMs !== undefined ? { intentTimeoutMs: opts.intentTimeoutMs } : {},
  );
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(5000);

  const item = (): { status: string; pending: boolean } => {
    const s = runtime?.stackSnapshot().find((i) => i.itemId === 'item1');
    if (!s) throw new Error('item1 missing from the stack snapshot');
    return { status: s.status, pending: s.pending };
  };

  expect((await runtime.load('item1', 'lower-third', { headline: 'یک' })).accepted).toBe(true);
  expect((await runtime.take('item1')).accepted).toBe(true);
  // Settled on air: acked `playing` (rendered ON AIR), or `on-air` while OSC
  // truth is fresh.
  await waitFor(() => ['playing', 'on-air'].includes(item().status));

  return { status: () => item().status, pending: () => item().pending };
}

describe.each([
  { regime: 'OSC heartbeat at 40 Hz', disableOsc: false },
  { regime: 'OSC disabled', disableOsc: true },
])('B-044 completion — $regime', ({ disableOsc }) => {
  it(
    'update settles back to the on-air state on the ack and NEVER rests on updating',
    { timeout: 15000 },
    async () => {
      const item = await bootOnAir({ disableOsc });
      if (runtime === null) throw new Error('runtime not booted');

      expect((await runtime.update('item1', { headline: 'دو' }, 'merge')).accepted).toBe(true);
      // The ack settles it within the bound (well under INTENT_TIMEOUT_MS).
      await waitFor(() => item.status() !== 'updating', 3000);
      expect(['playing', 'on-air']).toContain(item.status());
      expect(item.pending()).toBe(false);
      // …and it RESTS there: after OSC truth (if any) decays past its 1s TTL,
      // the pre-fix code fell back to the parked acked 'updating'.
      await sleep(1500);
      expect(['playing', 'on-air']).toContain(item.status());
      expect(item.pending()).toBe(false);
    },
  );

  it(
    'out rests at idle on the CLEAR ack — never a permanent exiting',
    { timeout: 15000 },
    async () => {
      const item = await bootOnAir({ disableOsc });
      if (runtime === null) throw new Error('runtime not booted');

      expect((await runtime.out('item1')).accepted).toBe(true);
      await waitFor(() => item.status() === 'idle', 3000);
      // Pre-fix: fresh OSC truth `idle` decayed after 1s back to acked
      // 'exiting' forever. Pin the resting state.
      await sleep(1500);
      expect(item.status()).toBe('idle');
      expect(item.pending()).toBe(false);
    },
  );
});

describe('B-044 completion — failure path', () => {
  it(
    'an update with the server gone lands in a bounded explicit failure state, never stuck updating',
    { timeout: 20000 },
    async () => {
      const item = await bootOnAir({ disableOsc: true });
      if (runtime === null) throw new Error('runtime not booted');

      // Kill the mock mid-session: the next update's command can never ack.
      await mock?.stop();
      mock = null;

      void runtime.update('item1', { headline: 'سه' }, 'merge');
      // Bounded: either the send fails fast (→ 'error'/amcp-send-failed) or no
      // ack arrives and the 5s expiry lands 'unconfirmed'. Both are explicit,
      // honest states; the badge must never stick on 'updating'. (Boot-time OSC
      // truth may mask the landing for its ≤1s TTL — wait for the resting
      // failure state directly.)
      await waitFor(() => ['error', 'unconfirmed'].includes(item.status()), 8000);
      // …and it RESTS there (no decay back to a spinner state).
      await sleep(1200);
      expect(['error', 'unconfirmed']).toContain(item.status());
    },
  );

  it(
    'a swallowed CG UPDATE (accepted, never answered) expires to the explicit unconfirmed state within the bound',
    { timeout: 20000 },
    async () => {
      // The dead-server path above lands 'error' via the send failure — this is
      // the path that ONLY the expiry timer can bound: the socket stays up and
      // the command is accepted but no ack ever comes back. Inject a short
      // bound so the test exercises the real #armExpiry → expireIntent wiring.
      const item = await bootOnAir({ disableOsc: true, intentTimeoutMs: 400 });
      if (runtime === null || mock === null) throw new Error('not booted');

      // From now on the mock swallows every CG command: no response, ever.
      mock.setHandler('CG', () => new Promise<never>(() => undefined));

      void runtime.update('item1', { headline: 'چهار' }, 'merge');
      // The expiry (400ms) must land 'unconfirmed' BEFORE the command queue's
      // own 2s enqueue timeout can surface a NAK.
      await waitFor(() => item.status() === 'unconfirmed', 1500);
      expect(item.pending()).toBe(false);
      // A later queue-timeout NAK may flip it to the explicit 'error' — both
      // are bounded, honest resting states; it must never re-enter 'updating'.
      await sleep(2500);
      expect(['unconfirmed', 'error']).toContain(item.status());
    },
  );
});
