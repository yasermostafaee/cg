import { EventEmitter } from 'node:events';
import type http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_LISTENER_BUFFERED_BYTES,
  PCM_FRAME_BYTES,
  PgmAudioRelay,
  WAV_HEADER_BYTES,
} from '../src/pgm-audio.js';
import type { PgmReturnTuning } from '../src/pgm-return.js';
import {
  AUDIO_CHUNK_BYTES,
  startFakePgmFeed,
  wavHeader,
  type FakePgmFeed,
} from './support/fake-pgm-feed.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PROGRAMME'S SOUND, relayed under the picture relay's rules**,
 * against a fake core that serves `GET /audio.wav` as the Playout team describes it (PLAYLIST-AUDIO §2.1).
 *
 * The listener here is a recording stand-in for the console's HTTP response, so a test can see each WRITE
 * the relay makes — the unit rule 4 is about (a sample frame never split across two writes), which a TCP
 * reader downstream could not see.
 */

let feeds: FakePgmFeed[] = [];
let relays: PgmAudioRelay[] = [];

afterEach(async () => {
  for (const relay of relays) relay.dispose();
  relays = [];
  for (const feed of feeds) await feed.stop();
  feeds = [];
});

async function feed(options: Parameters<typeof startFakePgmFeed>[0] = {}): Promise<FakePgmFeed> {
  const f = await startFakePgmFeed(options);
  feeds.push(f);
  return f;
}

const FAST: Partial<PgmReturnTuning> = {
  lingerMs: 100,
  checkEveryMs: 20,
  deadMs: 400,
  backoffBaseMs: 50,
  backoffMaxMs: 200,
  connectTimeoutMs: 1000,
};

function relayOn(port: number, log: string[] = []): PgmAudioRelay {
  const relay = new PgmAudioRelay({
    resolveTarget: () => Promise.resolve({ address: '127.0.0.1', hostHeader: 'playout.test' }),
    portFor: () => port,
    tuning: FAST,
    log: (line) => log.push(line),
  });
  relays.push(relay);
  return relay;
}

/** A console's response as the relay sees it: every write kept, and a knob for a slow reader. */
class RecordingResponse extends EventEmitter {
  status = 0;
  headers: Record<string, string> = {};
  writes: Buffer[] = [];
  writableEnded = false;
  destroyed = false;
  /** What a slow console would leave unsent. */
  writableLength = 0;
  socket = { setNoDelay: (): void => undefined };

  writeHead(status: number, headers: Record<string, string>): this {
    this.status = status;
    this.headers = headers;
    return this;
  }
  write(chunk: Buffer | string): boolean {
    this.writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }
  end(chunk?: string): this {
    if (chunk !== undefined) this.writes.push(Buffer.from(chunk));
    this.writableEnded = true;
    return this;
  }
  /** The console closed the request. */
  hangUp(): void {
    this.destroyed = true;
    this.emit('close');
  }
  pcm(): Buffer[] {
    return this.writes.slice(1);
  }
}

function listen(relay: PgmAudioRelay, channel = 1): RecordingResponse {
  const res = new RecordingResponse();
  relay.serve(
    { method: 'GET' } as http.IncomingMessage,
    res as unknown as http.ServerResponse,
    channel,
  );
  return res;
}

async function waitFor(pred: () => boolean, ms: number, what: string): Promise<void> {
  const deadline = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error(`timed out after ${String(ms)} ms: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('PgmAudioRelay — the programme sound (PLAYOUT-FEATURES-01 E)', () => {
  it('ONE well-formed request for two consoles; each gets the 44-byte header first, then whole 4-byte frames', async () => {
    // The fake splits every 20 ms chunk at byte 1001 — not a frame boundary — so the relay must carry.
    const f = await feed({ audioSplitAt: 1001 });
    const relay = relayOn(f.port);
    const a = listen(relay);
    const b = listen(relay);
    await waitFor(() => a.pcm().length >= 6 && b.pcm().length >= 6, 4000, 'sound on both');

    // The Playout sees ONE reader, and its one request is exactly this, with nothing after it.
    expect(f.audioConnections).toHaveLength(1);
    expect(f.connections, 'the picture is not asked for').toHaveLength(0);
    expect(f.audioConnections[0]?.received.toString('latin1')).toBe(
      'GET /audio.wav HTTP/1.1\r\nHost: playout.test\r\n\r\n',
    );
    expect(relay.upstreams).toBe(1);

    for (const res of [a, b]) {
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/octet-stream');
      // The header first, byte for byte the core's.
      expect(res.writes[0]?.length).toBe(WAV_HEADER_BYTES);
      expect(res.writes[0]?.equals(wavHeader())).toBe(true);
      // …and every write after it is whole frames: never a sample pair split in two.
      const pcm = res.pcm();
      expect(pcm.every((w) => w.length > 0 && w.length % PCM_FRAME_BYTES === 0)).toBe(true);
      // The positive control that the fake really split: some write is NOT a whole 20 ms chunk.
      expect(pcm.some((w) => w.length !== AUDIO_CHUNK_BYTES)).toBe(true);
      // The frames decode as the fake's tone: left and right equal in every frame.
      const all = Buffer.concat(pcm);
      for (let i = 0; i + 4 <= all.length; i += 4) {
        if (all.readInt16LE(i) !== all.readInt16LE(i + 2)) throw new Error(`frame ${String(i)}`);
      }
    }
  });

  it('a late console gets the header first too; the last one leaving releases the upstream after the linger', async () => {
    const f = await feed();
    const relay = relayOn(f.port);
    const a = listen(relay);
    await waitFor(() => a.pcm().length >= 2, 4000, 'sound');
    const late = listen(relay);
    expect(late.writes[0]?.length, 'the held header, at once').toBe(WAV_HEADER_BYTES);
    await waitFor(() => late.pcm().length >= 2, 4000, 'sound on the late console');

    a.hangUp();
    await new Promise((r) => setTimeout(r, 200));
    expect(f.audioOpenCount(), 'one console still listens').toBe(1);
    late.hangUp();
    await waitFor(() => f.audioOpenCount() === 0, 2000, 'the release');
    expect(relay.upstreams).toBe(0);
  });

  it('a SLOW console skips chunks rather than queueing them', async () => {
    const f = await feed();
    const relay = relayOn(f.port);
    const slow = listen(relay);
    const quick = listen(relay);
    await waitFor(() => quick.pcm().length >= 2, 4000, 'sound');
    slow.writableLength = MAX_LISTENER_BUFFERED_BYTES + 1;
    const before = slow.pcm().length;
    const quickBefore = quick.pcm().length;
    await waitFor(() => quick.pcm().length >= quickBefore + 10, 4000, 'more sound');
    expect(slow.pcm().length, 'nothing queued for the slow one').toBe(before);
    // It drains: the newest sound reaches it again.
    slow.writableLength = 0;
    await waitFor(() => slow.pcm().length > before, 4000, 'sound after draining');
  });

  it('a silent core is closed and redialled; a core restart is redialled; channel ≥ 21 is 404 and never dialled', async () => {
    const f = await feed();
    const log: string[] = [];
    const relay = relayOn(f.port, log);
    const res = listen(relay);
    await waitFor(() => res.pcm().length >= 2, 4000, 'sound');

    f.pauseAudio();
    await waitFor(() => f.audioConnections.length >= 2, 4000, 'a redial after silence');
    f.resumeAudio();
    const seen = res.pcm().length;
    await waitFor(() => res.pcm().length > seen + 2, 4000, 'sound again');

    f.closeAll();
    await waitFor(() => f.audioConnections.length >= 3, 4000, 'a redial after the core closed');
    expect(log.some((l) => l.includes('no stream'))).toBe(true);

    const outside = listen(relay, 21);
    expect(outside.status).toBe(404);
    expect(outside.writableEnded).toBe(true);
  });
});
