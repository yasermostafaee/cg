import type { PgmLoudness, PgmMeterReading } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../../shared/runtime-bridge.js';
import { METER_STALE_MS } from './meterScale.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE METERS' ONE SUBSCRIPTION, AND NO REACT STATE.**
 *
 * Readings arrive twenty times a second per channel. A React state per reading would re-render the monitor
 * twenty times a second for a picture that changes a few pixels, so — as the Playout's own `VuMeterTall`
 * does — the meter and the badge register a WRITER here and write their DOM directly; nothing re-renders.
 *
 * ⚠ A level is NOW or it is nothing: a channel with no `audio` for {@link METER_STALE_MS} is told `null`
 * (the floor), and one with no `loudness` for {@link LOUDNESS_STALE_MS} is told `null` (unknown) — never the
 * last number held up as if it were current.
 */

/** Loudness arrives every 150 ms while known (their §2.3); silent this long, it is unknown. */
export const LOUDNESS_STALE_MS = 1_000;

/** How often the staleness is looked at. */
const SWEEP_MS = 100;

type AudioWriter = (dbfs: readonly number[] | null) => void;
type LoudnessWriter = (loudness: PgmLoudness | null) => void;

interface ChannelMeters {
  readonly audio: Set<AudioWriter>;
  readonly loudness: Set<LoudnessWriter>;
  /** When the last reading arrived, or `null`: none since the last went stale. */
  audioAt: number | null;
  loudnessAt: number | null;
}

export interface MeterStoreDeps {
  readonly subscribe: (handler: (reading: PgmMeterReading) => void) => Unsubscribe;
  readonly now?: () => number;
}

export class MeterStore {
  readonly #deps: MeterStoreDeps;
  readonly #now: () => number;
  readonly #channels = new Map<number, ChannelMeters>();
  #unsubscribe: Unsubscribe | null = null;
  #sweep: ReturnType<typeof setInterval> | null = null;

  constructor(deps: MeterStoreDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? ((): number => performance.now());
  }

  /** Write each `audio` reading for `channel` (or `null`: the floor). Returns the release. */
  watchAudio(channel: number, write: AudioWriter): () => void {
    const meters = this.#meters(channel);
    meters.audio.add(write);
    write(null);
    this.#arm();
    return () => {
      meters.audio.delete(write);
      this.#release(channel);
    };
  }

  /** Write each `loudness` reading for `channel` (or `null`: unknown). Returns the release. */
  watchLoudness(channel: number, write: LoudnessWriter): () => void {
    const meters = this.#meters(channel);
    meters.loudness.add(write);
    write(null);
    this.#arm();
    return () => {
      meters.loudness.delete(write);
      this.#release(channel);
    };
  }

  /** Look at staleness now — the sweep's body, public for a test's fake clock. */
  sweep(): void {
    const now = this.#now();
    for (const meters of this.#channels.values()) {
      if (meters.audioAt !== null && now - meters.audioAt >= METER_STALE_MS) {
        meters.audioAt = null;
        for (const write of meters.audio) write(null);
      }
      if (meters.loudnessAt !== null && now - meters.loudnessAt >= LOUDNESS_STALE_MS) {
        meters.loudnessAt = null;
        for (const write of meters.loudness) write(null);
      }
    }
  }

  #meters(channel: number): ChannelMeters {
    let meters = this.#channels.get(channel);
    if (meters === undefined) {
      meters = { audio: new Set(), loudness: new Set(), audioAt: null, loudnessAt: null };
      this.#channels.set(channel, meters);
    }
    return meters;
  }

  #arm(): void {
    if (this.#unsubscribe === null) {
      this.#unsubscribe = this.#deps.subscribe((reading) => {
        this.#receive(reading);
      });
    }
    if (this.#sweep === null) {
      this.#sweep = setInterval(() => {
        this.sweep();
      }, SWEEP_MS);
    }
  }

  #release(channel: number): void {
    const meters = this.#channels.get(channel);
    if (meters !== undefined && meters.audio.size === 0 && meters.loudness.size === 0) {
      this.#channels.delete(channel);
    }
    if (this.#channels.size > 0) return;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    if (this.#sweep !== null) clearInterval(this.#sweep);
    this.#sweep = null;
  }

  #receive(reading: PgmMeterReading): void {
    const meters = this.#channels.get(reading.channel);
    if (meters === undefined) return;
    if (reading.kind === 'audio') {
      meters.audioAt = this.#now();
      for (const write of meters.audio) write(reading.dbfs);
    } else {
      meters.loudnessAt = this.#now();
      for (const write of meters.loudness) write(reading);
    }
  }
}

let shared: MeterStore | null = null;

/** The console's one store, on `window.cg.meters`. */
export function meterStore(): MeterStore {
  shared ??= new MeterStore({ subscribe: (handler) => window.cg.meters.onReading(handler) });
  return shared;
}
