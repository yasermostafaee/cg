import type { OscEvent } from '@cg/shared-schema';

/**
 * 🔴 **`R-058` — WHICH CHANNELS ARE ACTUALLY PRODUCING FRAMES, and the reason this is a
 * separate tap rather than a field on the occupancy one.**
 *
 * `/channel/N/framerate` is emitted on EVERY channel tick, by the channel's own clock. It is
 * therefore the one signal on the wire that answers _"is this channel RUNNING?"_ — a question
 * no other surface in this product could answer. `OscOccupancyTap` answers a different one
 * ("what producer is on this layer") and answers it SERVER-wide; folding a per-CHANNEL
 * liveness signal into it would give one class two meanings and one staleness window two jobs.
 *
 * The owner's 2026-08-23 incident is what this exists for: a `<decklink>` consumer for a
 * device the machine did not have, CasparCG up, AMCP connected, the console reading
 * **BRIDGE LIVE + PRIMARY A HEALTHY** — and the channel producing nothing at all. Every
 * signal the console had was about REACHABILITY, and every one of them was true.
 *
 * ── 🔴 SILENCE IS NOT PROOF, AND THAT IS ENFORCED BY THE SHAPE, NOT BY A CHECK ──
 *
 * There are two completely different reasons a channel is not in this tap's stream, and they
 * demand OPPOSITE responses:
 *
 *   - **it has never ticked here** — OSC may be blocked, pointed at another host, or the
 *     install may not send it at all (`B-094`'s install did exactly that). We know NOTHING
 *     about that channel. An alarm would be `B-163`'s silence-as-evidence trap, and on a
 *     healthy plant it would fire on every OSC-less install forever.
 *   - **it ticked and STOPPED** — a real, observed CHANGE, and the alarm.
 *
 * **A channel enters {@link channels} only by TICKING**, and once entered it can only be
 * reported stale — never absent. So "alarmed without ever having ticked" is not a case this
 * tap defends against; it is a state the data model cannot represent. That is deliberate:
 * a rule written as `now - lastAt > N` over a map that also holds never-seen channels is one
 * `?? 0` away from alarming on silence, and this repo has paid for that shape twice
 * (`B-101` read OSC silence as AMCP death; `B-053` read it as an empty layer).
 *
 * ⚠ **`reset()` returns every channel to NEVER-SEEN, and that is correct rather than
 * convenient.** After a reconnect we genuinely have no evidence about any channel, and a tap
 * that carried its pre-drop entries across would report "stopped" for a channel whose ticks
 * simply have not resumed yet — an alarm manufactured by our own reconnect.
 */
export class OscChannelTickTap {
  /** Channels that have TICKED at least once since the last reset, and when they last did. */
  private readonly lastTickAt = new Map<number, number>();

  /**
   * Record a parsed OSC event. Only `osc.framerate` counts — see the class note for why
   * producer events cannot stand in for it (a channel with every layer empty still ticks,
   * and emits nothing else).
   */
  note(event: OscEvent, at: number): void {
    if (event.kind !== 'osc.framerate') return;
    this.lastTickAt.set(event.channel, at);
  }

  /**
   * Every channel we have EVER heard tick, with whether it is ticking NOW.
   *
   * 🔴 Absence from this list means "no evidence", never "not ticking". A caller that wants
   * to alarm reads `ticking === false`, which by construction can only be said about a
   * channel that has already proved it ticks.
   *
   * Sorted by channel so a published snapshot is stable and a test can compare it whole.
   */
  channels(staleMs: number, now: number = Date.now()): { channel: number; ticking: boolean }[] {
    return [...this.lastTickAt.entries()]
      .sort(([a], [b]) => a - b)
      .map(([channel, at]) => ({ channel, ticking: now - at <= staleMs }));
  }

  /** Wall-clock ms of this channel's last tick, or `null` if it has never ticked (diagnostic). */
  lastTickFor(channel: number): number | null {
    return this.lastTickAt.get(channel) ?? null;
  }

  /** Forget everything — a new session knows nothing about any channel. See the class note. */
  reset(): void {
    this.lastTickAt.clear();
  }
}
