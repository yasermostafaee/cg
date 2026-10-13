import type { OscEvent } from '@cg/shared-schema';

/** A media clip's clock on one layer, as the server last REPORTED it. */
export interface ClipTime {
  /** Seconds played — `file/time[0]`. At the end of a clip that is not looping it stands at `total`. */
  readonly elapsed: number;
  /** The file's length in seconds — `file/time[1]`. */
  readonly total: number;
  /** `foreground/paused`, when the server has said it; `undefined` until it has. */
  readonly paused: boolean | undefined;
  /** Wall-clock ms the time was last reported. */
  readonly at: number;
}

/**
 * 🔴 `MEDIA-PLATES-01` — **A MEDIA CLIP'S CLOCK, PER LAYER, AS THE SERVER REPORTS IT — and nothing
 * the bridge estimates.**
 *
 * CasparCG 2.5.0's ffmpeg producer publishes `/channel/N/stage/layer/L/foreground/file/time`
 * (elapsed, length — seconds) every frame, and the layer publishes `foreground/paused`. The console
 * shows a clip's remaining time and whether it ended from THIS, and only from this: a server that does
 * not report a clip's time leaves the tap empty for that layer, and the console then shows no number
 * at all. Never a guess from when a `PLAY` was sent.
 *
 * A passive tap, like `OscOccupancyTap` and `OscChannelTickTap`: fed every parsed event before the
 * interest filter, adding nothing to the dispatched stream (the interest filter never dispatches a
 * `file/time` — it changes every frame and no consumer of the stream reads it).
 *
 * A layer whose producer is reported as anything but `ffmpeg` is forgotten, so a clip's last clock
 * never outlives the clip. `reset()` forgets everything: after a reconnect nothing is known.
 */
export class OscClipTimeTap {
  private readonly byLayer = new Map<string, ClipTime>();
  private readonly pausedByLayer = new Map<string, boolean>();

  note(event: OscEvent, at: number): void {
    switch (event.kind) {
      case 'osc.layer.foreground.time': {
        const key = keyOf(event.channel, event.layer);
        this.byLayer.set(key, {
          elapsed: event.elapsed,
          total: event.total,
          paused: this.pausedByLayer.get(key),
          at,
        });
        return;
      }
      case 'osc.layer.foreground.paused': {
        const key = keyOf(event.channel, event.layer);
        this.pausedByLayer.set(key, event.paused);
        const held = this.byLayer.get(key);
        if (held !== undefined) this.byLayer.set(key, { ...held, paused: event.paused });
        return;
      }
      case 'osc.layer.foreground.producer':
        if (event.producer !== 'ffmpeg') {
          const key = keyOf(event.channel, event.layer);
          this.byLayer.delete(key);
          this.pausedByLayer.delete(key);
        }
        return;
      default:
        return;
    }
  }

  /**
   * The clip's clock on this layer if the server reported it within `staleMs`, else `null` — "no
   * evidence", never "no clip". A caller shows a number only when this answers one.
   */
  read(channel: number, layer: number, staleMs: number, now: number = Date.now()): ClipTime | null {
    const time = this.byLayer.get(keyOf(channel, layer));
    if (time === undefined || now - time.at > staleMs) return null;
    return time;
  }

  /** Forget everything — a new session knows nothing about any clip. */
  reset(): void {
    this.byLayer.clear();
    this.pausedByLayer.clear();
  }
}

function keyOf(channel: number, layer: number): string {
  return `${String(channel)}:${String(layer)}`;
}
