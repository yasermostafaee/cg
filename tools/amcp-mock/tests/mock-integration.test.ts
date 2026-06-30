import * as net from 'node:net';
import * as dgram from 'node:dgram';
import * as http from 'node:http';
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

  // B-038 — the mock no longer blind-acks CG ADD: a bare id is unresolvable → 404,
  // and the producer is NOT loaded (the exact "looks acked, renders nothing" bug).
  it('CG ADD with a bare (non-URL) template id returns 404 and loads nothing', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const reply = await sendAndReceive(mock.amcpPort, ['CG 1-10 ADD 0 "tmpl" 1 "{\\"a\\":1}"']);
    expect(reply).toContain('404');
    expect(mock.layerState({ channel: 1, layer: 10 })?.producer ?? 'empty').toBe('empty');
    // …but the data payload is still recorded for assertion.
    expect(mock.lastCgAdd({ channel: 1, layer: 10 })).toEqual({
      template: 'tmpl',
      data: '{"a":1}',
    });
  });

  it('CG ADD resolves a served URL → 202 + html producer; records the data payload', async () => {
    const { url, close } = await serveOnce('<!doctype html><html><body>ok</body></html>');
    try {
      mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
      const reply = await sendAndReceive(mock.amcpPort, [
        `CG 1-10 ADD 0 "${url}" 1 "{\\"title\\":\\"خبر\\"}"`,
      ]);
      expect(reply).toContain('202 CG');
      expect(mock.layerState({ channel: 1, layer: 10 })?.producer).toBe('html');
      const add = mock.lastCgAdd({ channel: 1, layer: 10 });
      expect(add?.template).toBe(url);
      expect(add?.data).toBe('{"title":"خبر"}');
    } finally {
      await close();
    }
  });

  it('CG ADD with a URL that 404s is itself 404 (renders nothing)', async () => {
    const { url, close } = await serveOnce('not found', 404);
    try {
      mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
      const reply = await sendAndReceive(mock.amcpPort, [`CG 1-10 ADD 0 "${url}" 1 "{}"`]);
      expect(reply).toContain('404');
      expect(mock.layerState({ channel: 1, layer: 10 })?.producer ?? 'empty').toBe('empty');
    } finally {
      await close();
    }
  });

  it('CG UPDATE records its data payload', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    await sendAndReceive(mock.amcpPort, ['CG 1-10 UPDATE 0 "{\\"title\\":\\"به‌روز\\"}"']);
    expect(mock.lastCgUpdate({ channel: 1, layer: 10 })?.data).toBe('{"title":"به‌روز"}');
  });

  // B-039 — the mock models the producer lifecycle so the broken playout cycle is
  // testable: a load (play-on-load OFF) does NOT play; CG PLAY plays a loaded
  // producer; CG PLAY on an empty/destroyed layer is an observable no-op.
  it('CG ADD with play-on-load OFF loads the producer WITHOUT playing', async () => {
    const { url, close } = await serveOnce('<!doctype html><html><body>ok</body></html>');
    try {
      mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
      await sendAndReceive(mock.amcpPort, [`CG 1-10 ADD 0 "${url}" 0 "{}"`]);
      const state = mock.layerState({ channel: 1, layer: 10 });
      expect(state?.producer).toBe('html'); // loaded
      expect(state?.onAir).toBe(false); // but NOT playing
    } finally {
      await close();
    }
  });

  it('CG ADD with play-on-load ON loads AND plays', async () => {
    const { url, close } = await serveOnce('<!doctype html><html><body>ok</body></html>');
    try {
      mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
      await sendAndReceive(mock.amcpPort, [`CG 1-10 ADD 0 "${url}" 1 "{}"`]);
      expect(mock.layerState({ channel: 1, layer: 10 })?.onAir).toBe(true);
    } finally {
      await close();
    }
  });

  it('CG PLAY plays a loaded producer; CG PLAY on an empty layer is an observable no-op', async () => {
    const { url, close } = await serveOnce('<!doctype html><html><body>ok</body></html>');
    try {
      mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
      const slot = { channel: 1, layer: 10 };

      // PLAY on an empty layer → 202 (blind ack like real CasparCG) but NOT on air.
      const emptyPlay = await sendAndReceive(mock.amcpPort, ['CG 1-10 PLAY 0']);
      expect(emptyPlay).toContain('202 CG');
      expect(mock.layerState(slot)?.onAir ?? false).toBe(false);

      // Load (no auto-play) then PLAY → now on air.
      await sendAndReceive(mock.amcpPort, [`CG 1-10 ADD 0 "${url}" 0 "{}"`]);
      expect(mock.layerState(slot)?.onAir).toBe(false);
      await sendAndReceive(mock.amcpPort, ['CG 1-10 PLAY 0']);
      expect(mock.layerState(slot)?.onAir).toBe(true);

      // CLEAR destroys the producer → off air; a subsequent PLAY is a no-op again.
      await sendAndReceive(mock.amcpPort, ['CLEAR 1-10']);
      expect(mock.layerState(slot)?.producer).toBe('empty');
      expect(mock.layerState(slot)?.onAir).toBe(false);
      await sendAndReceive(mock.amcpPort, ['CG 1-10 PLAY 0']);
      expect(mock.layerState(slot)?.onAir).toBe(false);
    } finally {
      await close();
    }
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

  it('addOscObserver routes emitOsc to a late-bound listener', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const got: { address: string; args: readonly unknown[] }[] = [];
    const listenerPort = await openOscListener((msg) => got.push(msg));
    mock.addOscObserver('127.0.0.1', listenerPort);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    await delay(50);
    expect(got).toEqual([
      { address: '/channel/1/stage/layer/10/foreground/producer', args: ['html'] },
    ]);
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

/** Serve `body` (with `status`) on an ephemeral loopback port; returns its URL + a closer. */
async function serveOnce(
  body: string,
  status = 200,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr !== null ? addr.port : 0);
    });
  });
  return {
    url: `http://127.0.0.1:${String(port)}/template/x`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
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
