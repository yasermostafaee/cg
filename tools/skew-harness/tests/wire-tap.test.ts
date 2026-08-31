import * as net from 'node:net';
import { describe, expect, it } from 'vitest';
import { openWireTap, sentCommands, windowContainsPlay, type TappedLine } from '../src/wire-tap.js';

/**
 * The tap is the instrument that separates `B-174` from `B-155` (a `PLAY` in the window),
 * so its classification and its transparency are both pinned here.
 */

const line = (dir: 'send' | 'recv', text: string): TappedLine => ({ dir, at: 0, line: text });

describe('window classification', () => {
  it('🔴 PLAY and LOADBG mark a window as carrying a producer change; MIXER/CG do not', () => {
    expect(windowContainsPlay([line('send', 'PLAY 1-30 "clip"')])).toBe(true);
    expect(windowContainsPlay([line('send', 'LOADBG 1-30 "clip"')])).toBe(true);
    expect(
      windowContainsPlay([
        line('send', 'MIXER 1-30 FILL 0 0 1 1'),
        line('send', 'MIXER 1-30 CLIP 0 0 1 1'),
        line('send', 'CG 1-60 UPDATE 0 "{}"'),
      ]),
    ).toBe(false);
  });

  it('a PLAY the SERVER echoes back is not a PLAY the bridge sent', () => {
    expect(windowContainsPlay([line('recv', '202 PLAY OK')])).toBe(false);
  });

  it('sentCommands keeps only the bridge→server direction', () => {
    const window = [line('send', 'MIXER 1-30 FILL 0 0 1 1'), line('recv', '202 MIXER OK')];
    expect(sentCommands(window)).toEqual(['MIXER 1-30 FILL 0 0 1 1']);
  });
});

describe('the tap itself', () => {
  it('passes bytes through untouched and records both directions with CRLF framing', async () => {
    const upstream = net.createServer((sock) => {
      sock.on('data', (b) => {
        if (b.toString('utf-8').includes('VERSION')) sock.write('201 VERSION OK\r\n2.5.0 test\r\n');
      });
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const upstreamPort = (upstream.address() as net.AddressInfo).port;

    const tap = await openWireTap('127.0.0.1', upstreamPort);
    const client = net.connect(tap.port, '127.0.0.1');
    const reply = await new Promise<string>((resolve) => {
      let buffer = '';
      client.on('data', (b) => {
        buffer += b.toString('utf-8');
        if (buffer.includes('2.5.0 test\r\n')) resolve(buffer);
      });
      client.on('connect', () => client.write('VERSION\r\n'));
    });

    // Transparency: the client saw exactly what the server sent.
    expect(reply).toBe('201 VERSION OK\r\n2.5.0 test\r\n');
    // The tap recorded the send and both reply lines, attributed to the right direction.
    const sends = tap.lines().filter((l) => l.dir === 'send');
    const recvs = tap.lines().filter((l) => l.dir === 'recv');
    expect(sends.map((l) => l.line)).toEqual(['VERSION']);
    expect(recvs.map((l) => l.line)).toEqual(['201 VERSION OK', '2.5.0 test']);

    client.destroy();
    await tap.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it('since(mark) returns only what arrived after the mark — the per-run window', async () => {
    // The sink must resume() its accepted socket: a paused socket never processes the FIN
    // the tap's teardown sends, and server.close() then waits on it for ever.
    const upstream = net.createServer((sock) => sock.resume());
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const tap = await openWireTap('127.0.0.1', (upstream.address() as net.AddressInfo).port);
    const client = net.connect(tap.port, '127.0.0.1');
    await new Promise<void>((resolve) => client.on('connect', () => resolve()));

    client.write('FIRST\r\n');
    await new Promise((r) => setTimeout(r, 100));
    const mark = tap.lines().length;
    client.write('SECOND\r\n');
    await new Promise((r) => setTimeout(r, 100));

    expect(tap.since(mark).map((l) => l.line)).toEqual(['SECOND']);

    client.destroy();
    await tap.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });
});
