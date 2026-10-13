import * as dgram from 'node:dgram';
import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock } from '../src/mock.js';
import type { MockHandle } from '../src/types.js';
import { parsePacket, flatten } from '../../spikes/osc-capture/osc.mjs';

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 7 and rule 3 — **`OSC SUBSCRIBE`, AND A CORE RESTART, AS A 2.5.0 CORE
 * HAS THEM.** UDP `127.0.0.1:6250` belongs to the Playout's engine; a bridge on that machine binds
 * its own port and asks the core for OSC with `OSC SUBSCRIBE <port>` on its own AMCP connection. The
 * subscription is bound to that connection, so it dies with it — which is why the bridge re-sends it
 * after every reconnect, and why a restarted core (every connection dropped, every layer gone) sends
 * the bridge nothing until it has.
 */

let mock: MockHandle | undefined;
const cleanups: (() => void)[] = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) clean();
  await mock?.stop();
  mock = undefined;
});

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A UDP listener on an ephemeral loopback port, recording every OSC address it hears. */
async function listen(): Promise<{ port: number; heard: string[] }> {
  const heard: string[] = [];
  const sock = dgram.createSocket('udp4');
  sock.on('message', (buf) => {
    const parsed = parsePacket(buf);
    if (!parsed) return;
    for (const m of flatten(parsed)) heard.push(m.address);
  });
  await new Promise<void>((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      resolve();
    });
  });
  cleanups.push(() => {
    sock.close();
  });
  return { port: sock.address().port, heard };
}

/** An AMCP client that STAYS connected, so what is bound to its connection lives. */
async function client(port: number): Promise<{
  send: (line: string) => Promise<string>;
  close: () => Promise<void>;
}> {
  const sock = net.createConnection({ port, host: '127.0.0.1' });
  sock.setEncoding('utf-8');
  let buf = '';
  let waiting: ((line: string) => void) | null = null;
  sock.on('data', (chunk: string) => {
    buf += chunk;
    const end = buf.indexOf('\r\n');
    if (end >= 0 && waiting !== null) {
      const line = buf.slice(0, end);
      buf = buf.slice(end + 2);
      const wake = waiting;
      waiting = null;
      wake(line);
    }
  });
  await new Promise<void>((resolve, reject) => {
    sock.once('connect', resolve);
    sock.once('error', reject);
  });
  cleanups.push(() => {
    sock.destroy();
  });
  return {
    send: (line) =>
      new Promise((resolve) => {
        waiting = resolve;
        sock.write(`${line}\r\n`);
      }),
    close: () =>
      new Promise((resolve) => {
        sock.once('close', () => {
          resolve();
        });
        sock.end();
      }),
  };
}

const FRAMERATE = '/channel/1/framerate';

describe('CENTRAL-BRIDGE-01 — OSC SUBSCRIBE', () => {
  it('🔴 OSC SUBSCRIBE <port> answers 202 OSC SUBSCRIBE OK and the stream arrives there — control: nothing arrived before it', async () => {
    const own = await listen();
    // No predefined client and no per-client default: the only way OSC reaches `own` is the subscribe.
    mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40 });
    const amcp = await client(mock.amcpPort);
    await delay(150);
    expect(own.heard).toEqual([]);

    expect(await amcp.send(`OSC SUBSCRIBE ${String(own.port)}`)).toBe('202 OSC SUBSCRIBE OK');
    await delay(150);
    expect(own.heard).toContain(FRAMERATE);
    expect(mock.oscDestinations()).toEqual([{ host: '127.0.0.1', port: own.port }]);
  });

  it('🔴 the subscription dies with its connection — control: while the connection is open the stream keeps arriving', async () => {
    const own = await listen();
    mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40 });
    const amcp = await client(mock.amcpPort);
    await amcp.send(`OSC SUBSCRIBE ${String(own.port)}`);
    await delay(150);
    const whileOpen = own.heard.length;
    expect(whileOpen).toBeGreaterThan(0);

    await amcp.close();
    await delay(60); // a packet already in flight lands first
    const from = own.heard.length;
    await delay(200);
    expect(own.heard.slice(from)).toEqual([]);
    expect(mock.oscDestinations()).toEqual([]);
  });

  it('OSC UNSUBSCRIBE <port> stops it on a connection that stays open; a second SUBSCRIBE of the same port is one subscription', async () => {
    const own = await listen();
    mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40 });
    const amcp = await client(mock.amcpPort);
    await amcp.send(`OSC SUBSCRIBE ${String(own.port)}`);
    await amcp.send(`OSC SUBSCRIBE ${String(own.port)}`);
    expect(mock.oscDestinations()).toHaveLength(1);

    expect(await amcp.send(`OSC UNSUBSCRIBE ${String(own.port)}`)).toBe('202 OSC UNSUBSCRIBE OK');
    expect(mock.oscDestinations()).toEqual([]);
    await delay(60);
    const from = own.heard.length;
    await delay(200);
    expect(own.heard.slice(from)).toEqual([]);
  });

  it('a malformed OSC command is refused and subscribes nothing', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const amcp = await client(mock.amcpPort);
    expect(await amcp.send('OSC SUBSCRIBE')).toMatch(/^402 /);
    expect(await amcp.send('OSC SUBSCRIBE not-a-port')).toMatch(/^403 /);
    expect(await amcp.send('OSC LISTEN 6251')).toMatch(/^400 /);
    expect(mock.oscDestinations()).toEqual([]);
  });

  it('🔴 the core’s default per-client subscription: every connection is sent the stream at its own address and the default port, for its lifetime', async () => {
    const engine = await listen(); // stands in for whoever owns the default port
    mock = await createMock({
      amcpPort: 0,
      oscPort: 0,
      oscHz: 40,
      oscToAmcpClientsPort: engine.port,
    });
    const amcp = await client(mock.amcpPort);
    await delay(150);
    expect(engine.heard).toContain(FRAMERATE);
    await amcp.close();
    await delay(60);
    const from = engine.heard.length;
    await delay(200);
    expect(engine.heard.slice(from)).toEqual([]);
  });
});

describe('CENTRAL-BRIDGE-01 rule 3 — a core restart', () => {
  it('🔴 clears EVERY layer (50–99 included), drops every connection and its subscription, refuses AMCP while down, then listens on the same port', async () => {
    const own = await listen();
    mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 40, channels: 2 });
    const port = mock.amcpPort;
    const amcp = await client(port);
    await amcp.send(`OSC SUBSCRIBE ${String(own.port)}`);
    await amcp.send('PLAY 2-55 "clip"');
    await amcp.send('PLAY 2-99 "clip"');
    await amcp.send('PLAY 1-10 "their-item"');
    expect(mock.layerState({ channel: 2, layer: 99 })?.onStage).toBe(true);

    const restarting = mock.restartCore({ downMs: 300 });
    await delay(100);
    // Down: a connection is refused, as a core that is not up refuses one.
    await expect(
      new Promise<void>((resolve, reject) => {
        const probe = net.createConnection({ port, host: '127.0.0.1' }, () => {
          probe.destroy();
          resolve();
        });
        probe.once('error', reject);
      }),
    ).rejects.toThrow(/ECONNREFUSED/);
    await restarting;

    expect(mock.layerState({ channel: 2, layer: 55 })).toBeUndefined();
    expect(mock.layerState({ channel: 2, layer: 99 })).toBeUndefined();
    expect(mock.layerState({ channel: 1, layer: 10 })).toBeUndefined();
    expect(mock.oscDestinations()).toEqual([]);
    expect(mock.amcpPort).toBe(port);

    // Up again on the same port — and a fresh subscribe is what brings the stream back.
    const again = await client(port);
    const from = own.heard.length;
    await delay(150);
    expect(own.heard.slice(from)).toEqual([]);
    expect(await again.send(`OSC SUBSCRIBE ${String(own.port)}`)).toBe('202 OSC SUBSCRIBE OK');
    await delay(150);
    expect(own.heard.slice(from)).toContain(FRAMERATE);
  });
});
