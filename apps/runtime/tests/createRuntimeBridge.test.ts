import { afterEach, beforeEach, expect, it } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { createRuntimeBridge } from '../src/platform/createRuntimeBridge.js';

/** Unreachable CasparCG + ephemeral OSC bind — the probe only needs the WS up. */
function ephemeralConnection(): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
      B: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

// `createRuntimeBridge` probes with the global `WebSocket`; provide it (and an
// overridable bridge URL) for the Node test environment.
const globals = globalThis as {
  WebSocket?: unknown;
  __CG_BRIDGE_URL__?: string;
  CG_E2E?: boolean;
};
const hadWebSocket = 'WebSocket' in globalThis;

beforeEach(() => {
  globals.WebSocket = WsWebSocket;
});

let handle: BridgeHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  delete globals.__CG_BRIDGE_URL__;
  delete globals.CG_E2E;
  if (!hadWebSocket) delete globals.WebSocket;
});

it('selects the WebSocketRuntime (live) when the bridge is reachable', async () => {
  handle = await createBridge({ port: 0, connection: ephemeralConnection() });
  globals.__CG_BRIDGE_URL__ = handle.url;

  const bridge = await createRuntimeBridge();
  expect(bridge.link.status()).toBe('live');

  // It really talks to the bridge: snapshot returns an array (empty real stack).
  const snapshot = await bridge.stack.snapshot();
  expect(Array.isArray(snapshot)).toBe(true);
});

/**
 * R-006 — the safety property. This test previously asserted the OPPOSITE (an unreachable
 * bridge "falls back to the MockRuntime"), which is precisely the bug: the mock simulates a
 * SUCCESSFUL playout, so the operator pressed PLAY, the row went solid-red ON AIR beside a
 * green "PRIMARY A HEALTHY", and no graphic existed. An unreachable bridge must NEVER
 * silently become a simulation.
 */
it('does NOT fall back to the mock when no bridge answers — it stays live and DISCONNECTED', async () => {
  // Point at a port nobody is listening on → connection refused.
  globals.__CG_BRIDGE_URL__ = 'ws://127.0.0.1:5281';

  const bridge = await createRuntimeBridge();

  // The live backend, honestly reporting that it cannot reach anything.
  expect(bridge.link.status()).toBe('disconnected');
  expect(bridge.link.status()).not.toBe('offline-mock');

  // And it REFUSES commands rather than simulating them — no optimistic on-air is possible.
  await expect(bridge.stack.take({ itemId: 'item-1' })).rejects.toThrow(/not sent to casparcg/i);
});

it('enters the mock ONLY on an explicit test-mode request', async () => {
  // Same unreachable URL as above — the URL is not what decides this. The explicit flag is.
  globals.__CG_BRIDGE_URL__ = 'ws://127.0.0.1:5281';
  globals.CG_E2E = true;

  const bridge = await createRuntimeBridge();
  expect(bridge.link.status()).toBe('offline-mock');

  // Still fully interactive — that is the mock's value, and why it survives as a test tool.
  const snapshot = await bridge.stack.snapshot();
  expect(Array.isArray(snapshot)).toBe(true);
});
