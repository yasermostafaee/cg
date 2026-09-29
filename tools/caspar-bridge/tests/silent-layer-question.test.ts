import { describe, expect, it } from 'vitest';
import {
  CHANNEL_TICKING_MS,
  SILENT_LAYER_MS,
  silenceKey,
  silentLayersToAsk,
  type SilenceReadings,
} from '../src/silent-layer-question.js';

/**
 * 🔴 `B-292` (`RELEASE-091-01` DELTA B, B1) — WHEN a layer of ours is asked about. The wiring (the
 * `INFO` read, the row off air, nothing re-sent, measured at ~1.1 s) is
 * `media-plates.integration.test.ts`; this pins the rule itself, each refusal beside the positive
 * control that proves the instrument would have asked.
 */

const NOW = 100_000;

interface Heard {
  /** channel → when it last ticked */
  readonly ticks?: Readonly<Record<number, number>>;
  /** `ch-layer` → when it last reported a producer */
  readonly producers?: Readonly<Record<string, number>>;
}

function readings(heard: Heard): SilenceReadings {
  return {
    lastTickFor: (channel) => heard.ticks?.[channel] ?? null,
    lastProducerAt: (channel, layer) => heard.producers?.[silenceKey(channel, layer)] ?? null,
  };
}

function held(entries: Readonly<Record<number, readonly number[]>>): Map<number, Set<number>> {
  return new Map(Object.entries(entries).map(([ch, layers]) => [Number(ch), new Set(layers)]));
}

const decide = (
  heard: Heard,
  layers: Readonly<Record<number, readonly number[]>>,
  asked: ReadonlyMap<string, number> = new Map(),
  reading: ReadonlySet<number> = new Set(),
  now = NOW,
) => silentLayersToAsk({ held: held(layers), readings: readings(heard), asked, reading, now });

const silentFor = (ms: number) => NOW - ms;

describe('silentLayersToAsk', () => {
  it('🔴 a held layer silent for a second on a ticking channel is asked about — control: one heard within the second is not', () => {
    const d = decide(
      {
        ticks: { 2: NOW - 40 },
        producers: { '2-60': silentFor(SILENT_LAYER_MS), '2-61': silentFor(SILENT_LAYER_MS - 1) },
      },
      { 2: [60, 61] },
    );
    expect([...d.ask]).toEqual([[2, [60]]]);
  });

  it('🔴 a QUIET CHANNEL is never asked about, however long its layer has been silent — control: the same silence on a ticking channel is', () => {
    const quiet = decide(
      { ticks: { 2: NOW - CHANNEL_TICKING_MS - 1 }, producers: { '2-60': silentFor(30_000) } },
      { 2: [60] },
    );
    expect(quiet.ask.size).toBe(0);
    const neverTicked = decide({ producers: { '2-60': silentFor(30_000) } }, { 2: [60] });
    expect(neverTicked.ask.size).toBe(0);

    const ticking = decide(
      { ticks: { 2: NOW - CHANNEL_TICKING_MS }, producers: { '2-60': silentFor(30_000) } },
      { 2: [60] },
    );
    expect([...ticking.ask]).toEqual([[2, [60]]]);
  });

  it('a layer never heard, or last noted empty, has no silence to ask about', () => {
    // `lastProducerAt` answers null for both: never reported, or our own acknowledged CLEAR.
    const d = decide({ ticks: { 1: NOW } }, { 1: [99] });
    expect(d.ask.size).toBe(0);
  });

  it('🔴 ONE question per silence — asked again only after the layer reports and falls silent anew', () => {
    const first = decide(
      { ticks: { 2: NOW }, producers: { '2-60': silentFor(SILENT_LAYER_MS) } },
      { 2: [60] },
    );
    expect([...first.ask]).toEqual([[2, [60]]]);

    // The same silence, a tick later: nothing.
    const again = decide(
      { ticks: { 2: NOW + 250 }, producers: { '2-60': silentFor(SILENT_LAYER_MS) } },
      { 2: [60] },
      first.asked,
      new Set(),
      NOW + 250,
    );
    expect(again.ask.size).toBe(0);

    // It reports again (a new take on the layer)…
    const heard = decide(
      { ticks: { 2: NOW + 500 }, producers: { '2-60': NOW + 400 } },
      { 2: [60] },
      again.asked,
      new Set(),
      NOW + 500,
    );
    expect(heard.ask.size).toBe(0);
    // …and falls silent anew: a new question.
    const anew = decide(
      { ticks: { 2: NOW + 2_000 }, producers: { '2-60': NOW + 400 } },
      { 2: [60] },
      heard.asked,
      new Set(),
      NOW + 2_000,
    );
    expect([...anew.ask]).toEqual([[2, [60]]]);
  });

  it('a channel whose read is in flight is asked nothing more until it lands', () => {
    const d = decide(
      { ticks: { 2: NOW }, producers: { '2-60': silentFor(5_000) } },
      { 2: [60] },
      new Map(),
      new Set([2]),
    );
    expect(d.ask.size).toBe(0);
  });

  it('the silent layers of one channel go in ONE read; two channels, two', () => {
    const d = decide(
      {
        ticks: { 1: NOW, 2: NOW },
        producers: {
          '1-99': silentFor(3_000),
          '2-59': silentFor(3_000),
          '2-60': silentFor(3_000),
          '2-61': NOW - 10,
        },
      },
      { 1: [99], 2: [59, 60, 61] },
    );
    expect([...d.ask].sort(([a], [b]) => a - b)).toEqual([
      [1, [99]],
      [2, [59, 60]],
    ]);
  });

  it('forgets a silence once the layer is no longer held', () => {
    const asked = new Map([[silenceKey(2, 60), silentFor(3_000)]]);
    const d = decide({ ticks: { 2: NOW } }, { 2: [61] }, asked);
    expect([...d.asked.keys()]).toEqual([]);
  });
});
