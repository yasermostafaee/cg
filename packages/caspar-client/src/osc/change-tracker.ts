import type { OscEvent } from '@cg/shared-schema';

/**
 * Dispatch-on-change filter. CasparCG re-emits the same addresses every
 * channel tick; the Reconciler only needs to see actual state changes.
 *
 * Returns true if `event` differs from the last value for the same
 * `(kind, channel, layer)` key. The first observation always returns
 * true.
 */
export class OscChangeTracker {
  private readonly lastValue = new Map<string, string>();

  shouldEmit(event: OscEvent): boolean {
    const key = keyOf(event);
    const fingerprint = fingerprintOf(event);
    const prev = this.lastValue.get(key);
    if (prev === fingerprint) return false;
    this.lastValue.set(key, fingerprint);
    return true;
  }

  reset(): void {
    this.lastValue.clear();
  }
}

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

/**
 * Stable string fingerprint of the event's value-bearing fields. Keys are
 * already accounted for by `keyOf`, so only the changeable bits matter.
 */
function fingerprintOf(event: OscEvent): string {
  switch (event.kind) {
    case 'osc.framerate':
      return `${String(event.num)}/${String(event.den)}`;
    case 'osc.layer.foreground.producer':
    case 'osc.layer.background.producer':
      return event.producer;
    case 'osc.layer.foreground.file':
      return event.path;
    case 'osc.layer.foreground.paused':
      return String(event.paused);
    case 'osc.health':
      return `${String(event.healthy)}@${String(event.uptimeSec)}`;
  }
}
