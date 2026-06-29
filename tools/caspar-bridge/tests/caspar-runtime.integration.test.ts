import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig } from '@cg/shared-ipc';

/**
 * C-001 Phase 2 — the real `@cg/caspar-client` stack inside the bridge, driven
 * against `tools/amcp-mock` (NOT real hardware). Proves the two C-001 acceptance
 * criteria for this phase:
 *   (a) take / update / out reach the server as AMCP and are acked, and
 *   (b) when the server emits OSC, stack state updates from those REAL
 *       confirmations — not from any internal state machine.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
});

/** Grab a free UDP port so the mock's OSC destination == the session's OSC bind. */
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

function connectionFor(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort, oscPort },
      B: { host: '127.0.0.1', amcpPort, oscPort: oscPort + 1 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

it('drives load/take/update/out as AMCP (acked) and confirms state from real OSC', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });

  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort));
  runtime.start();
  await runtime.whenServerHealthy(5000);

  // lower-third allocates the first slot in its policy range (channel 1, layer 10).
  const slot = { channel: 1, layer: 10 };

  // ── load → CG ADD reaches the server (acked) and sets the producer ──
  const loaded = await runtime.load('item1', 'lower-third', {});
  expect(loaded.accepted).toBe(true);
  expect(mock.layerState(slot)?.producer).toBe('html');

  // ── take → CG PLAY reaches the server (acked) ──
  const taken = await runtime.take('item1');
  expect(taken.accepted).toBe(true);

  // (b) OSC drives state: 'on-air' can ONLY come from OSC truth (the Reconciler
  // never promotes 'playing' → 'on-air' on an ack), so seeing it proves the
  // real foreground/producer='html' confirmation flowed through.
  await waitFor(() =>
    runtime!.stackSnapshot().some((i) => i.itemId === 'item1' && i.status === 'on-air'),
  );

  // ── update → CG UPDATE reaches the server (acked); merged field is held ──
  const updated = await runtime.update('item1', { title: 'Hello' }, 'merge');
  expect(updated.accepted).toBe(true);
  expect(runtime.stackSnapshot().find((i) => i.itemId === 'item1')?.fields.title).toBe('Hello');

  // ── out → CLEAR reaches the server (acked) and empties the producer ──
  const outed = await runtime.out('item1');
  expect(outed.accepted).toBe(true);
  expect(mock.layerState(slot)?.producer).toBe('empty');

  // OSC confirms idle (producer flipped to 'empty' on the wire).
  await waitFor(() =>
    runtime!.stackSnapshot().some((i) => i.itemId === 'item1' && i.status === 'idle'),
  );
});

it('reports health from the real session state', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 20 });
  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort));
  runtime.start();
  await runtime.whenServerHealthy(5000);

  expect(runtime.health().primary.state).toBe('healthy');
  expect(runtime.health().primary.amcpAxisOk).toBe(true);
});
