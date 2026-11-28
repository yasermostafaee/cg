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

import { METER_FLOOR_DBFS } from '@cg/shared-ipc';

export const WAV_HEADER_BYTES = 44;
const FRAME_BYTES = 4;
export const PGM_AUDIO_SAMPLE_RATE = 48_000;
const METER_WINDOW_FRAMES = PGM_AUDIO_SAMPLE_RATE / 20;

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
const BUSY_RETRY_MS = [100, 200, 400, 800];

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
type StereoPeakWriter = (levels: readonly [number, number]) => void;

export interface PgmAudioPlayerOptions {
  /** A fresh URL (a fresh ticket) for each connection, or `null`: there is no sound to read. */
  readonly url: () => Promise<string | null>;
  readonly out?: PcmOut;
  /** Local speaker gain node. Buffer timing and signal meters still use their existing clocks. */
  readonly destination?: unknown;
  readonly fetchImpl?: typeof fetch;
  /** Wall clock for the underrun window. `performance.now` by default. */
  readonly now?: () => number;
  readonly onState?: (state: PgmAudioState) => void;
  readonly retry?: boolean;
  /** A valid input-preview ticket can briefly meet the prior audio request as it closes. */
  readonly retryWhileBusy?: boolean;
}

export class PgmAudioPlayer {
  readonly #url: () => Promise<string | null>;
  #out: PcmOut | null;
  #destination: unknown;
  #onPeaks: StereoPeakWriter | undefined;
  #peakFrames = 0;
  #peakLeft = 0;
  #peakRight = 0;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #onState: (state: PgmAudioState) => void;
  readonly #retryOnLoss: boolean;
  readonly #retryWhileBusy: boolean;

  #running = false;
  #state: PgmAudioState = 'stopped';
  #abort: AbortController | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #failures = 0;
  #busyRetries = 0;

  // Per connection.
  #bufferMs = AUDIO_BUFFER_START_MS;
  #underruns: number[] = [];
  #nextT = 0;
  #scheduledAny = false;
  #dropping = false;
  #dropped = 0;

  constructor(options: PgmAudioPlayerOptions) {
    this.#url = options.url;
    this.#out = options.out ?? null;
    this.#destination = options.destination ?? options.out?.destination;
    this.#fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.#now = options.now ?? ((): number => performance.now());
    this.#onState = options.onState ?? ((): void => undefined);
    this.#retryOnLoss = options.retry ?? true;
    this.#retryWhileBusy = options.retryWhileBusy ?? false;
  }

  /** The buffer in force now, in ms — a test's instrument, and the e2e's. */
  get bufferMs(): number {
    return this.#bufferMs;
  }

  /** Chunks dropped by the hard cap on this connection. */
  get dropped(): number {
    return this.#dropped;
  }

  /** The stream can keep metering when its local speaker is detached. */
  setSpeaker(out: PcmOut | null, destination?: unknown): void {
    this.#out = out;
    this.#destination = destination ?? out?.destination;
    this.#resetPlayback();
  }

  setPeakWriter(write?: StereoPeakWriter): void {
    this.#onPeaks = write;
    this.#resetPeaks();
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#busyRetries = 0;
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
    if (out === null) return;
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
    source.connect(this.#destination as never);
    source.start(this.#nextT);
    this.#nextT += frames / PGM_AUDIO_SAMPLE_RATE;
    this.#scheduledAny = true;
  }

  /** Native preview supplies framed stereo PCM directly, without a WAV fetch. */
  ingestStereoPacket(bytes: Uint8Array): void {
    const pcm = bytes.subarray(0, bytes.byteLength - (bytes.byteLength % FRAME_BYTES));
    if (pcm.length === 0) return;
    if (this.#onPeaks !== undefined) this.#measurePeaks(pcm, this.#onPeaks);
    this.schedule(pcm);
  }

  /** A new connection: the buffer starts again from 30 ms. */
  resetConnection(): void {
    this.#resetPlayback();
    this.#resetPeaks();
  }

  #resetPlayback(): void {
    this.#bufferMs = AUDIO_BUFFER_START_MS;
    this.#underruns = [];
    this.#nextT = 0;
    this.#scheduledAny = false;
    this.#dropping = false;
    this.#dropped = 0;
  }

  #resetPeaks(): void {
    this.#peakFrames = 0;
    this.#peakLeft = 0;
    this.#peakRight = 0;
  }

  #measurePeaks(pcm: Uint8Array, write: StereoPeakWriter): void {
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (let offset = 0; offset < view.byteLength; offset += FRAME_BYTES) {
      this.#peakLeft = Math.max(this.#peakLeft, Math.abs(view.getInt16(offset, true)));
      this.#peakRight = Math.max(this.#peakRight, Math.abs(view.getInt16(offset + 2, true)));
      this.#peakFrames++;
      if (this.#peakFrames < METER_WINDOW_FRAMES) continue;
      const dbfs = (peak: number): number =>
        Math.max(METER_FLOOR_DBFS, 20 * Math.log10(peak / 32768));
      write([dbfs(this.#peakLeft), dbfs(this.#peakRight)]);
      this.#resetPeaks();
    }
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
      .catch(() => undefined)
      .then((result) => {
        if (!this.#running || abort.signal.aborted) return;
        const busyDelay = result === 'busy' ? BUSY_RETRY_MS[this.#busyRetries] : undefined;
        if (busyDelay === undefined && !this.#retryOnLoss) {
          this.stop();
          return;
        }
        const delay = busyDelay ?? Math.min(RETRY_BASE_MS * 2 ** this.#failures, RETRY_MAX_MS);
        if (busyDelay === undefined) this.#failures++;
        else this.#busyRetries++;
        this.#setState('connecting');
        this.#retry = setTimeout(() => {
          this.#retry = null;
          this.#connect();
        }, delay);
      });
  }

  async #read(abort: AbortController): Promise<'busy' | void> {
    const url = await this.#url();
    if (url === null || abort.signal.aborted) return;
    const res = await this.#fetch(url, {
      signal: abort.signal,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    if (res.status === 409 && this.#retryWhileBusy) {
      void res.body?.cancel().catch(() => undefined);
      return 'busy';
    }
    if (!res.ok || res.body === null) return;
    const reader = res.body.getReader();
    this.resetConnection();
    const header = new Uint8Array(WAV_HEADER_BYTES);
    let skip = header.length;
    let canMeasure = false;
    let carry = new Uint8Array(0);
    for (;;) {
      const { value, done } = await reader.read();
      if (done || abort.signal.aborted) return;
      let bytes = value;
      if (skip > 0) {
        const n = Math.min(skip, bytes.byteLength);
        header.set(bytes.subarray(0, n), header.length - skip);
        skip -= n;
        bytes = bytes.subarray(n);
        if (skip > 0) continue;
        const wav = new DataView(header.buffer);
        canMeasure =
          wav.getUint32(0) === 0x52494646 && // RIFF
          wav.getUint32(8) === 0x57415645 && // WAVE
          wav.getUint32(12) === 0x666d7420 && // fmt
          wav.getUint32(16, true) === 16 &&
          wav.getUint16(20, true) === 1 &&
          wav.getUint16(22, true) === 2 &&
          wav.getUint32(24, true) === PGM_AUDIO_SAMPLE_RATE &&
          wav.getUint16(32, true) === FRAME_BYTES &&
          wav.getUint16(34, true) === 16 &&
          wav.getUint32(36) === 0x64617461; // data
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
      const pcm = bytes.subarray(0, whole);
      if (canMeasure) this.ingestStereoPacket(pcm);
      else this.schedule(pcm);
    }
  }
}
