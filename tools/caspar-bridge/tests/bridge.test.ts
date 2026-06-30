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

it('retains the delivered template HTML keyed by id over the WS (B-038 Phase 2)', async () => {
  handle = await createBridge({ port: 0, connection: deadConnection() });
  const ws = await connect(handle.url);
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });

  const template = {
    templateId: 'tpl-ws',
    templateType: 'lower-third',
    fields: [{ id: 'anchor', label: 'Anchor name', required: true, type: 'text', default: '' }],
  };
  const htmlV1 = '<!doctype html><html><body>v1</body></html>';

  ws.send(
    serializeWsFrame({
      type: 'request',
      id: 'imp1',
      channel: 'templates.import',
      payload: { template, html: htmlV1 },
    }),
  );
  await waitFor(() => frames.some((f) => f.type === 'response' && f.id === 'imp1'));
  const resp = frames.find((f) => f.type === 'response' && f.id === 'imp1');
  expect(
    resp?.type === 'response' &&
      typeof resp.payload === 'object' &&
      resp.payload !== null &&
      'registered' in resp.payload &&
      resp.payload.registered === true,
  ).toBe(true);

  // The bridge HOLDS the HTML keyed by id (the Phase 3 serve seam).
  expect(handle.runtime.templateHtml('tpl-ws')).toBe(htmlV1);
  // …and the TemplateInfo is still surfaced.
  expect(handle.runtime.templateGet('tpl-ws')?.templateType).toBe('lower-third');

  // Re-import the SAME id with different HTML → the stored HTML is replaced.
  const htmlV2 = '<!doctype html><html><body>v2</body></html>';
  ws.send(
    serializeWsFrame({
      type: 'request',
      id: 'imp2',
      channel: 'templates.import',
      payload: { template, html: htmlV2 },
    }),
  );
  await waitFor(() => frames.some((f) => f.type === 'response' && f.id === 'imp2'));
  expect(handle.runtime.templateHtml('tpl-ws')).toBe(htmlV2);
  expect(handle.runtime.templateList()).toHaveLength(1);

  ws.close();
});

it('rejects a templates.import missing the html payload (B-038 Phase 2)', async () => {
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
      id: 'imp-bad',
      channel: 'templates.import',
      payload: {
        template: { templateId: 'tpl-nohtml', templateType: 'lower-third', fields: [] },
      },
    }),
  );
  await waitFor(() => frames.some((f) => f.type === 'response' && f.id === 'imp-bad'));
  const resp = frames.find((f) => f.type === 'response' && f.id === 'imp-bad');
  expect(resp?.type === 'response' && resp.error?.message).toContain('invalid request');
  expect(handle.runtime.templateHtml('tpl-nohtml')).toBeNull();
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
