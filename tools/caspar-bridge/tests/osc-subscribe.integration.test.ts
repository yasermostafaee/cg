import * as dgram from 'node:dgram';
import * as net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  ConnectionConfigSchema,
  RESERVED_OSC_PORT,
  RESERVED_OSC_PORT_REASON,
  type ConnectionConfig,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 7 (`C-046`) — **THE BRIDGE NEVER BINDS THE PLAYOUT ENGINE'S 6250; IT ASKS
 * THE CORE FOR OSC ON ITS OWN PORT, AFTER EVERY CONNECT, AND TAKES IN ONLY THE CHANNELS IT SERVES.**
 *
 * One real bridge and one `@cg/amcp-mock` modelling the core: its default per-client subscription
 * (`oscToAmcpClientsPort`) goes to a UDP socket this test holds first — the engine's `127.0.0.1:6250`
 * in miniature — and it has no predefined destination, so `OSC SUBSCRIBE` is the only road to the
 * bridge. Ephemeral ports throughout: nothing here binds 6250 or 6251 on the host running it.
 */

let mock: MockHandle | null = null;
let bridge: BridgeHandle | null = null;
const sockets: dgram.Socket[] = [];

afterEach(async () => {
  await bridge?.close();
  bridge = null;
  await mock?.stop();
  mock = null;
  for (const s of sockets.splice(0)) s.close();
});

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

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

/** The engine's socket, in miniature: held for the whole test, counting what reaches it. */
async function holdUdp(): Promise<{ port: number; heard: () => number }> {
  let count = 0;
  const sock = dgram.createSocket('udp4');
  sock.on('message', () => {
    count++;
  });
  await new Promise<void>((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      resolve();
    });
  });
  sockets.push(sock);
  return { port: sock.address().port, heard: () => count };
}

function single(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

const lines = (m: MockHandle): string[] => m.receivedCommands().map((c) => c.line);

/** Another AMCP client on the same core: one line, and the reply's first line. */
function otherClient(server: MockHandle, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: server.host, port: server.amcpPort }, () => {
      socket.write(`${line}\r\n`);
    });
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf('\r\n');
      if (end < 0) return;
      socket.end();
      resolve(buffer.slice(0, end));
    });
    socket.once('error', reject);
  });
}

it('🔴 rule 7 — the core’s default port is held by another process: the bridge binds its own, sends OSC SUBSCRIBE after VERSION and INFO, and hears the core — control: the holder still receives the core’s stream', async () => {
  const engine = await holdUdp();
  mock = await createMock({
    amcpPort: 0,
    oscPort: 0,
    oscHz: 40,
    oscToAmcpClientsPort: engine.port,
  });
  const oscPort = await freeUdpPort();
  bridge = await createBridge({ port: 0, connection: single(mock.amcpPort, oscPort) });
  const b = bridge;
  await b.runtime.whenServerHealthy(HEALTH_MS);
  await waitFor(() => b.runtime.health().primary.oscFreshAt !== undefined, 8000, 'OSC heard');

  const sent = lines(mock);
  const subscribe = sent.indexOf(`OSC SUBSCRIBE ${String(oscPort)}`);
  expect(subscribe).toBeGreaterThan(sent.indexOf('INFO'));
  expect(sent.indexOf('INFO')).toBeGreaterThan(sent.indexOf('VERSION'));
  expect(b.runtime.oscStatus().get('A')).toBe('subscribed');
  // CONTROL — the core's default subscription still reaches the holder of the default port.
  expect(engine.heard()).toBeGreaterThan(0);
  expect(mock.oscDestinations()).toEqual(
    expect.arrayContaining([
      { host: '127.0.0.1', port: engine.port },
      { host: '127.0.0.1', port: oscPort },
    ]),
  );
});

it('🔴 the subscribe is sent again after a reconnect, and OSC arrives again', async () => {
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40 });
  const oscPort = await freeUdpPort();
  bridge = await createBridge({ port: 0, connection: single(mock.amcpPort, oscPort) });
  const b = bridge;
  const m = mock;
  await b.runtime.whenServerHealthy(HEALTH_MS);
  await waitFor(() => b.runtime.health().primary.oscFreshAt !== undefined, 8000, 'OSC heard');

  m.closeAllAmcpConnections();
  await waitFor(
    () => lines(m).filter((l) => l === `OSC SUBSCRIBE ${String(oscPort)}`).length === 2,
    8000,
    'the second subscribe',
  );
  await b.runtime.whenServerHealthy(HEALTH_MS);
  const heardAt = b.runtime.health().primary.oscFreshAt;
  await delay(400);
  expect(b.runtime.health().primary.oscFreshAt).not.toBe(heardAt);
});

it('🔴 6250 is refused — by the schema, and by the bridge before anything binds', async () => {
  const withReserved = single(5250, RESERVED_OSC_PORT);
  const parsed = ConnectionConfigSchema.safeParse(withReserved);
  expect(parsed.success).toBe(false);
  expect(JSON.stringify(parsed.error?.issues)).toContain(RESERVED_OSC_PORT_REASON);
  await expect(
    createBridge({ port: 0, oscPort: RESERVED_OSC_PORT, connection: single(1, 0) }),
  ).rejects.toThrow(RESERVED_OSC_PORT_REASON);
  // CONTROL — the bridge's own port is accepted.
  expect(ConnectionConfigSchema.safeParse(single(5250, 6251)).success).toBe(true);
});

it('the bridge-wide OSC port stands over the connection in force: A binds it, B binds it plus one', async () => {
  mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const oscPort = await freeUdpPort();
  bridge = await createBridge({
    port: 0,
    connection: {
      ...single(mock.amcpPort, 1111),
      servers: {
        A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort: 1111 },
        B: { host: '127.0.0.1', amcpPort: 1, oscPort: 2222 },
      },
    },
    oscPort,
  });
  expect(bridge.runtime.config().servers.A.oscPort).toBe(oscPort);
  expect(bridge.runtime.config().servers.B?.oscPort).toBe(oscPort + 1);
});

it('🔴 a channel this station does not serve: its occupancy is read from the core with INFO, never from a tap that drops its OSC — control: a served channel answers from the tap', async () => {
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40, channels: 2 });
  const oscPort = await freeUdpPort();
  bridge = await createBridge({
    port: 0,
    connection: single(mock.amcpPort, oscPort),
    fixedLayers: { channel: 1, low: { start: 50, count: 9 }, start: 80, count: 20 },
  });
  const b = bridge;
  await b.runtime.whenServerHealthy(HEALTH_MS);
  await waitFor(() => b.runtime.health().primary.oscFreshAt !== undefined, 8000, 'OSC heard');
  expect(await otherClient(mock, 'PLAY 2-60 "clip"')).toMatch(/^202 /);
  expect(await otherClient(mock, 'PLAY 1-60 "clip"')).toMatch(/^202 /);

  const from = lines(mock).length;
  const undeclared = await b.runtime.channelOccupancy(2, 2000);
  expect(undeclared).toEqual({ state: 'occupied', layers: [{ layer: 60, producer: 'ffmpeg' }] });
  expect(lines(mock).slice(from)).toContain('INFO 2');

  // CONTROL — channel 1 is served: the tap answers, and it sees the same kind of producer.
  await delay(300);
  const served = await b.runtime.channelOccupancy(1, 2000);
  expect(served.state).toBe('occupied');
  expect(served.layers).toContainEqual({ layer: 60, producer: 'ffmpeg' });
});
