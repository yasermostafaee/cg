import { describe, expect, it } from 'vitest';
import type { PgmMeterReading } from '@cg/shared-ipc';
import {
  isLimiting,
  loudnessText,
  loudnessTone,
  METER_RED_FROM_DBFS,
  METER_SCALE_MARKS,
  METER_STALE_MS,
  METER_YELLOW_FROM_DBFS,
  meterClip,
  meterPercent,
} from '../src/renderer/features/monitors/meterScale.js';
import { LOUDNESS_STALE_MS, MeterStore } from '../src/renderer/features/monitors/meterStore.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — the meter's scale and the badge's rule, as the Playout's `VuMeterTall`
 * has them (PLAYLIST-AUDIO §2.2, §2.4), and the store that feeds both: its channel filter and its staleness.
 */

describe('the meter scale — linear −60…0 dBFS, the zones at 70 % and 88 %', () => {
  it('the colour stops sit where the Playout puts them: −18 dBFS is 70 %, −7.2 dBFS is 88 %', () => {
    expect(meterPercent(METER_YELLOW_FROM_DBFS)).toBeCloseTo(70, 9);
    expect(meterPercent(METER_RED_FROM_DBFS)).toBeCloseTo(88, 9);
    expect(meterPercent(0)).toBe(100);
    expect(meterPercent(-60)).toBe(0);
    // Clamped both ways, and a nonsense value is the floor.
    expect(meterPercent(-90)).toBe(0);
    expect(meterPercent(3)).toBe(100);
    expect(meterPercent(Number.NaN)).toBe(0);
    expect(meterClip(-18)).toBe('inset(30.00% 0 0 0)');
    expect(meterClip(-60)).toBe('inset(100.00% 0 0 0)');
  });

  it('labels 0, −6, −12, −18, −30, −40, −60 — linearly spaced', () => {
    expect(METER_SCALE_MARKS).toEqual([0, -6, -12, -18, -30, -40, -60]);
    expect(METER_SCALE_MARKS.map(meterPercent)).toEqual([
      100,
      90,
      80,
      70,
      50,
      expect.closeTo(33.33, 2),
      0,
    ]);
  });
});

describe('the loudness badge — −23 ± 1 green, ± 2 amber, beyond red; ≤ −70 is silence', () => {
  it('tones at the edges', () => {
    expect(loudnessTone(-23)).toBe('on-target');
    expect(loudnessTone(-22)).toBe('on-target');
    expect(loudnessTone(-24)).toBe('on-target');
    expect(loudnessTone(-21.5)).toBe('near');
    expect(loudnessTone(-25)).toBe('near');
    expect(loudnessTone(-20.9)).toBe('off-target');
    expect(loudnessTone(-30)).toBe('off-target');
    expect(loudnessTone(-70)).toBe('silent');
    expect(loudnessTone(-80)).toBe('silent');
    expect(loudnessTone(null)).toBe('unknown');
  });

  it('reads one decimal with the typographic minus; silence and unknown in words', () => {
    expect(loudnessText(-23.14)).toBe('−23.1 LUFS');
    expect(loudnessText(-9)).toBe('−9.0 LUFS');
    expect(loudnessText(-75)).toBe('Silence');
    expect(loudnessText(null)).toBe('— LUFS');
  });

  it('pulses only while the limiter takes MORE than 0.1 dB', () => {
    expect(isLimiting(-0.1)).toBe(false);
    expect(isLimiting(-0.11)).toBe(true);
    expect(isLimiting(0)).toBe(false);
    expect(isLimiting(null)).toBe(false);
  });
});

describe('MeterStore — one subscription, its channel only, and a stale level is the floor', () => {
  function rig(): {
    store: MeterStore;
    emit: (r: PgmMeterReading) => void;
    clock: { ms: number };
    subscribed: () => boolean;
  } {
    let handler: ((r: PgmMeterReading) => void) | null = null;
    const clock = { ms: 0 };
    const store = new MeterStore({
      subscribe: (h) => {
        handler = h;
        return () => {
          handler = null;
        };
      },
      now: () => clock.ms,
    });
    return {
      store,
      emit: (r) => handler?.(r),
      clock,
      subscribed: () => handler !== null,
    };
  }

  it('each writer hears its own channel; a reading goes stale to `null` after 500 ms (loudness after 1 s)', () => {
    const { store, emit, clock, subscribed } = rig();
    const one: (readonly number[] | null)[] = [];
    const two: (readonly number[] | null)[] = [];
    const loud: (number | null)[] = [];
    const offOne = store.watchAudio(1, (d) => one.push(d));
    const offTwo = store.watchAudio(2, (d) => two.push(d));
    const offLoud = store.watchLoudness(1, (l) => loud.push(l?.shortterm ?? null));
    expect(subscribed()).toBe(true);
    // Each writer starts at the floor.
    expect(one).toEqual([null]);

    emit({ kind: 'audio', channel: 1, dbfs: [-12, -13] });
    emit({ kind: 'audio', channel: 3, dbfs: [0, 0] });
    emit({ kind: 'loudness', channel: 1, momentary: -22, shortterm: -23.1, limiterGrDb: 0 });
    expect(one).toEqual([null, [-12, -13]]);
    expect(two).toEqual([null]);
    expect(loud).toEqual([null, -23.1]);

    clock.ms = METER_STALE_MS - 1;
    store.sweep();
    expect(one).toHaveLength(2);
    clock.ms = METER_STALE_MS;
    store.sweep();
    expect(one.at(-1)).toBeNull();
    expect(loud).toHaveLength(2);
    clock.ms = LOUDNESS_STALE_MS;
    store.sweep();
    expect(loud.at(-1)).toBeNull();

    offOne();
    offTwo();
    offLoud();
    // Nobody watches: the one subscription is released.
    expect(subscribed()).toBe(false);
  });
});
