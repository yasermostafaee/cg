import * as net from 'node:net';
import * as dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock } from '../src/mock.js';
import type { MockHandle } from '../src/types.js';
import { parsePacket, flatten } from '../../spikes/osc-capture/osc.mjs';

/**
 * End-to-end behavior: a TCP client connects, sends AMCP, gets the
 * expected ack shapes; a UDP listener receives the OSC bundles the
 * mock pushes.
 */

let mock: MockHandle | undefined;

afterEach(async () => {
  if (mock) {
    await mock.stop();
    mock = undefined;
  }
});

describe('createMock', () => {
  it('binds to ephemeral ports when 0 is requested', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    expect(mock.amcpPort).toBeGreaterThan(0);
    expect(mock.oscPort).toBeGreaterThan(0);
  });

  it('responds to VERSION with a 201 single-line ack', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const reply = await sendAndReceive(mock.amcpPort, ['VERSION']);
    expect(reply).toMatch(/^201 VERSION OK\r\n2\.3\.2 Stable\r\n$/);
  });

  it('responds to INFO with a 200 multi-line ack listing channels', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, channels: 2, disableOsc: true });
    const reply = await sendAndReceive(mock.amcpPort, ['INFO']);
    expect(reply).toContain('200 INFO OK\r\n');
    expect(reply).toContain('1 PAL PLAYING\r\n');
    expect(reply).toContain('2 PAL PLAYING\r\n');
    expect(reply.endsWith('\r\n\r\n')).toBe(true);
  });

  it('responds to an unknown verb with 400', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const reply = await sendAndReceive(mock.amcpPort, ['GIBBERISH']);
    expect(reply).toBe('400 ERROR\r\n');
  });

  it('mutates layer state on PLAY and emits OSC for that slot', async () => {
    const captured: { address: string; args: readonly unknown[] }[] = [];
    const listenerPort = await openOscListener((msg) => {
      captured.push(msg);
    });

    mock = await createMock({
      amcpPort: 0,
      oscPort: listenerPort,
      disableOsc: true,
    });

    const reply = await sendAndReceive(mock.amcpPort, [
      'PLAY 1-10 "file:///C:/templates/index.html" HTML',
    ]);
    expect(reply).toBe('202 PLAY\r\n');

    expect(mock.layerState({ channel: 1, layer: 10 })).toMatchObject({
      producer: 'html',
      filePath: 'file:///C:/templates/index.html',
      paused: false,
    });

    // setLayer fires an immediate ad-hoc OSC; give the UDP loop a moment.
    await delay(50);
    expect(
      captured.some(
        (c) =>
          c.address === '/channel/1/stage/layer/10/foreground/producer' && c.args[0] === 'html',
      ),
    ).toBe(true);
  });

  it('CG REMOVE returns the slot to empty', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    await sendAndReceive(mock.amcpPort, ['PLAY 1-10 "file:///x.html" HTML', 'CG 1-10 REMOVE 0']);
    expect(mock.layerState({ channel: 1, layer: 10 })?.producer).toBe('empty');
  });

  it('CLEAR with no target returns 402', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const reply = await sendAndReceive(mock.amcpPort, ['CLEAR']);
    expect(reply).toBe('402 ERROR\r\n');
  });

  it('rejects PLAY on an out-of-range channel with 404', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, channels: 1, disableOsc: true });
    const reply = await sendAndReceive(mock.amcpPort, ['PLAY 5-10 "x" HTML']);
    expect(reply).toBe('404 ERROR\r\n');
  });

  it('LOAD primes the foreground but pauses it', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const reply = await sendAndReceive(mock.amcpPort, ['LOAD 1-10 "file:///y.html" HTML']);
    expect(reply).toBe('202 LOAD\r\n');
    expect(mock.layerState({ channel: 1, layer: 10 })).toMatchObject({
      producer: 'html',
      paused: true,
    });
  });

  it('INFO with a channel arg returns an XML stub', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, channels: 1, disableOsc: true });
    const reply = await sendAndReceive(mock.amcpPort, ['INFO 1']);
    expect(reply).toContain('200 INFO OK\r\n');
    expect(reply).toContain('<channel>');
    expect(reply).toContain('1080i5000');
  });

  it('INFO on an unknown channel returns 404', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, channels: 1, disableOsc: true });
    expect(await sendAndReceive(mock.amcpPort, ['INFO 9'])).toBe('404 ERROR\r\n');
  });

  it('CLEAR <channel> on a valid channel returns 202', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, channels: 1, disableOsc: true });
    expect(await sendAndReceive(mock.amcpPort, ['CLEAR 1'])).toBe('202 CLEAR\r\n');
  });

  it('CLEAR with a malformed target returns 401', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, channels: 1, disableOsc: true });
    expect(await sendAndReceive(mock.amcpPort, ['CLEAR not-a-channel'])).toBe('401 ERROR\r\n');
  });

  it('CG with an unknown subcommand returns 400', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    expect(await sendAndReceive(mock.amcpPort, ['CG 1-10 BOGUS 0'])).toBe('400 ERROR\r\n');
  });

  it('CG ADD on an empty layer auto-loads the HTML producer', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    await sendAndReceive(mock.amcpPort, ['CG 1-10 ADD 0 "tmpl" 1 "{\\"a\\":1}"']);
    expect(mock.layerState({ channel: 1, layer: 10 })?.producer).toBe('html');
  });

  it('a handler that throws yields a 500', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    mock.setHandler('CRASH', () => {
      throw new Error('boom');
    });
    expect(await sendAndReceive(mock.amcpPort, ['CRASH 1-10'])).toBe('500 ERROR\r\n');
  });

  it('honors a custom handler that overrides VERSION', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    mock.setHandler('VERSION', () => ({
      kind: 'ok-line',
      code: 201,
      verb: 'VERSION',
      data: 'forced-1.0',
    }));
    const reply = await sendAndReceive(mock.amcpPort, ['VERSION']);
    expect(reply).toBe('201 VERSION OK\r\nforced-1.0\r\n');
  });

  it('emits a periodic framerate bundle when osc is enabled', async () => {
    const got: string[] = [];
    const listenerPort = await openOscListener((msg) => {
      got.push(msg.address);
    });
    mock = await createMock({ amcpPort: 0, oscPort: listenerPort, oscHz: 50 });
    await delay(120);
    expect(got).toContain('/channel/1/framerate');
  });

  it('closeAllAmcpConnections drops connected clients', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const sock = net.createConnection({ port: mock.amcpPort, host: mock.host });
    await new Promise<void>((resolve) => sock.once('connect', () => resolve()));
    // The accept event needs a microtask to register.
    await delay(10);
    expect(mock.amcpClientCount).toBe(1);

    const closed = new Promise<void>((resolve) => sock.once('close', () => resolve()));
    mock.closeAllAmcpConnections();
    await closed;
    expect(mock.amcpClientCount).toBe(0);
  });
});

async function sendAndReceive(port: number, lines: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' });
    let buf = '';
    sock.setEncoding('utf-8');
    sock.on('data', (chunk) => {
      buf += chunk;
    });
    sock.on('connect', () => {
      sock.write(lines.map((l) => `${l}\r\n`).join(''));
      // Give the server a moment to handle every line; then close to flush.
      setTimeout(() => sock.end(), 100);
    });
    sock.on('end', () => resolve(buf));
    sock.on('error', reject);
  });
}

async function openOscListener(
  onMessage: (msg: { address: string; args: readonly unknown[] }) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.on('error', reject);
    sock.on('message', (buf) => {
      const parsed = parsePacket(buf);
      if (!parsed) return;
      for (const m of flatten(parsed)) onMessage(m);
    });
    sock.bind(0, '127.0.0.1', () => {
      const addr = sock.address();
      sock.unref();
      resolve(addr.port);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
