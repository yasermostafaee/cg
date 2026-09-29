/**
 * 🔴 `B-292` (`RELEASE-091-01` DELTA B, B1) — **WHICH SILENT LAYERS OF OURS TO ASK CASPARCG ABOUT.**
 *
 * CasparCG 2.5 erases a cleared layer and simply stops reporting it on OSC (`stage.cpp` `clear`:
 * `layers_.erase(index)`; the monitor state is rebuilt from the layers that exist every tick), so a
 * layer of ours that another client, the Playout or the core itself cleared is not reported `empty` —
 * it goes SILENT. Silence is therefore a QUESTION, answered by one `INFO` read. This module decides
 * only WHEN to ask, as a pure function of what the OSC taps have heard, so the rule is testable
 * without a server and the runtime keeps only the asking.
 *
 * The three conditions, each with its reason:
 *
 * 1. **The layer was HEARD.** A layer never heard, or last noted `empty` (the bridge's own
 *    acknowledged `CLEAR`), gives no silence to ask about — silence is evidence of nothing unless
 *    it follows a report (`B-093`, `B-163`).
 * 2. **Its CHANNEL is still ticking** (`/channel/N/framerate` within {@link CHANNEL_TICKING_MS}). A
 *    whole channel gone quiet is a link or a channel question, never one layer's — golden rule 8:
 *    probe the axis you judge; a channel's silence cannot speak for one of its layers.
 * 3. **One question per silence.** A silence already asked about is not asked again until the layer
 *    reports again and falls silent anew. Never a poll.
 */

/** A layer silent this long, while its channel ticks, is asked about. */
export const SILENT_LAYER_MS = 1000;
/** How often the question looks — a pure read of the taps, sending nothing on its own. */
export const SILENCE_CHECK_MS = 250;
/** A channel counts as ticking while its last frame report is this fresh. */
export const CHANNEL_TICKING_MS = 500;

/** What the OSC taps have heard — the runtime's two taps, as two questions. */
export interface SilenceReadings {
  /** When the channel last reported a frame, or `null` — never heard since the session began. */
  lastTickFor(channel: number): number | null;
  /** When the layer last reported a producer, or `null` — never, or last noted `empty`. */
  lastProducerAt(channel: number, layer: number): number | null;
}

/** One layer, as the question remembers it. */
export function silenceKey(channel: number, layer: number): string {
  return `${String(channel)}-${String(layer)}`;
}

export interface SilenceDecision {
  /** Per channel, the silent layers to ask about in ONE read. */
  readonly ask: ReadonlyMap<number, readonly number[]>;
  /** The silences now asked about: layer key → the report the silence began after. */
  readonly asked: ReadonlyMap<string, number>;
}

/**
 * Decide which held layers to ask about now.
 *
 * `held` — per channel, the layers this bridge holds on air. `asked` — the silences already asked
 * about, from the previous decision. `reading` — channels with a read in flight (asked nothing more
 * until it lands). Returns the reads to send, and the `asked` record to keep: a layer heard within
 * {@link SILENT_LAYER_MS} is forgotten, so its NEXT silence is a new question.
 */
export function silentLayersToAsk(input: {
  readonly held: ReadonlyMap<number, ReadonlySet<number>>;
  readonly readings: SilenceReadings;
  readonly asked: ReadonlyMap<string, number>;
  readonly reading: ReadonlySet<number>;
  readonly now: number;
}): SilenceDecision {
  const { held, readings, reading, now } = input;
  // Only layers still held are remembered: one that left our hands has no silence to ask about.
  const heldKeys = new Set(
    [...held].flatMap(([channel, layers]) => [...layers].map((l) => silenceKey(channel, l))),
  );
  const asked = new Map([...input.asked].filter(([key]) => heldKeys.has(key)));
  const ask = new Map<number, number[]>();
  for (const [channel, layers] of held) {
    for (const layer of layers) {
      const seen = readings.lastProducerAt(channel, layer);
      if (seen !== null && now - seen < SILENT_LAYER_MS) asked.delete(silenceKey(channel, layer));
    }
    if (reading.has(channel)) continue;
    const tick = readings.lastTickFor(channel);
    if (tick === null || now - tick > CHANNEL_TICKING_MS) continue;
    const silent: number[] = [];
    for (const layer of layers) {
      const seen = readings.lastProducerAt(channel, layer);
      if (seen === null || now - seen < SILENT_LAYER_MS) continue;
      const key = silenceKey(channel, layer);
      if (asked.get(key) === seen) continue;
      asked.set(key, seen);
      silent.push(layer);
    }
    if (silent.length > 0) ask.set(channel, silent);
  }
  return { ask, asked };
}
