/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PROGRAMME'S SOUND, PLAYED THE WAY THE PLAYOUT'S OWN CLIENT PLAYS
 * IT** (`PLAYOUT-CG-RESPONSE-PLAYLIST-AUDIO-v1.md` §2.1, their `pgm-audio.ts` / `usePgmAudio`).
 *
 * - `fetch` and a `ReadableStream` — never an `<audio>` element, which buffers seconds;
 * - the first 44 bytes (the WAV header) skipped; the rest cut on 4-byte boundaries (one s16le stereo frame);
 *   each chunk made an `AudioBuffer` at 48 kHz and scheduled with `AudioBufferSourceNode.start(nextT)`
 *   right behind the one before, on the `AudioContext`'s own clock;
 * - an ADAPTIVE buffer: it starts at 30 ms; three underruns within 10 s add 15 ms, up to 90 ms; it is never
 *   lowered while the connection lasts (a new connection starts again from 30 ms);
 * - a HARD CAP: when more than 150 ms is already scheduled, arriving chunks are dropped until what is
 *   scheduled is back down to the buffer — the core's clock and the sound card's drift apart, and this drop
 *   (and a restart after an underrun) is the ONLY correction: no resampling, no rate adjustment;
 * - no timestamps: the sound is never compared with the picture. Each path is simply as short as it can be.
 *
 * The console reaches the stream through CG Bridge (`/pgm/<n>/sound`, behind a ticket for the sound),
 * never the core: a new ticket is asked for on every connection.
 */

export const WAV_HEADER_BYTES = 44;
const FRAME_BYTES = 4;
export const PGM_AUDIO_SAMPLE_RATE = 48_000;

/** Their numbers (§2.1). */
export const AUDIO_BUFFER_START_MS = 30;
export const AUDIO_BUFFER_STEP_MS = 15;
export const AUDIO_BUFFER_MAX_MS = 90;
export const AUDIO_UNDERRUNS_TO_GROW = 3;
export const AUDIO_UNDERRUN_WINDOW_MS = 10_000;
export const AUDIO_HARD_CAP_MS = 150;

/** A lost stream is asked for again after 1 s, 2 s, 4 s … up to 10 s. */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 10_000;

/** The parts of `AudioBuffer` the player writes. */
export interface PcmBuffer {
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

/** The parts of `AudioBufferSourceNode` the player uses. */
export interface PcmSource {
  buffer: PcmBuffer | null;
  connect(destination: never): unknown;
  start(when: number): void;
}

/** The parts of `AudioContext` the player uses — a test hands in a fake with its own clock. */
export interface PcmOut {
  readonly currentTime: number;
  readonly destination: unknown;
  createBuffer(channels: number, length: number, sampleRate: number): PcmBuffer;
  createBufferSource(): PcmSource;
}

export type PgmAudioState = 'connecting' | 'playing' | 'stopped';

export interface PgmAudioPlayerOptions {
  /** A fresh URL (a fresh ticket) for each connection, or `null`: there is no sound to read. */
  readonly url: () => Promise<string | null>;
  readonly out: PcmOut;
  readonly fetchImpl?: typeof fetch;
  /** Wall clock for the underrun window. `performance.now` by default. */
  readonly now?: () => number;
  readonly onState?: (state: PgmAudioState) => void;
}

export class PgmAudioPlayer {
  readonly #url: () => Promise<string | null>;
  readonly #out: PcmOut;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #onState: (state: PgmAudioState) => void;

  #running = false;
  #state: PgmAudioState = 'stopped';
  #abort: AbortController | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #failures = 0;

  // Per connection.
  #bufferMs = AUDIO_BUFFER_START_MS;
  #underruns: number[] = [];
  #nextT = 0;
  #scheduledAny = false;
  #dropping = false;
  #dropped = 0;

  constructor(options: PgmAudioPlayerOptions) {
    this.#url = options.url;
    this.#out = options.out;
    this.#fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.#now = options.now ?? ((): number => performance.now());
    this.#onState = options.onState ?? ((): void => undefined);
  }

  /** The buffer in force now, in ms — a test's instrument, and the e2e's. */
  get bufferMs(): number {
    return this.#bufferMs;
  }

  /** Chunks dropped by the hard cap on this connection. */
  get dropped(): number {
    return this.#dropped;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#connect();
  }

  stop(): void {
    this.#running = false;
    if (this.#retry !== null) clearTimeout(this.#retry);
    this.#retry = null;
    this.#abort?.abort();
    this.#abort = null;
    this.#setState('stopped');
  }

  /**
   * One chunk of whole frames, s16le stereo, scheduled behind the last — or dropped by the cap. Public so a
   * test can drive the buffer rules with a fake clock and no network.
   */
  schedule(pcm: Uint8Array): void {
    const frames = Math.floor(pcm.byteLength / FRAME_BYTES);
    if (frames === 0) return;
    const out = this.#out;
    const now = out.currentTime;
    if (this.#nextT < now) {
      // Nothing is scheduled any more: an UNDERRUN (after the first chunk), and a restart a buffer ahead.
      if (this.#scheduledAny) this.#underrun();
      this.#nextT = now + this.#bufferMs / 1000;
      this.#dropping = false;
    }
    const ahead = this.#nextT - now;
    if (this.#dropping) {
      if (ahead > this.#bufferMs / 1000) {
        this.#dropped++;
        return;
      }
      this.#dropping = false;
    } else if (ahead > AUDIO_HARD_CAP_MS / 1000) {
      this.#dropping = true;
      this.#dropped++;
      return;
    }
    const buffer = out.createBuffer(2, frames, PGM_AUDIO_SAMPLE_RATE);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const view = new DataView(pcm.buffer, pcm.byteOffset, frames * FRAME_BYTES);
    for (let i = 0; i < frames; i++) {
      left[i] = view.getInt16(i * FRAME_BYTES, true) / 32768;
      right[i] = view.getInt16(i * FRAME_BYTES + 2, true) / 32768;
    }
    const source = out.createBufferSource();
    source.buffer = buffer;
    source.connect(out.destination as never);
    source.start(this.#nextT);
    this.#nextT += frames / PGM_AUDIO_SAMPLE_RATE;
    this.#scheduledAny = true;
  }

  /** A new connection: the buffer starts again from 30 ms. */
  resetConnection(): void {
    this.#bufferMs = AUDIO_BUFFER_START_MS;
    this.#underruns = [];
    this.#nextT = 0;
    this.#scheduledAny = false;
    this.#dropping = false;
    this.#dropped = 0;
  }

  /** Told only when it CHANGES: `playing` would otherwise be said for every 20 ms chunk. */
  #setState(state: PgmAudioState): void {
    if (state === this.#state) return;
    this.#state = state;
    this.#onState(state);
  }

  #underrun(): void {
    const now = this.#now();
    this.#underruns = this.#underruns.filter((t) => now - t < AUDIO_UNDERRUN_WINDOW_MS);
    this.#underruns.push(now);
    if (this.#underruns.length >= AUDIO_UNDERRUNS_TO_GROW) {
      this.#bufferMs = Math.min(AUDIO_BUFFER_MAX_MS, this.#bufferMs + AUDIO_BUFFER_STEP_MS);
      this.#underruns = [];
    }
  }

  #connect(): void {
    if (!this.#running) return;
    this.#setState('connecting');
    const abort = new AbortController();
    this.#abort = abort;
    void this.#read(abort)
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        if (!this.#running || abort.signal.aborted) return;
        const delay = Math.min(RETRY_BASE_MS * 2 ** this.#failures, RETRY_MAX_MS);
        this.#failures++;
        this.#setState('connecting');
        this.#retry = setTimeout(() => {
          this.#retry = null;
          this.#connect();
        }, delay);
      });
  }

  async #read(abort: AbortController): Promise<void> {
    const url = await this.#url();
    if (url === null || abort.signal.aborted) return;
    const res = await this.#fetch(url, { signal: abort.signal, cache: 'no-store' });
    if (!res.ok || res.body === null) return;
    const reader = res.body.getReader();
    this.resetConnection();
    let skip = WAV_HEADER_BYTES;
    let carry = new Uint8Array(0);
    for (;;) {
      const { value, done } = await reader.read();
      if (done || abort.signal.aborted) return;
      let bytes = value;
      if (skip > 0) {
        const n = Math.min(skip, bytes.byteLength);
        skip -= n;
        bytes = bytes.subarray(n);
        if (skip > 0) continue;
      }
      if (carry.byteLength > 0) {
        const joined = new Uint8Array(carry.byteLength + bytes.byteLength);
        joined.set(carry, 0);
        joined.set(bytes, carry.byteLength);
        bytes = joined;
      }
      const whole = bytes.byteLength - (bytes.byteLength % FRAME_BYTES);
      carry = bytes.slice(whole);
      if (whole === 0) continue;
      if (this.#failures > 0) this.#failures = 0;
      this.#setState('playing');
      this.schedule(bytes.subarray(0, whole));
    }
  }
}
