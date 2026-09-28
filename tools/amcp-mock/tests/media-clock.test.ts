import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { clipElapsedAt } from '../src/layer-state.js';
import { createMock } from '../src/mock.js';
import type { MockHandle } from '../src/types.js';

/**
 * `MEDIA-PLATES-01` §3 — a media clip's clock on the mock, as CasparCG 2.5.0's ffmpeg producer keeps
 * it (from its source, and measured on the owner's core on 2026-09-28): it runs while playing, stands
 * while paused, FREEZES at its end when it is not looping (never empty), wraps when it is; `CALL SEEK`
 * counts channel frames and works after the end; `CALL LOOP 0|1` switches looping on a playing clip.
 * Every assertion reads the mock's own state on a fake clock.
 */

let mock: MockHandle | undefined;

afterEach(async () => {
  if (mock) {
    await mock.stop();
    mock = undefined;
  }
});

const SLOT = { channel: 1, layer: 60 };
const CLIP = 'D:/Media Library/clips/clip 1.mp4';

async function boot(): Promise<{ m: MockHandle; clock: { t: number }; elapsed: () => number }> {
  const clock = { t: 10_000 };
  const m = await createMock({
    amcpPort: 0,
    oscPort: 0,
    disableOsc: true,
    now: () => clock.t,
    clipLength: (file) => (file === CLIP ? 10 : undefined),
  });
  mock = m;
  const elapsed = (): number => {
    const layer = m.layerState(SLOT);
    if (layer === undefined) throw new Error('no layer');
    const value = clipElapsedAt(layer, clock.t);
    if (value === undefined) throw new Error('no clock');
    return value;
  };
  return { m, clock, elapsed };
}

describe('the clip clock', () => {
  it('🔴 runs while playing and FREEZES at the end of a clip that is not looping — never empty', async () => {
    const { m, clock, elapsed } = await boot();
    expect(await send(m.amcpPort, `PLAY 1-60 "${CLIP}"`)).toBe('202 PLAY\r\n');
    expect(m.layerState(SLOT)).toMatchObject({ producer: 'ffmpeg', loop: false, clipLengthS: 10 });
    clock.t += 4_000;
    expect(elapsed()).toBeCloseTo(4, 5);
    clock.t += 30_000;
    expect(elapsed()).toBe(10);
    // Still the clip on the layer: frozen on its last frame, not cleared.
    expect(m.layerState(SLOT)?.producer).toBe('ffmpeg');
  });

  it('`LOOP` on the PLAY is a bare flag, and a looping clip wraps; control: without it, it freezes', async () => {
    const { m, clock, elapsed } = await boot();
    await send(m.amcpPort, `PLAY 1-60 "${CLIP}" LOOP`);
    expect(m.layerState(SLOT)?.loop).toBe(true);
    clock.t += 12_000;
    expect(elapsed()).toBeCloseTo(2, 5);
  });

  it('🔴 PAUSE holds the frame and stops the clock; RESUME carries on from it', async () => {
    const { m, clock, elapsed } = await boot();
    await send(m.amcpPort, `PLAY 1-60 "${CLIP}"`);
    clock.t += 3_000;
    expect(await send(m.amcpPort, 'PAUSE 1-60')).toBe('202 PAUSE\r\n');
    expect(m.layerState(SLOT)?.paused).toBe(true);
    clock.t += 5_000;
    expect(elapsed()).toBeCloseTo(3, 5);
    expect(await send(m.amcpPort, 'RESUME 1-60')).toBe('202 RESUME\r\n');
    clock.t += 1_000;
    expect(elapsed()).toBeCloseTo(4, 5);
    expect(m.layerState(SLOT)?.paused).toBe(false);
  });

  it('a bare PLAY resumes a paused clip too, as `layer::play()` un-pauses', async () => {
    const { m, clock, elapsed } = await boot();
    await send(m.amcpPort, `PLAY 1-60 "${CLIP}"`);
    clock.t += 2_000;
    await send(m.amcpPort, 'PAUSE 1-60');
    clock.t += 2_000;
    expect(await send(m.amcpPort, 'PLAY 1-60')).toBe('202 PLAY\r\n');
    clock.t += 1_000;
    expect(elapsed()).toBeCloseTo(3, 5);
  });

  it('🔴 `CALL SEEK 0` restarts a clip — after its end included — and answers the frame', async () => {
    const { m, clock, elapsed } = await boot();
    await send(m.amcpPort, `PLAY 1-60 "${CLIP}"`);
    clock.t += 60_000;
    expect(elapsed()).toBe(10);
    expect(await send(m.amcpPort, 'CALL 1-60 SEEK 0')).toBe('201 CALL OK\r\n0\r\n');
    clock.t += 1_500;
    expect(elapsed()).toBeCloseTo(1.5, 5);
    // SEEK counts CHANNEL frames (50 fps): 250 frames is 5 s.
    await send(m.amcpPort, 'CALL 1-60 SEEK 250');
    expect(elapsed()).toBeCloseTo(5, 5);
  });

  it('`CALL LOOP 1` loops a playing clip — an ended one starts again; with no value it only answers', async () => {
    const { m, clock, elapsed } = await boot();
    await send(m.amcpPort, `PLAY 1-60 "${CLIP}"`);
    clock.t += 20_000;
    expect(elapsed()).toBe(10);
    expect(await send(m.amcpPort, 'CALL 1-60 LOOP')).toBe('201 CALL OK\r\n0\r\n');
    expect(await send(m.amcpPort, 'CALL 1-60 LOOP 1')).toBe('201 CALL OK\r\n1\r\n');
    clock.t += 3_000;
    expect(elapsed()).toBeCloseTo(3, 5);
    expect(await send(m.amcpPort, 'CALL 1-60 LOOP 0')).toBe('201 CALL OK\r\n0\r\n');
    expect(m.layerState(SLOT)?.loop).toBe(false);
  });

  it('refuses what the core would: a CALL on a layer with no clip, an unknown sub-command, a bad value', async () => {
    const { m } = await boot();
    expect(await send(m.amcpPort, 'CALL 1-61 SEEK 0')).toContain('403');
    await send(m.amcpPort, `PLAY 1-60 "${CLIP}"`);
    expect(await send(m.amcpPort, 'CALL 1-60 FRAME 3')).toContain('403');
    expect(await send(m.amcpPort, 'CALL 1-60 LOOP true')).toContain('403');
    expect(await send(m.amcpPort, 'CALL 1-60 SEEK -4')).toContain('403');
  });

  it('control: a file the mock has no length for, and a stream, carry no clock; CLEAR drops it', async () => {
    const { m } = await boot();
    await send(m.amcpPort, 'PLAY 1-62 "unknown.mp4"');
    expect(m.layerState({ channel: 1, layer: 62 })?.clipLengthS).toBeUndefined();
    await send(m.amcpPort, 'PLAY 1-63 "udp://239.255.0.1:5000"');
    expect(m.layerState({ channel: 1, layer: 63 })?.clipLengthS).toBeUndefined();
    await send(m.amcpPort, `PLAY 1-60 "${CLIP}"`);
    await send(m.amcpPort, 'CLEAR 1-60');
    expect(m.layerState(SLOT)).toMatchObject({ producer: 'empty', clipLengthS: undefined });
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
