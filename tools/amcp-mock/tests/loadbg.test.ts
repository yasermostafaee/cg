import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock } from '../src/mock.js';
import type { MockHandle } from '../src/types.js';

/**
 * `ROUTE-PLATES-01` §1.H — contract v1.3's rule 4 on the mock: `LOADBG <ch>-<L> "route://H-L"` puts
 * the route in the layer's BACKGROUND and changes nothing on air; a bare `PLAY <ch>-<L>` promotes it.
 * And every received line is stamped with the mock's clock, the timing tests' instrument.
 */

let mock: MockHandle | undefined;

afterEach(async () => {
  if (mock) {
    await mock.stop();
    mock = undefined;
  }
});

const L = (layer: number): { channel: number; layer: number } => ({ channel: 1, layer });

describe('LOADBG and the bare PLAY', () => {
  it('LOADBG loads the background only; the bare PLAY puts it on air', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    expect(await send(mock.amcpPort, 'LOADBG 1-60 "route://9-12"')).toBe('202 LOADBG\r\n');
    const loaded = mock.layerState(L(60));
    expect(loaded?.producer).toBe('empty');
    expect(loaded?.onAir).toBe(false);
    expect(loaded?.backgroundProducer).toBe('route');
    expect(loaded?.backgroundFilePath).toBe('route://9-12');

    expect(await send(mock.amcpPort, 'PLAY 1-60')).toBe('202 PLAY\r\n');
    const played = mock.layerState(L(60));
    expect(played?.producer).toBe('route');
    expect(played?.filePath).toBe('route://9-12');
    expect(played?.onAir).toBe(true);
    expect(played?.backgroundProducer).toBe('empty');
  });

  it('a bare PLAY with nothing in the background is ACKED and changes nothing — as CasparCG 2.5.0 answers it (measured)', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    expect(await send(mock.amcpPort, 'PLAY 1-61')).toBe('202 PLAY\r\n');
    expect(mock.layerState(L(61))).toBeUndefined();
    // Control: a playing foreground is left playing — nothing was loaded to replace it.
    await send(mock.amcpPort, 'PLAY 1-64 "udp://239.255.0.1:5000"');
    expect(await send(mock.amcpPort, 'PLAY 1-64')).toBe('202 PLAY\r\n');
    expect(mock.layerState(L(64))?.producer).toBe('ffmpeg');
  });

  it('LOADBG refuses what PLAY refuses — an unrecognised form is never silently acked', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    expect(await send(mock.amcpPort, 'LOADBG 1-62 "rout://9-12"')).toContain('404 ERROR');
    expect(mock.layerState(L(62))).toBeUndefined();
  });

  it('CLEAR empties the background too', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    await send(mock.amcpPort, 'LOADBG 1-63 "route://9-12"');
    expect(await send(mock.amcpPort, 'CLEAR 1-63')).toBe('202 CLEAR\r\n');
    expect(mock.layerState(L(63))?.backgroundProducer).toBe('empty');
    // …so a bare PLAY after it promotes nothing.
    expect(await send(mock.amcpPort, 'PLAY 1-63')).toBe('202 PLAY\r\n');
    expect(mock.layerState(L(63))?.producer ?? 'empty').toBe('empty');
  });
});

describe('the command log', () => {
  it('stamps every received line with the mock clock, refused lines included', async () => {
    let clock = 1_000;
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true, now: () => clock });
    await send(mock.amcpPort, 'LOADBG 1-60 "route://9-12"');
    clock = 1_045;
    await send(mock.amcpPort, 'PLAY 1-60');
    clock = 1_050;
    await send(mock.amcpPort, 'BOGUS 1-60');
    expect(mock.receivedCommands()).toEqual([
      { at: 1_000, line: 'LOADBG 1-60 "route://9-12"' },
      { at: 1_045, line: 'PLAY 1-60' },
      { at: 1_050, line: 'BOGUS 1-60' },
    ]);
  });
});

function send(port: number, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' });
    let buf = '';
    sock.setEncoding('utf-8');
    sock.on('data', (chunk) => {
      buf += chunk;
    });
    sock.on('connect', () => {
      sock.write(`${line}\r\n`);
      setTimeout(() => sock.end(), 60);
    });
    sock.on('end', () => resolve(buf));
    sock.on('error', reject);
  });
}
