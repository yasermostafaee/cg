import { afterEach, expect, it } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import type { ConnectionConfig } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import type { BridgeLinkStatus } from '../src/shared/runtime-bridge.js';
import {
  BridgeDisconnectedError,
  WebSocketRuntime,
  type WebSocketLike,
} from '../src/platform/WebSocketRuntime.js';

const wsFactory = (url: string): WebSocketLike => new WsWebSocket(url) as unknown as WebSocketLike;

/**
 * These tests exercise the browser↔bridge **WebSocket transport + resilience**.
 * The bridge's CasparCG session points at an unreachable server with an
 * ephemeral OSC bind (no fixed ports, no hang) — real playout against a server
 * is proven in `@cg/caspar-bridge`'s integration test. The `WebSocketRuntime`
 * source is unchanged from Phase 1.
 */
function ephemeralConnection(): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
      B: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 15));
  }
}

let handle: BridgeHandle | null = null;
let runtime: WebSocketRuntime | null = null;

afterEach(async () => {
  runtime?.dispose();
  runtime = null;
  await handle?.close();
  handle = null;
});

/** Resolve once the link reaches `target` (or immediately if already there). */
function awaitStatus(
  rt: WebSocketRuntime,
  target: BridgeLinkStatus,
  timeoutMs = 5000,
): Promise<void> {
  if (rt.link.status() === target) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`link never reached ${target} (stuck at ${rt.link.status()})`));
    }, timeoutMs);
    const unsub = rt.link.onStatusChanged((s) => {
      if (s === target) {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });
  });
}

it('selects live, round-trips a read, and delivers a published delta over the WS', async () => {
  handle = await createBridge({ port: 0, connection: ephemeralConnection() });
  runtime = new WebSocketRuntime(handle.url, { createWebSocket: wsFactory });
  await runtime.whenReady();
  expect(runtime.link.status()).toBe('live');

  // Request/response round-trip over the WS (reads don't depend on a server).
  expect(Array.isArray(await runtime.stack.snapshot())).toBe(true);
  expect((await runtime.connections.health()).primary.label).toBe('A');

  // Publish delivery: a load makes the Reconciler delta cross the WS as a
  // `stack.state-changed` publish (no server here, so the item's status settles
  // to an error after the failed ack — what matters is the publish round-trip).
  const snapshots: (readonly StackItemState[])[] = [];
  runtime.stack.onStateChanged((s) => snapshots.push(s));
  void runtime.stack.load({ itemId: 'a', templateId: 'lower-third', fields: {} });
  await waitFor(() => snapshots.some((s) => s.some((i) => i.itemId === 'a')));
});

it('on a mid-session drop: goes DISCONNECTED, rejects commands, never falls back to mock', async () => {
  handle = await createBridge({ port: 0, connection: ephemeralConnection() });
  runtime = new WebSocketRuntime(handle.url, { createWebSocket: wsFactory });
  await runtime.whenReady();

  // Server stays up; terminate the client socket to simulate a mid-session drop.
  handle.dropConnections();
  await awaitStatus(runtime, 'disconnected');
  expect(runtime.link.status()).toBe('disconnected');

  // A command issued while disconnected is rejected — never optimistic on-air,
  // never routed to a mock.
  await expect(runtime.stack.take({ itemId: 'a' })).rejects.toBeInstanceOf(BridgeDisconnectedError);
});

it('on reconnect: re-pulls a full snapshot (stack/health/lock) to resync', async () => {
  handle = await createBridge({ port: 0, connection: ephemeralConnection() });
  runtime = new WebSocketRuntime(handle.url, { createWebSocket: wsFactory });
  await runtime.whenReady();

  let stackResyncs = 0;
  let healthResyncs = 0;
  let lockResyncs = 0;

  handle.dropConnections();
  await awaitStatus(runtime, 'disconnected');

  // Count emissions that arrive after the drop — the resync push.
  runtime.stack.onStateChanged(() => (stackResyncs += 1));
  runtime.connections.onHealthChanged(() => (healthResyncs += 1));
  runtime.lock.onStateChanged(() => (lockResyncs += 1));

  await awaitStatus(runtime, 'live');
  // Give the resync round-trip a beat to complete.
  await new Promise((r) => setTimeout(r, 200));

  expect(stackResyncs).toBeGreaterThan(0);
  expect(healthResyncs).toBeGreaterThan(0);
  expect(lockResyncs).toBeGreaterThan(0);
});
