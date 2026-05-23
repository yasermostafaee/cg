import { z } from 'zod';

/**
 * Push events from CasparCG 2.3.x, derived from the OSC addresses
 * observed during M1 Spike B (ADR 0004).
 *
 * Notable absences vs the speculative pre-spike schema:
 *  - **No `/cg.invoked` or `/cg.stopped`.** CasparCG 2.3.x doesn't emit
 *    CG-specific OSC events. CG state must be tracked via AMCP acks.
 *  - **No `/foreground/file/frame`.** Per-frame progress from OSC is
 *    unavailable; animations time off rAF inside the template.
 *  - **No `/profiler/time` or dropped-frame counter** by default — those
 *    require a non-default OSC config and may surface later.
 *
 * Addresses we DO emit are normalized into the typed events below. Out-of-
 * interest addresses (e.g. `/mixer/audio/volume`) are dropped before they
 * reach this layer.
 */
export const OscEventSchema = z.discriminatedUnion('kind', [
  /** `/channel/N/framerate` — emitted on every channel tick; useful for clock sanity. */
  z.object({
    kind: z.literal('osc.framerate'),
    channel: z.number().int().positive(),
    num: z.number().int().positive(),
    den: z.number().int().positive(),
  }),
  /** `/channel/N/stage/layer/L/foreground/producer` — `'empty' | 'html' | ...`. */
  z.object({
    kind: z.literal('osc.layer.foreground.producer'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
    producer: z.string(),
  }),
  /** `/channel/N/stage/layer/L/foreground/file/path` — URL string of the loaded asset. */
  z.object({
    kind: z.literal('osc.layer.foreground.file'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
    path: z.string(),
  }),
  /** `/channel/N/stage/layer/L/foreground/paused` — `false` means playing. */
  z.object({
    kind: z.literal('osc.layer.foreground.paused'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
    paused: z.boolean(),
  }),
  /** `/channel/N/stage/layer/L/background/producer` — next-up tracking. */
  z.object({
    kind: z.literal('osc.layer.background.producer'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
    producer: z.string(),
  }),
  /**
   * Synthetic health event derived by `@cg/caspar-client` from OSC freshness.
   * Not a wire address — emitted when the heartbeat axis flips state.
   */
  z.object({
    kind: z.literal('osc.health'),
    server: z.enum(['primary', 'backup']),
    healthy: z.boolean(),
    /** Seconds since the session was last in `HEALTHY`. */
    uptimeSec: z.number().nonnegative(),
  }),
]);
export type OscEvent = z.infer<typeof OscEventSchema>;
