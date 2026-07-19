import type { OscEvent } from '@cg/shared-schema';

/** One occupied (channel, layer) as last observed on the OSC wire. */
export interface OccupiedLayer {
  channel: number;
  layer: number;
  /** The foreground producer kind as reported (`"html"`, …; never `"empty"`). */
  producer: string;
  /** Wall-clock ms of the most recent observation. */
  at: number;
}

/**
 * Soft bound on retained entries. Real channels have tens of layers; this is
 * a runaway backstop, pruned oldest-first when exceeded (R-009: "a bounded
 * Map" is part of the approved design).
 */
const MAX_ENTRIES = 2048;

/**
 * R-009 — a PASSIVE occupancy tap on the OSC producer stream.
 *
 * Sits inside `OscTransport.attachHandlers` AFTER `messageToEvent` and
 * BEFORE the interest drop: every producer message is already parsed at that
 * point (interest gates emission into the pipeline, not parsing), so the tap
 * sees ALL layers — including never-loaded ones — without widening interest
 * and without touching the B-044 firehose protections (rate limiter, change
 * tracker). It emits nothing, subscribes to nothing, and never feeds the
 * Reconciler; consumers (the bridge's periodic orphan sweep) sample it.
 *
 * Why OSC and not AMCP: verified by live capture on CasparCG 2.5.0
 * (`69e8ad5`) — `INFO <channel>` returns no per-layer data on the 2.3+
 * lineage; the per-layer producer signal exists only on OSC (ADR 0004).
 *
 * Freshness matters: real CasparCG goes SILENT for a CLEARed layer (B-053
 * finding) rather than reporting `empty`, so consumers must treat entries
 * older than their staleness bound as unoccupied (`occupied(staleMs)` does).
 */
export class OscOccupancyTap {
  private readonly entries = new Map<string, { producer: string; at: number }>();
  private lastTrafficAt: number | null = null;

  /**
   * Has parseable OSC reached this tap RECENTLY — within the same staleness window
   * `occupied()` uses?
   *
   * Silence has two completely different meanings and the entry map cannot tell
   * them apart: "this layer is empty" and "I have never heard from the server at
   * all". They demand OPPOSITE actions, and conflating them cost a live graphic
   * — a bridge restart against an OSC-blind install read a genuinely LIVE layer
   * as unoccupied and re-ADDed a non-playing producer over it, taking the
   * graphic off air (captured on the wire, PR #353's hardware probe).
   *
   * So consumers that act on emptiness MUST gate on this: an empty map is
   * evidence of emptiness only when the tap has actually been hearing OSC.
   * Silence from a tap that has never received a packet is not evidence of
   * emptiness — it is evidence of NO EVIDENCE.
   *
   * FRESHNESS, not a sticky "ever" bit, and on the SAME window as `occupied()`.
   * A one-shot flag would go permanently true on a single packet, while the entry
   * map keeps ageing out — so a tap that heard OSC once and then went deaf would
   * report "heard" forever while reporting every layer empty, re-arming exactly
   * the re-ADD-over-a-live-producer this exists to prevent. Both signals must
   * decay together or they can disagree.
   *
   * Deliberately driven by OSC TRAFFIC, not by producer events: real CasparCG
   * emits per-layer producer messages only for layers that HAVE a producer (a
   * channel with every layer empty sends only `/channel/N/framerate` and
   * `/channel/N/mixer/...`, verified on 2.3.2). Keying this on producer events
   * would make a healthy-but-idle server indistinguishable from a blind tap,
   * and would break the legitimate "both restarted, layers really are empty"
   * re-ADD path.
   */
  hasFreshOsc(staleMs: number, now: number = Date.now()): boolean {
    return this.lastTrafficAt !== null && now - this.lastTrafficAt <= staleMs;
  }

  /** Wall-clock ms of the last parseable OSC packet, or null if never heard (diagnostic). */
  get lastOscTrafficAt(): number | null {
    return this.lastTrafficAt;
  }

  /**
   * Record that a parseable OSC packet arrived, whatever it carried. Called by
   * the transport once per packet, independently of `note()` — see
   * `hasReceivedOsc` for why the distinction is load-bearing.
   */
  noteTraffic(at: number = Date.now()): void {
    this.lastTrafficAt = at;
  }

  /** Record a parsed OSC event. Ignores everything but `foreground.producer`. */
  note(event: OscEvent, at: number): void {
    if (event.kind !== 'osc.layer.foreground.producer') return;
    this.entries.set(`${String(event.channel)}:${String(event.layer)}`, {
      producer: event.producer,
      at,
    });
    if (this.entries.size > MAX_ENTRIES) this.pruneOldest();
  }

  /**
   * Layers with a non-empty producer observed within `staleMs`. An entry
   * that aged out (layer went silent — e.g. CLEARed on real CasparCG) or
   * reports `empty` is not occupied.
   */
  occupied(staleMs: number, now: number = Date.now()): OccupiedLayer[] {
    const out: OccupiedLayer[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.producer === 'empty') continue;
      if (now - entry.at > staleMs) continue;
      const sep = key.indexOf(':');
      out.push({
        channel: Number(key.slice(0, sep)),
        layer: Number(key.slice(sep + 1)),
        producer: entry.producer,
        at: entry.at,
      });
    }
    return out;
  }

  /**
   * Forget everything — called on session resync so ghosts die with the cycle.
   *
   * `everReceived` resets WITH the entries, deliberately: the question it
   * answers is "am I hearing this session's server?", and a stale `true`
   * inherited across a reconnect would vouch for a server we have not heard
   * from yet — exactly the false confidence this flag exists to prevent.
   */
  reset(): void {
    this.entries.clear();
    this.lastTrafficAt = null;
  }

  /** Number of retained entries (diagnostic). */
  get size(): number {
    return this.entries.size;
  }

  private pruneOldest(): void {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, entry] of this.entries) {
      if (entry.at < oldestAt) {
        oldestAt = entry.at;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) this.entries.delete(oldestKey);
  }
}
