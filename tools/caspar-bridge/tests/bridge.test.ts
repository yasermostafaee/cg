import { afterEach, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { parseWsFrame, serializeWsFrame, type WsFrame } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';

let handle: BridgeHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
});

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
  handle = await createBridge({ port: 0 });
  expect(handle.host).toBe('127.0.0.1');
  expect(handle.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
});

it('round-trips a request and emits a publish on mutation', async () => {
  handle = await createBridge({ port: 0 });
  const ws = await connect(handle.url);
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });

  // Request/response: stack.snapshot returns the seeded stack.
  ws.send(
    serializeWsFrame({ type: 'request', id: '1', channel: 'stack.snapshot', payload: undefined }),
  );
  await waitFor(() => frames.some((f) => f.type === 'response' && f.id === '1'));
  const snapshot = frames.find((f) => f.type === 'response' && f.id === '1');
  expect(snapshot?.type === 'response' && Array.isArray(snapshot.payload)).toBe(true);

  // Mutation publishes stack.state-changed with the loaded item.
  ws.send(
    serializeWsFrame({
      type: 'request',
      id: '2',
      channel: 'stack.load',
      payload: { itemId: 'roundtrip-1', templateId: 'lower-third', fields: {} },
    }),
  );
  await waitFor(() =>
    frames.some(
      (f) =>
        f.type === 'publish' &&
        f.channel === 'stack.state-changed' &&
        Array.isArray(f.payload) &&
        (f.payload as { itemId: string }[]).some((i) => i.itemId === 'roundtrip-1'),
    ),
  );
  ws.close();
});

it('rejects an unknown channel with an error response', async () => {
  handle = await createBridge({ port: 0 });
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
  handle = await createBridge({ port: 0 });
  const ws = await connect(handle.url);
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });
  // stack.load requires itemId/templateId/fields — send a bad shape.
  ws.send(
    serializeWsFrame({ type: 'request', id: '10', channel: 'stack.load', payload: { itemId: 1 } }),
  );
  await waitFor(() => frames.some((f) => f.type === 'response' && f.id === '10'));
  const resp = frames.find((f) => f.type === 'response' && f.id === '10');
  expect(resp?.type === 'response' && resp.error?.message).toContain('invalid request');
  ws.close();
});
