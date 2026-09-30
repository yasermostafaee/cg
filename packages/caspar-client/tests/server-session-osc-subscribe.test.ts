import * as dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { OscEvent } from '@cg/shared-schema';
import { OscTransport, ServerSession, type ServerSessionEvents } from '../src/index.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 7 (`C-046`) and `B-295` — **THE SESSION ASKS THE CORE FOR OSC ON ITS
 * OWN PORT, AND A PORT IT CANNOT BIND NEVER KEEPS AMCP DOWN.**
 *
 * On the Playout machine UDP `127.0.0.1:6250` belongs to the Playout's engine; the core's default
 * per-client subscription sends there. A bridge binds its own port and sends `OSC SUBSCRIBE <port>`
 * on its AMCP connection, after every connect and inside the handshake (the restart notice needs OSC
 * within the resync drain). The subscription dies with the connection, so it is re-sent after every
 * reconnect. Each test runs against `@cg/amcp-mock`, which models the command as the core has it.
 */

let mock: MockHandle | undefined;
let session: ServerSession | undefined;
const sockets: dgram.Socket[] = [];

afterEach(async () => {
  await session?.stop();
  session = undefined;
  await mock?.stop();
  mock = undefined;
  for (const s of sockets.splice(0)) s.close();
});

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function once<K extends keyof ServerSessionEvents>(
  s: ServerSession,
  event: K,
  ms = 3000,
): Promise<ServerSessionEvents[K]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${String(event)}`)), ms);
    s.once(event, ((...args: ServerSessionEvents[K]) => {
      clearTimeout(timer);
      resolve(args);
    }) as never);
  });
}

/** A UDP socket holding a loopback port — the engine's `6250`, in miniature. */
async function holdPort(): Promise<{ port: number; heard: () => number }> {
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

function newSession(port: number, extra: Partial<ConstructorParameters<typeof ServerSession>[0]>) {
  return new ServerSession({
    name: 'A',
    host: '127.0.0.1',
    port,
    oscPort: 0,
    oscBindHost: '127.0.0.1',
    resyncDurationMs: 100,
    watcherIntervalMs: 100,
    initialBackoffMs: 50,
    maxBackoffMs: 200,
    ...extra,
  });
}

const lines = (m: MockHandle): string[] => m.receivedCommands().map((c) => c.line);

describe('CENTRAL-BRIDGE-01 — OSC SUBSCRIBE on the session’s own port', () => {
  it('🔴 subscribes inside the handshake (VERSION, INFO, then OSC SUBSCRIBE <bound port>) and the stream arrives — control: a session that does not subscribe hears nothing', async () => {
    // No predefined client and no per-client default: the subscribe is the only way in.
    mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40 });
    session = newSession(mock.amcpPort, { oscSubscribe: true });
    const subscribed = once(session, 'oscSubscription');
    session.start();
    const [info] = await subscribed;
    expect(info.outcome).toBe('subscribed');
    expect(info.port).toBe(session.osc.port);
    await once(session, 'healthy');
    expect(lines(mock).slice(0, 3)).toEqual([
      'VERSION',
      'INFO',
      `OSC SUBSCRIBE ${String(session.osc.port)}`,
    ]);
    await delay(200);
    expect(session.osc.receivedCount).toBeGreaterThan(0);

    // CONTROL — the same core, a session that does not ask: nothing reaches it.
    const quiet = newSession(mock.amcpPort, { name: 'B' });
    quiet.start();
    await once(quiet, 'healthy');
    await delay(200);
    expect(quiet.osc.receivedCount).toBe(0);
    expect(lines(mock).filter((l) => l.startsWith('OSC'))).toHaveLength(1);
    await quiet.stop();
  });

  it('🔴 re-subscribes after every reconnect — the subscription died with the connection', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40 });
    session = newSession(mock.amcpPort, { oscSubscribe: true });
    session.start();
    await once(session, 'healthy');
    expect(mock.oscDestinations()).toHaveLength(1);

    mock.closeAllAmcpConnections();
    await once(session, 'healthy');
    const subscribes = lines(mock).filter(
      (l) => l === `OSC SUBSCRIBE ${String(session?.osc.port)}`,
    );
    expect(subscribes).toHaveLength(2);
    const before = session.osc.receivedCount;
    await delay(200);
    expect(session.osc.receivedCount).toBeGreaterThan(before);
  });

  it('a core without the command: the refusal is reported and the handshake stands', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    mock.setHandler('OSC', () => ({ kind: 'err', code: 400, verb: 'OSC' }));
    session = newSession(mock.amcpPort, { oscSubscribe: true });
    const reported = once(session, 'oscSubscription');
    session.start();
    const [info] = await reported;
    expect(info.outcome).toBe('refused');
    await once(session, 'healthy');
    expect(session.state).toBe('healthy');
  });

  it('🔴 rule 7 — the core’s default port is held by someone else: the session binds its own and still hears the core, and the holder’s stream is untouched', async () => {
    const engine = await holdPort();
    mock = await createMock({
      amcpPort: 0,
      oscPort: 0,
      oscHz: 40,
      oscToAmcpClientsPort: engine.port,
    });
    session = newSession(mock.amcpPort, { oscSubscribe: true });
    session.start();
    await once(session, 'healthy');
    await delay(200);
    expect(session.osc.port).not.toBe(engine.port);
    expect(session.osc.receivedCount).toBeGreaterThan(0);
    // The core's default subscription still reaches whoever owns the default port.
    expect(engine.heard()).toBeGreaterThan(0);
  });
});

describe('B-295 — a port the session cannot bind never keeps AMCP down', () => {
  it('🔴 the OSC port is taken: oscUnavailable is reported, AMCP is dialled anyway and the session comes up; no port to subscribe to is said', async () => {
    const taken = await holdPort();
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    session = newSession(mock.amcpPort, { oscPort: taken.port, oscSubscribe: true });
    const unavailable = once(session, 'oscUnavailable');
    const subscription = once(session, 'oscSubscription');
    session.start();
    const [lost] = await unavailable;
    expect(lost.port).toBe(taken.port);
    expect(lost.error.message).toMatch(/EADDRINUSE/);
    const [info] = await subscription;
    expect(info.outcome).toBe('unbound');
    await once(session, 'healthy');
    expect(mock.amcpClientCount).toBe(1);
    expect(lines(mock).some((l) => l.startsWith('OSC'))).toBe(false);
  });
});

describe('CENTRAL-BRIDGE-01 — only the channels this station serves', () => {
  it('🔴 OSC for a channel not served is dropped before any tap or consumer — control: the served channel arrives', async () => {
    const transport = new OscTransport();
    const port = await transport.listen('127.0.0.1', 0);
    transport.interest.add(1, 60);
    transport.interest.add(3, 60);
    transport.setServedChannels((channel) => channel === 1);
    const seen: OscEvent[] = [];
    transport.on('events', (events) => seen.push(...events));
    mock = await createMock({ amcpPort: 0, oscPort: port, oscHost: '127.0.0.1', disableOsc: true });
    mock.emitOsc('/channel/3/stage/layer/60/foreground/producer', ['ffmpeg']);
    mock.emitOsc('/channel/1/stage/layer/60/foreground/producer', ['ffmpeg']);
    await delay(150);
    expect(seen.map((e) => ('channel' in e ? e.channel : null))).toEqual([1]);
    const occupied = transport.occupancy.occupied(60_000);
    expect(occupied.some((o) => o.channel === 1)).toBe(true);
    expect(occupied.some((o) => o.channel === 3)).toBe(false);
    expect(transport.foreignChannelDroppedCount).toBe(1);
    await transport.close();
  });
});
