import type { OscEvent } from '@cg/shared-schema';

/**
 * Per-event-kind rate limiter. ADR 0004 observed CasparCG emitting
 * `/framerate` and audio-volume at ~50 Hz on a 1080i50 channel — far more
 * than the Reconciler needs to see. This drops repeated emissions within
 * a configurable interval per `OscEvent.kind`.
 *
 * Defaults (Phase 5 §4.2):
 *  - `osc.framerate` → 1 Hz  (1000 ms)
 *  - everything else  → unrate-limited (caller relies on dispatch-on-change)
 */
export class OscRateLimiter {
  private readonly lastEmitAt = new Map<string, number>();

  constructor(
    private readonly budgets: Partial<Record<OscEvent['kind'], number>> = {
      'osc.framerate': 1000,
    },
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** True if the event should be emitted; false if suppressed. */
  shouldEmit(event: OscEvent): boolean {
    const budget = this.budgets[event.kind];
    if (budget === undefined || budget <= 0) return true;
    const key = keyOf(event);
    const last = this.lastEmitAt.get(key);
    const now = this.now();
    if (last !== undefined && now - last < budget) return false;
    this.lastEmitAt.set(key, now);
    return true;
  }

  /** Forget all gating decisions — used on session resync. */
  reset(): void {
    this.lastEmitAt.clear();
  }
}

/**
 * Rate-limit key — per-kind, per-channel/layer. Same address can fire at
 * any frequency as long as different (channel, layer) keys are
 * independent.
 */
function keyOf(event: OscEvent): string {
  switch (event.kind) {
    case 'osc.framerate':
      return `framerate:${String(event.channel)}`;
    case 'osc.layer.foreground.producer':
    case 'osc.layer.foreground.file':
    case 'osc.layer.foreground.paused':
    case 'osc.layer.background.producer':
      return `${event.kind}:${String(event.channel)}:${String(event.layer)}`;
    case 'osc.health':
      return `health:${event.server}`;
  }
}
