import type { OscEvent } from '@cg/shared-schema';

/**
 * Set of (channel, layer) pairs the receiver cares about. Out-of-interest
 * packets are dropped early — they're either layers we don't own (other
 * stations' graphics) or layers we've already deallocated.
 *
 * Channel-only events (`osc.framerate`) are always in-interest as long as
 * the channel is allocated to ANY layer in the set.
 *
 * The LayerManager (M4.5) owns the authoritative interest set in
 * production; this class is the consumer-facing primitive.
 */
export class OscInterestFilter {
  private readonly slots = new Set<string>();
  private dropped = 0;

  /** Mark a (channel, layer) as interesting. */
  add(channel: number, layer: number): void {
    this.slots.add(keyOf(channel, layer));
  }

  remove(channel: number, layer: number): void {
    this.slots.delete(keyOf(channel, layer));
  }

  clear(): void {
    this.slots.clear();
  }

  isAllocated(channel: number, layer: number): boolean {
    return this.slots.has(keyOf(channel, layer));
  }

  /** True if any layer on `channel` is in the interest set. */
  channelHasInterest(channel: number): boolean {
    const prefix = `${String(channel)}:`;
    for (const k of this.slots) {
      if (k.startsWith(prefix)) return true;
    }
    return false;
  }

  /**
   * Decide whether `event` is in-interest. If not, increment the drop
   * counter (for diagnostics) and return false.
   */
  shouldEmit(event: OscEvent): boolean {
    switch (event.kind) {
      case 'osc.framerate':
        if (this.channelHasInterest(event.channel)) return true;
        this.dropped++;
        return false;
      case 'osc.layer.foreground.producer':
      case 'osc.layer.foreground.file':
      case 'osc.layer.foreground.paused':
      case 'osc.layer.background.producer':
        if (this.isAllocated(event.channel, event.layer)) return true;
        this.dropped++;
        return false;
      case 'osc.health':
        return true;
    }
  }

  /** Cumulative count of out-of-interest events filtered. */
  get droppedCount(): number {
    return this.dropped;
  }

  /** Reset drop counter (telemetry hook). */
  resetDroppedCount(): void {
    this.dropped = 0;
  }
}

function keyOf(channel: number, layer: number): string {
  return `${String(channel)}:${String(layer)}`;
}
