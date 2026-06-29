import { afterEach, expect, it } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import type { StackItemState } from '@cg/shared-schema';
import type { BridgeLinkStatus } from '../src/shared/runtime-bridge.js';
import {
  BridgeDisconnectedError,
  WebSocketRuntime,
  type WebSocketLike,
} from '../src/platform/WebSocketRuntime.js';

const wsFactory = (url: string): WebSocketLike => new WsWebSocket(url) as unknown as WebSocketLike;

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

it('selects live and round-trips load/take/out reflected via published state', async () => {
  handle = await createBridge({ port: 0 });
  runtime = new WebSocketRuntime(handle.url, { createWebSocket: wsFactory });
  await runtime.whenReady();
  expect(runtime.link.status()).toBe('live');

  const snapshots: (readonly StackItemState[])[] = [];
  runtime.stack.onStateChanged((s) => snapshots.push(s));

  const load = await runtime.stack.load({ itemId: 'a', templateId: 'lower-third', fields: {} });
  expect(load.accepted).toBe(true);
  const take = await runtime.stack.take({ itemId: 'a' });
  expect(take.accepted).toBe(true);
  await runtime.stack.out({ itemId: 'a' });

  // The round-trip is proven by published state: 'a' goes loaded → on-air → idle.
  expect(snapshots.some((s) => s.some((i) => i.itemId === 'a' && i.status === 'loaded'))).toBe(
    true,
  );
  expect(snapshots.some((s) => s.some((i) => i.itemId === 'a' && i.status === 'on-air'))).toBe(
    true,
  );
  expect(snapshots.at(-1)?.some((i) => i.itemId === 'a' && i.status === 'idle')).toBe(true);
});

it('on a mid-session drop: goes DISCONNECTED, rejects commands, never falls back to mock', async () => {
  handle = await createBridge({ port: 0 });
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
  handle = await createBridge({ port: 0 });
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
