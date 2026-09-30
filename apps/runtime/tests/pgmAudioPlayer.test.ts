import { describe, expect, it } from 'vitest';
import {
  AUDIO_BUFFER_MAX_MS,
  AUDIO_BUFFER_START_MS,
  AUDIO_HARD_CAP_MS,
  PgmAudioPlayer,
  WAV_HEADER_BYTES,
  type PcmBuffer,
  type PcmOut,
  type PcmSource,
} from '../src/renderer/features/monitors/pgmAudioPlayer.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PLAYOUT CLIENT'S AUDIO RULES, AGAINST A FAKE AUDIO CLOCK**
 * (PLAYLIST-AUDIO §2.1): the header skipped, 4-byte cuts, chunks joined on the context's clock, a buffer that
 * starts at 30 ms and grows 15 ms after three underruns in 10 s up to 90 ms and never shrinks within a
 * connection, and a 150 ms cap that drops back to the buffer.
 */

/** A fake `AudioContext`: a clock the test moves, and every `start(when)` kept. */
class FakeOut implements PcmOut {
  currentTime = 10;
  readonly destination = {};
  readonly starts: { when: number; frames: number; left: Float32Array; right: Float32Array }[] = [];

  createBuffer(_channels: number, length: number, sampleRate: number): PcmBuffer {
    const data = [new Float32Array(length), new Float32Array(length)];
    return {
      duration: length / sampleRate,
      getChannelData: (c: number) => data[c] as Float32Array,
    };
  }

  createBufferSource(): PcmSource {
    const source: PcmSource = {
      buffer: null,
      connect: () => undefined,
      start: (when: number) => {
        const b = source.buffer as PcmBuffer;
        this.starts.push({
          when,
          frames: b.getChannelData(0).length,
          left: b.getChannelData(0),
          right: b.getChannelData(1),
        });
      },
    };
    return source;
  }
}

/** `frames` stereo frames of s16le. */
function pcm(frames: number, value = 1000): Uint8Array {
  const b = new Uint8Array(frames * 4);
  const view = new DataView(b.buffer);
  for (let i = 0; i < frames; i++) {
    view.setInt16(i * 4, value, true);
    view.setInt16(i * 4 + 2, -value, true);
  }
  return b;
}

const CHUNK = 960; // 20 ms at 48 kHz

function player(out: FakeOut, clock: { ms: number }): PgmAudioPlayer {
  return new PgmAudioPlayer({
    url: () => Promise.resolve(null),
    out,
    now: () => clock.ms,
  });
}

describe('PgmAudioPlayer — the buffer rules', () => {
  it('the first chunk starts one buffer (30 ms) ahead; the next ones join end to end on the audio clock', () => {
    const out = new FakeOut();
    const p = player(out, { ms: 0 });
    for (let i = 0; i < 3; i++) p.schedule(pcm(CHUNK));
    expect(out.starts.map((s) => s.when)).toEqual(
      [10.03, 10.05, 10.07].map((t) => expect.closeTo(t, 9)),
    );
    expect(p.bufferMs).toBe(AUDIO_BUFFER_START_MS);
    // s16 → float, left and right kept apart.
    expect(out.starts[0]?.left[0]).toBeCloseTo(1000 / 32768, 6);
    expect(out.starts[0]?.right[0]).toBeCloseTo(-1000 / 32768, 6);
  });

  it('three underruns within 10 s add 15 ms, up to 90 — never lowered on the connection; a new one starts at 30', () => {
    const out = new FakeOut();
    const clock = { ms: 0 };
    const p = player(out, clock);
    const underrun = (): void => {
      p.schedule(pcm(CHUNK));
      // The clock runs past everything scheduled: the next chunk finds nothing playing.
      out.currentTime += 1;
      clock.ms += 1000;
    };
    underrun(); // the first chunk: not an underrun
    underrun();
    underrun();
    expect(p.bufferMs).toBe(AUDIO_BUFFER_START_MS);
    underrun();
    expect(p.bufferMs).toBe(45);
    for (let i = 0; i < 30; i++) underrun();
    expect(p.bufferMs).toBe(AUDIO_BUFFER_MAX_MS);
    // A good stretch: plenty of chunks and no underrun — it does not come down.
    for (let i = 0; i < 50; i++) p.schedule(pcm(CHUNK));
    expect(p.bufferMs).toBe(AUDIO_BUFFER_MAX_MS);
    p.resetConnection();
    expect(p.bufferMs).toBe(AUDIO_BUFFER_START_MS);
  });

  it('underruns further apart than 10 s do not grow it', () => {
    const out = new FakeOut();
    const clock = { ms: 0 };
    const p = player(out, clock);
    p.schedule(pcm(CHUNK));
    for (let i = 0; i < 6; i++) {
      out.currentTime += 1;
      clock.ms += 6000;
      p.schedule(pcm(CHUNK));
    }
    expect(p.bufferMs).toBe(AUDIO_BUFFER_START_MS);
  });

  it('more than 150 ms scheduled ahead: arriving chunks are dropped until it is back to the buffer', () => {
    const out = new FakeOut();
    const p = player(out, { ms: 0 });
    // A burst: the core's clock ran ahead of the card's, and ten chunks land at once.
    for (let i = 0; i < 10; i++) p.schedule(pcm(CHUNK));
    const ahead = (): number => {
      const last = out.starts.at(-1);
      return last === undefined ? 0 : last.when + last.frames / 48_000 - out.currentTime;
    };
    expect(ahead() * 1000).toBeLessThanOrEqual(AUDIO_HARD_CAP_MS + 20 + 1e-6);
    expect(p.dropped).toBeGreaterThan(0);
    const dropped = p.dropped;
    // Still dropping while above the BUFFER, not merely above the cap…
    out.currentTime += 0.05;
    p.schedule(pcm(CHUNK));
    expect(p.dropped).toBe(dropped + 1);
    // …and scheduling again once what is ahead is back down to it.
    out.currentTime += 0.2;
    const before = out.starts.length;
    p.schedule(pcm(CHUNK));
    expect(out.starts.length).toBe(before + 1);
  });
});

describe('PgmAudioPlayer — the stream', () => {
  it('skips the 44-byte header and cuts on 4-byte boundaries, whatever the reads', async () => {
    const out = new FakeOut();
    const header = new Uint8Array(WAV_HEADER_BYTES).fill(0x52);
    const body = pcm(CHUNK * 3, 1234);
    const all = new Uint8Array(header.length + body.length);
    all.set(header, 0);
    all.set(body, header.length);
    // Reads at awkward sizes: inside the header, across it, and mid-frame.
    const cuts = [10, 50, 1001, 2003, 5555, all.length];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let at = 0;
        for (const cut of cuts) {
          controller.enqueue(all.slice(at, cut));
          at = cut;
        }
        controller.close();
      },
    });
    const states: string[] = [];
    const urls: string[] = [];
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });
    const p = new PgmAudioPlayer({
      url: () => {
        urls.push('asked');
        return Promise.resolve('http://bridge/pgm/1/sound?ticket=t');
      },
      out,
      fetchImpl: () => Promise.resolve(new Response(stream, { status: 200 })),
      onState: (s) => {
        states.push(s);
        if (s === 'playing') setTimeout(resolveDone, 20);
      },
    });
    p.start();
    await done;
    p.stop();
    const frames = out.starts.reduce((n, s) => n + s.frames, 0);
    expect(frames).toBe(CHUNK * 3);
    for (const s of out.starts) {
      expect(s.left.every((v) => Math.abs(v - 1234 / 32768) < 1e-6)).toBe(true);
      expect(s.right.every((v) => Math.abs(v + 1234 / 32768) < 1e-6)).toBe(true);
    }
    expect(urls).toHaveLength(1);
    expect(states[0]).toBe('connecting');
    expect(states).toContain('playing');
  });
});
