import { afterEach, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  parseWsFrame,
  serializeWsFrame,
  type ConnectionConfig,
  type WsFrame,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';

/**
 * Server-independent WebSocket framing tests. They exercise the `@cg/shared-ipc`
 * envelope + routing against the real `CasparRuntime` backing without a CasparCG
 * server (a dead connection: ephemeral OSC bind, unreachable AMCP). The
 * server-driven playout round-trip lives in `caspar-runtime.integration.test.ts`.
 */

let handle: BridgeHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
});

/** Unreachable AMCP + ephemeral OSC bind — no fixed ports, no hanging on a server. */
function deadConnection(): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
      B: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

it('binds loopback (127.0.0.1) by default, enforced at the socket bind', async () => {
  handle = await createBridge({ port: 0, connection: deadConnection() });
  expect(handle.host).toBe('127.0.0.1');
  expect(handle.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
});

it('round-trips a request/response over the WS (connections.config)', async () => {
  handle = await createBridge({ port: 0, connection: deadConnection() });
  const ws = await connect(handle.url);
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });

  ws.send(
    serializeWsFrame({
      type: 'request',
      id: '1',
      channel: 'connections.config',
      payload: undefined,
    }),
  );
  await waitFor(() => frames.some((f) => f.type === 'response' && f.id === '1'));
  const resp = frames.find((f) => f.type === 'response' && f.id === '1');
  expect(
    resp?.type === 'response' &&
      typeof resp.payload === 'object' &&
      resp.payload !== null &&
      'servers' in resp.payload,
  ).toBe(true);
  ws.close();
});

it('rejects an unknown channel with an error response', async () => {
  handle = await createBridge({ port: 0, connection: deadConnection() });
  const ws = await connect(handle.url);
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });
  ws.send(serializeWsFrame({ type: 'request', id: '9', channel: 'does.not.exist', payload: null }));
  await waitFor(() => frames.some((f) => f.type === 'response' && f.id === '9'));
  const resp = frames.find((f) => f.type === 'response' && f.id === '9');
  expect(resp?.type === 'response' && resp.error?.message).toContain('unknown channel');
  ws.close();
});

it('rejects a request whose payload fails the channel schema', async () => {
  handle = await createBridge({ port: 0, connection: deadConnection() });
  const ws = await connect(handle.url);
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });
  ws.send(
    serializeWsFrame({ type: 'request', id: '10', channel: 'stack.load', payload: { itemId: 1 } }),
  );
  await waitFor(() => frames.some((f) => f.type === 'response' && f.id === '10'));
  const resp = frames.find((f) => f.type === 'response' && f.id === '10');
  expect(resp?.type === 'response' && resp.error?.message).toContain('invalid request');
  ws.close();
});
