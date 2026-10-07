import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { BridgeHealthSchema } from '../src/health.js';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 13 (D9, D10) — `GET /health` on the control port: no authentication,
 * the fixed shape, under a second, no secret — on the SAME port the consoles' socket uses, which
 * keeps working beside it. Ephemeral ports throughout.
 */

let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.terminate();
  await bridge?.close();
  bridge = null;
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

function single(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

async function health(
  port: number,
): Promise<{ ms: number; status: number; cache: string | null; body: unknown }> {
  const t0 = performance.now();
  const res = await fetch(`http://127.0.0.1:${String(port)}/health`);
  const body: unknown = await res.json();
  return {
    ms: performance.now() - t0,
    status: res.status,
    cache: res.headers.get('cache-control'),
    body,
  };
}

it('🔴 /health: 200, the fixed shape, under a second, no secret — and the consoles’ socket on the same port', async () => {
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40 });
  const oscPort = await freeUdpPort();
  bridge = await createBridge({
    port: 0,
    connection: single(mock.amcpPort, oscPort),
    version: '0.10.0',
  });
  const b = bridge;
  await b.runtime.whenServerHealthy(HEALTH_MS);

  const first = await health(b.port);
  expect(first.status).toBe(200);
  expect(first.ms, 'rule 13: under a second').toBeLessThan(1000);
  expect(first.cache).toBe('no-store');
  const parsed = BridgeHealthSchema.safeParse(first.body);
  expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  expect(first.body).toMatchObject({
    app: 'cg-bridge',
    version: '0.10.0',
    playout: { address: null, session: 'off', lastReadAt: null },
    consoles: 0,
    ports: { control: b.port, osc: oscPort },
    problems: [],
  });
  const servers = (first.body as { casparcg: { servers: { host: string; amcp: string }[] } })
    .casparcg.servers;
  expect(servers).toEqual([expect.objectContaining({ host: '127.0.0.1', amcp: 'up' })]);

  // The consoles' socket, on the same port, beside it.
  const ws = new WebSocket(b.url);
  clients.push(ws);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  expect(((await health(b.port)).body as { consoles: number }).consoles).toBe(1);
});

it('every other plain request is answered 426, as the socket’s own server always answered', async () => {
  bridge = await createBridge({ port: 0, connection: single(1, 0) });
  const res = await fetch(`http://127.0.0.1:${String(bridge.port)}/`);
  expect(res.status).toBe(426);
  const post = await fetch(`http://127.0.0.1:${String(bridge.port)}/health`, { method: 'POST' });
  expect(post.status).toBe(426);
});

it('🔴 R-090 — a port CG Bridge cannot open is on /health, naming what holds it; control: the first test’s free port lists no problem', async () => {
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40 });
  // Somebody else holds the OSC port this bridge is told to use, on the address it binds.
  const holder = dgram.createSocket('udp4');
  await new Promise<void>((resolve, reject) => {
    holder.once('error', reject);
    holder.bind(0, '127.0.0.1', () => resolve());
  });
  const heldPort = holder.address().port;
  const asked: string[] = [];
  try {
    bridge = await createBridge({
      port: 0,
      connection: single(mock.amcpPort, heldPort),
      portHolderOf: (protocol, port) => {
        asked.push(`${protocol}:${String(port)}`);
        return Promise.resolve({ kind: 'other', name: 'casparcg.exe', pid: 4321 });
      },
    });
    const b = bridge;
    const message = `cannot open UDP ${String(heldPort)} (OSC from CasparCG): held by casparcg.exe (PID 4321).`;
    const deadline = Date.now() + HEALTH_MS;
    let problems: { code: string; message: string }[] = [];
    while (Date.now() < deadline) {
      const body = (await health(b.port)).body as { problems: { code: string; message: string }[] };
      problems = body.problems;
      if (problems.some((p) => p.code === 'port-refused' && p.message === message)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(problems).toContainEqual({ code: 'port-refused', message });
    // The holder was asked about the one port that failed, once — and CG Bridge still takes consoles.
    expect(asked).toEqual([`udp:${String(heldPort)}`]);
    const parsed = BridgeHealthSchema.safeParse((await health(b.port)).body);
    expect(parsed.success).toBe(true);
    const ws = new WebSocket(b.url);
    clients.push(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
  } finally {
    await new Promise<void>((resolve) => holder.close(() => resolve()));
  }
});

it('a core that is not there reads as down, and the bridge still answers', async () => {
  // Port 1 on loopback: nothing listens there.
  bridge = await createBridge({ port: 0, connection: single(1, 0) });
  const h = await health(bridge.port);
  expect(h.status).toBe(200);
  expect((h.body as { casparcg: { state: string } }).casparcg.state).toBe('down');
});
