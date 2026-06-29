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

it('falls back to the MockRuntime (offline-mock) when no bridge answers', async () => {
  // Point at a port nobody is listening on → connection refused → fallback.
  globals.__CG_BRIDGE_URL__ = 'ws://127.0.0.1:5281';

  const bridge = await createRuntimeBridge();
  expect(bridge.link.status()).toBe('offline-mock');

  // The mock is fully interactive offline.
  const snapshot = await bridge.stack.snapshot();
  expect(Array.isArray(snapshot)).toBe(true);
});
