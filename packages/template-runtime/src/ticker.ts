import type { Element as SceneElement } from '@cg/shared-schema';

/**
 * Ticker loop runtime (Phase 8 §11 / M8.1).
 *
 * The Phase 3 §5 `LoopPreset.kind === 'ticker'` describes a marquee:
 *   - speed: px/s at the project's frame rate
 *   - direction: 'ltr' | 'rtl'
 *   - pauseOnHover?: boolean
 *
 * The wrap is seamless because the *track* contains two stacked copies
 * of the original content; the viewport shows exactly one copy at any
 * given offset. When the track has translated by one content-width,
 * the second copy is in the position the first started in — snap back
 * to zero and the scroll continues without a visible seam.
 *
 * Direction conventions match the editorial intent, not the CSS axis:
 *
 *   - direction='ltr' → content reads left-to-right; the marquee
 *                       *moves right-to-left* (offset goes from 0 → -w,
 *                       new content enters from the right edge).
 *   - direction='rtl' → content reads right-to-left (Persian/Arabic);
 *                       the marquee *moves left-to-right* (offset
 *                       goes from -w → 0, new content enters from the
 *                       left edge).
 *
 * Mixed RTL/LTR works because the *individual tokens* inside the
 * content can have their own `dir` attributes; the ticker only
 * translates the outer track and doesn't re-shape its children.
 */

export interface TickerOptions {
  /** Pixels per second along the marquee axis. Must be positive. */
  speedPxPerSec: number;
  /** Direction the *content* reads, not the direction it moves. */
  direction: 'ltr' | 'rtl';
  /** Optional: pause the marquee while the pointer is over the element. */
  pauseOnHover?: boolean;
  /** Override rAF scheduler — used by tests to step frames deterministically. */
  raf?: (cb: (timestamp: number) => void) => number;
  /** Override rAF canceller — paired with `raf`. */
  cancelRaf?: (handle: number) => void;
  /** Clock override for tests. Defaults to `performance.now()`. */
  now?: () => number;
}

export interface TickerHandle {
  /** Stop the rAF loop and unwrap the DOM to its original state. */
  dispose(): void;
  /** Pause the loop without unwrapping. `resume()` continues from the same offset. */
  pause(): void;
  /** Resume after `pause()`. No-op if already running. */
  resume(): void;
  /** Current track offset in pixels. Exposed for tests. */
  offset(): number;
}

const TRACK_CLASS = 'cg-ticker-track';
const ITEM_CLASS = 'cg-ticker-item';

/**
 * Install a ticker on a host element. Wraps its existing children in a
 * two-copy track, starts the rAF loop, and returns a handle. The host's
 * `overflow` is set to `hidden` so the off-screen copy is clipped.
 *
 * `dispose()` restores the original DOM exactly — the host is
 * re-usable for re-installs (e.g. when the operator changes the
 * ticker's speed without rebuilding the scene).
 */
export function installTicker(host: HTMLElement, options: TickerOptions): TickerHandle {
  if (options.speedPxPerSec <= 0) {
    throw new Error('ticker speed must be > 0');
  }
  const doc = host.ownerDocument;
  const raf = options.raf ?? ((cb): number => window.requestAnimationFrame(cb));
  const cancelRaf = options.cancelRaf ?? ((h): void => window.cancelAnimationFrame(h));
  const now = options.now ?? ((): number => performance.now());

  // Snapshot the original children so dispose() can put them back.
  const originalChildren = [...host.childNodes];
  const originalOverflow = host.style.overflow;

  // Build [track [item-A][item-B]] structure. Each item gets a clone of
  // the original children so identical bindings keep their styles.
  const track = doc.createElement('div');
  track.className = TRACK_CLASS;
  track.style.display = 'inline-flex';
  track.style.whiteSpace = 'nowrap';
  track.style.willChange = 'transform';
  // gap:0 so the seam is invisible when the second copy meets the first.
  track.style.gap = '0';

  const itemA = doc.createElement('span');
  itemA.className = ITEM_CLASS;
  itemA.style.display = 'inline-block';
  itemA.style.whiteSpace = 'nowrap';
  for (const child of originalChildren) itemA.appendChild(child.cloneNode(true));

  const itemB = itemA.cloneNode(true) as HTMLElement;

  track.appendChild(itemA);
  track.appendChild(itemB);

  // Clear the host and install the track.
  while (host.firstChild) host.removeChild(host.firstChild);
  host.style.overflow = 'hidden';
  host.appendChild(track);

  // Measure once after the DOM is in place. The width can shift if the
  // operator binds a longer string mid-flight; that's M9 work (observe
  // text changes + re-measure).
  let itemWidth = itemA.getBoundingClientRect().width || itemA.offsetWidth;
  // happy-dom returns 0 for getBoundingClientRect — fall back to a
  // reasonable assumption so the rAF loop still advances in tests.
  if (itemWidth === 0) itemWidth = 200;

  // Offset is the LEFT edge of itemA relative to the track origin. We
  // *translate the track* by `offset`, so visible viewport position of
  // the first character of itemA equals `host left + offset`.
  let offset = options.direction === 'rtl' ? -itemWidth : 0;
  let lastTimestamp = now();
  let rafHandle: number | null = null;
  let paused = false;

  function applyTransform(): void {
    track.style.transform = `translate3d(${String(offset)}px, 0, 0)`;
  }
  applyTransform();

  function step(): void {
    if (paused) {
      rafHandle = null;
      return;
    }
    const t = now();
    const dt = (t - lastTimestamp) / 1000; // seconds
    lastTimestamp = t;
    const dx = options.speedPxPerSec * dt;

    if (options.direction === 'ltr') {
      // marquee moves right-to-left; offset decreases from 0 toward -w
      offset -= dx;
      if (offset <= -itemWidth) {
        offset += itemWidth; // seamless snap
      }
    } else {
      // marquee moves left-to-right; offset increases from -w toward 0
      offset += dx;
      if (offset >= 0) {
        offset -= itemWidth; // seamless snap
      }
    }
    applyTransform();
    rafHandle = raf(step);
  }

  let cleanups: (() => void)[] = [];
  if (options.pauseOnHover === true) {
    const onEnter = (): void => {
      paused = true;
    };
    const onLeave = (): void => {
      if (paused) {
        paused = false;
        lastTimestamp = now();
        if (rafHandle === null) rafHandle = raf(step);
      }
    };
    host.addEventListener('pointerenter', onEnter);
    host.addEventListener('pointerleave', onLeave);
    cleanups.push(() => host.removeEventListener('pointerenter', onEnter));
    cleanups.push(() => host.removeEventListener('pointerleave', onLeave));
  }

  rafHandle = raf(step);

  return {
    dispose(): void {
      if (rafHandle !== null) {
        cancelRaf(rafHandle);
        rafHandle = null;
      }
      for (const c of cleanups) c();
      cleanups = [];
      host.removeChild(track);
      host.style.overflow = originalOverflow;
      for (const child of originalChildren) host.appendChild(child);
    },
    pause(): void {
      if (paused) return;
      paused = true;
      if (rafHandle !== null) {
        cancelRaf(rafHandle);
        rafHandle = null;
      }
    },
    resume(): void {
      if (!paused) return;
      paused = false;
      lastTimestamp = now();
      rafHandle = raf(step);
    },
    offset(): number {
      return offset;
    },
  };
}

/**
 * Should we install a ticker for this element? Returns the typed
 * preset when yes, null otherwise. Pure predicate so the runtime
 * doesn't need to repeat the discriminator dance.
 */
export function tickerPresetFor(
  element: SceneElement,
): { speed: number; direction: 'ltr' | 'rtl'; pauseOnHover?: boolean } | null {
  const loop = element.animation?.loop;
  if (loop === undefined || loop.kind !== 'ticker') return null;
  const result: { speed: number; direction: 'ltr' | 'rtl'; pauseOnHover?: boolean } = {
    speed: loop.speed,
    direction: loop.direction,
  };
  if (loop.pauseOnHover !== undefined) result.pauseOnHover = loop.pauseOnHover;
  return result;
}
