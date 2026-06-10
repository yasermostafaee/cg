import type { RuntimeClock } from './types.js';

/**
 * D-028 — the ticker/crawler treadmill.
 *
 * One driver owns one ticker element's crawl: a virtualized feed of item
 * nodes over an inner "track" translated via `transform: translateX` (no
 * per-frame relayout; transforms are direction-agnostic under CSS
 * `direction`, so motion is deterministic). Item widths are measured once
 * per text (cached) — valid because the first measurement happens at/after
 * `play()`, which awaits `document.fonts.ready`.
 *
 * Coordinates: `d` is the distance the content has travelled (px, grows with
 * active time = `speed × elapsed`). Every fed node has an abstract content
 * offset `o` (px from the content-stream head, along reading order). A point
 * at offset `o` has fully crossed the band when `d ≥ o + viewportWidth`; a
 * node of width `w` has fully exited when `d ≥ o + w + viewportWidth` — the
 * same algebra for both directions (only the CSS mapping differs):
 *   - `ltr`: node CSS `left = o`, track `translateX(viewportWidth − d)`
 *     (content enters from the band's right edge, moving left);
 *   - `rtl`: node CSS `left = −(o + w)`, track `translateX(d)` (content
 *     enters from the band's left edge, moving right — the Persian crawl).
 *
 * The treadmill is SEAMLESS: after the last item the first follows again
 * (gap/separator preserved), and it rolls continuously across playout pass
 * boundaries — the playout controller starts it on the first hold
 * (`onHoldStart`) and only `pause()`/`stop()`/`reset()` interrupt it. Pass
 * accounting lives in {@link passRemainingMs}: cycle seams (the offset where
 * cycle k+1 begins) are recorded as the feeder wraps, so "ms until the
 * current content cycle completes" self-corrects for time consumed by
 * intro/outro replays between passes.
 */

/** A normalized ticker item — the reconcile unit. */
export interface TickerDriverItem {
  id: string;
  text: string;
}

export interface TickerDriverOptions {
  /** The clipped band element (the viewport). */
  band: HTMLElement;
  /** The inner track the driver feeds and translates. */
  track: HTMLElement;
  /**
   * Band width in scene px, from the element's transform — NOT a DOM read,
   * so ancestor `transform: scale` (nested composition instances) can't skew it.
   */
  viewportWidth: number;
  /** READING direction ('rtl' = Persian crawl: layout RTL, motion left→right). */
  direction: 'ltr' | 'rtl';
  /** Crawl speed, px/s (> 0 by schema). */
  speed: number;
  /** Gap between items, px. */
  gap: number;
  /** Optional separator text rendered between items as its own neutral span. */
  separator?: string | undefined;
  /** Initial logical items (authored defaults; a bound list field replaces them). */
  items: TickerDriverItem[];
  clock?: RuntimeClock | undefined;
  /**
   * Injectable width measurement (defaults to `offsetWidth` — layout px,
   * immune to ancestor transform scale). Tests inject deterministic widths
   * (happy-dom has no layout engine).
   */
  measure?: ((node: HTMLElement) => number) | undefined;
}

/** Feed ahead of the entering edge by this many px so items never pop in. */
const FEED_BUFFER_PX = 256;
/** Keep exited nodes this many px past the edge before recycling. */
const RECYCLE_SLACK_PX = 64;

interface FedNode {
  node: HTMLElement;
  /** Abstract content offset (px from the content head). */
  o: number;
  w: number;
  /** Item id ('' for separator nodes). */
  id: string;
  isSep: boolean;
}

interface NormalizedDriverClock {
  raf: (cb: (timestamp: number) => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
}

export class TickerDriver {
  private readonly o: TickerDriverOptions;
  private readonly clock: NormalizedDriverClock;
  private readonly measure: (node: HTMLElement) => number;

  private logical: TickerDriverItem[];
  /** Width cache keyed by text — measured once, at/after fonts-ready. */
  private readonly widthCache = new Map<string, number>();
  private measureNode: HTMLElement | null = null;

  private fed: FedNode[] = [];
  private readonly pool: HTMLElement[] = [];
  /** Index into `logical` of the next item to feed. */
  private nextIdx = 0;
  /** Abstract offset where the next fed node begins. */
  private nextOffset = 0;
  /** Offsets where cycle k+1 begins (recorded as the feeder wraps). */
  private cycleSeams: number[] = [];
  private hasFed = false;

  private running = false;
  private paused = false;
  private destroyed = false;
  private startedAt = 0;
  private pausedAt = 0;
  private pausedAccumMs = 0;
  private rafHandle: number | null = null;

  private cycleWidthCache: number | null = null;

  constructor(options: TickerDriverOptions) {
    this.o = options;
    this.logical = options.items.map((i) => ({ id: i.id, text: i.text }));
    const c = options.clock;
    this.clock = {
      raf: c?.raf ?? ((cb): number => requestAnimationFrame(cb)),
      cancel: c?.cancel ?? ((h): void => cancelAnimationFrame(h)),
      now: c?.now ?? ((): number => performance.now()),
    };
    this.measure = options.measure ?? ((node): number => node.offsetWidth);
  }

  /**
   * Start the treadmill (idempotent — the playout controller fires this at
   * EVERY hold entry, and the crawl must roll continuously across pass
   * boundaries, so a running driver ignores repeat starts).
   */
  start(): void {
    if (this.destroyed || this.running) return;
    this.running = true;
    this.paused = false;
    this.startedAt = this.clock.now();
    this.pausedAccumMs = 0;
    // The crawl replaces the static authoring layout the scene-builder
    // rendered for the canvas (content now enters from the band edge).
    this.o.band.querySelector('[data-cg-ticker-static]')?.remove();
    this.step();
    this.scheduleFrame();
  }

  /** Freeze the crawl (lockstep with the playout controller's hold timer). */
  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.pausedAt = this.clock.now();
    this.cancelFrame();
  }

  /** Continue from exactly the frozen offset. */
  resume(): void {
    if (!this.running || !this.paused) return;
    this.pausedAccumMs += this.clock.now() - this.pausedAt;
    this.paused = false;
    this.scheduleFrame();
  }

  /** Stop rolling, freezing the DOM at the stop moment (scope settled). */
  stop(): void {
    if (this.running && !this.paused) this.step(); // paint the exact final offset
    this.running = false;
    this.paused = false;
    this.cancelFrame();
  }

  /** Full reset for a fresh `play()`: clear the fed stream and bookkeeping. */
  reset(): void {
    this.stop();
    for (const f of this.fed) this.release(f.node);
    this.fed = [];
    this.cycleSeams = [];
    this.nextIdx = 0;
    this.nextOffset = 0;
    this.hasFed = false;
    this.pausedAccumMs = 0;
    this.o.track.style.transform = '';
  }

  destroy(): void {
    this.reset();
    this.destroyed = true;
  }

  /**
   * D-028 / D-020 — the content-driven duration supply: remaining ms until
   * the CURRENT content cycle's seam fully crosses the band. First pass ≈
   * `(viewportWidth + cycleWidth) / speed × 1000`; later calls self-correct
   * for whatever time intro/outro replays consumed (the crawl kept rolling).
   * Empty content ⇒ 0 (a zero-length pass — D-020's "absent hook" semantics).
   */
  passRemainingMs(): number {
    if (this.logical.length === 0) return 0;
    const cw = this.cycleWidth();
    if (cw <= 0) return 0;
    const d = this.distance();
    const V = this.o.viewportWidth;
    // First recorded seam still ahead of the playhead…
    for (const seam of this.cycleSeams) {
      if (seam + V > d) return ((seam + V - d) / this.o.speed) * 1000;
    }
    // …else project past the known feed with the CURRENT cycle width.
    let seam =
      this.cycleSeams.length > 0 ? (this.cycleSeams[this.cycleSeams.length - 1] ?? 0) + cw : cw;
    while (seam + V <= d) seam += cw;
    return ((seam + V - d) / this.o.speed) * 1000;
  }

  /**
   * Reconcile to a new logical list by stable id — the `update()` path.
   * Nothing on screen moves: nodes already entered keep their position and
   * play out; the not-yet-visible fed tail is dropped and re-fed from the new
   * list (so removed items never appear, new items enter in order), resuming
   * after the last visible item's position in the NEW list.
   */
  setItems(items: TickerDriverItem[]): void {
    this.logical = items.map((i) => ({ id: i.id, text: i.text }));
    this.cycleWidthCache = null;
    if (!this.running) {
      // Pre-start (field default applied before play): next start feeds fresh.
      this.nextIdx = 0;
      return;
    }
    const d = this.distance();
    // Split the fed stream at the entering edge: keep everything that has
    // started entering (o < d); a separator glued to a kept item stays too.
    let k = this.fed.findIndex((f) => f.o >= d);
    if (k >= 0 && this.fed[k]?.isSep === true) k += 1;
    if (k >= 0 && k < this.fed.length) {
      const dropped = this.fed.splice(k);
      for (const f of dropped) this.release(f.node);
      const firstDropped = dropped[0];
      if (firstDropped !== undefined) {
        this.cycleSeams = this.cycleSeams.filter((s) => s < firstDropped.o);
      }
    }
    // Resume feeding after the last kept ITEM as positioned in the new list;
    // a kept item that was removed falls back to scanning earlier kept items,
    // then to the list head.
    let resume = 0;
    for (let i = this.fed.length - 1; i >= 0; i -= 1) {
      const f = this.fed[i];
      if (f === undefined || f.isSep) continue;
      const idx = this.logical.findIndex((it) => it.id === f.id);
      if (idx >= 0) {
        resume = (idx + 1) % this.logical.length;
        break;
      }
    }
    this.nextIdx = this.logical.length > 0 ? resume : 0;
    const lastKept = this.fed[this.fed.length - 1];
    this.nextOffset = lastKept !== undefined ? lastKept.o + lastKept.w + this.o.gap : d;
    this.step();
  }

  // — internals ————————————————————————————————————————————————————————

  /** Distance travelled (px) over ACTIVE time (pauses excluded). */
  private distance(): number {
    if (!this.running) return 0;
    const nowMs = this.paused ? this.pausedAt : this.clock.now();
    return ((nowMs - this.startedAt - this.pausedAccumMs) / 1000) * this.o.speed;
  }

  /** One animation step: translate the track, feed ahead, recycle behind. */
  private step(): void {
    const d = this.distance();
    const V = this.o.viewportWidth;
    // ltr: content head starts just off the RIGHT edge and moves left;
    // rtl: head starts just off the LEFT edge and moves right (Persian crawl).
    this.o.track.style.transform =
      this.o.direction === 'ltr' ? `translateX(${V - d}px)` : `translateX(${d}px)`;
    this.ensureFed(d);
    this.recycle(d);
  }

  private scheduleFrame(): void {
    this.rafHandle = this.clock.raf(() => {
      this.rafHandle = null;
      if (!this.running || this.paused) return;
      this.step();
      this.scheduleFrame();
    });
  }

  private cancelFrame(): void {
    if (this.rafHandle !== null) {
      this.clock.cancel(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private ensureFed(d: number): void {
    if (this.logical.length === 0) return;
    // Zero-width content (all-empty texts, gap 0, no separator) can never
    // advance the feed cursor — bail rather than loop forever.
    if (this.cycleWidth() <= 0) return;
    while (this.nextOffset < d + this.o.viewportWidth + FEED_BUFFER_PX) {
      this.feedNext();
    }
  }

  private feedNext(): void {
    const idx = this.nextIdx % this.logical.length;
    const item = this.logical[idx];
    if (item === undefined) return;
    // The feeder wrapped back to the list head — a new content cycle begins
    // here; its completion (seam + viewport crossed) ends the previous pass.
    if (idx === 0 && this.hasFed) this.cycleSeams.push(this.nextOffset);
    this.nextIdx = (idx + 1) % this.logical.length;
    this.hasFed = true;

    this.placeFed(item.text, item.id, false);
    const sep = this.o.separator;
    if (sep !== undefined && sep !== '') this.placeFed(sep, '', true);
  }

  private placeFed(text: string, id: string, isSep: boolean): void {
    const w = this.measureText(text);
    const node = this.acquire();
    node.textContent = text;
    node.style.left =
      this.o.direction === 'ltr' ? `${this.nextOffset}px` : `${-(this.nextOffset + w)}px`;
    this.fed.push({ node, o: this.nextOffset, w, id, isSep });
    this.nextOffset += w + this.o.gap;
  }

  private recycle(d: number): void {
    const limit = d - RECYCLE_SLACK_PX;
    while (this.fed.length > 0) {
      const head = this.fed[0];
      if (head === undefined || head.o + head.w + this.o.viewportWidth > limit) break;
      this.fed.shift();
      this.release(head.node);
    }
    // Passed seams can't end a future pass — prune them (memory bound).
    while (this.cycleSeams.length > 0) {
      const s = this.cycleSeams[0];
      if (s === undefined || s + this.o.viewportWidth > d) break;
      this.cycleSeams.shift();
    }
  }

  /** One full content cycle's width with the CURRENT items (incl. gaps/separators). */
  private cycleWidth(): number {
    if (this.cycleWidthCache !== null) return this.cycleWidthCache;
    const sep = this.o.separator;
    const sepBlock = sep !== undefined && sep !== '' ? this.measureText(sep) + this.o.gap : 0;
    let total = 0;
    for (const item of this.logical) {
      total += this.measureText(item.text) + this.o.gap + sepBlock;
    }
    this.cycleWidthCache = total;
    return total;
  }

  private measureText(text: string): number {
    const cached = this.widthCache.get(text);
    if (cached !== undefined) return cached;
    if (this.measureNode === null) {
      this.measureNode = this.makeItemNode();
      this.measureNode.style.visibility = 'hidden';
      this.measureNode.style.left = '0';
      this.o.track.appendChild(this.measureNode);
    }
    this.measureNode.textContent = text;
    const w = this.measure(this.measureNode);
    this.widthCache.set(text, w);
    return w;
  }

  private acquire(): HTMLElement {
    const node = this.pool.pop() ?? this.makeItemNode();
    this.o.track.appendChild(node);
    return node;
  }

  private release(node: HTMLElement): void {
    node.remove();
    this.pool.push(node);
  }

  /**
   * An item span: absolutely positioned from measured offsets (so inline-flow
   * bidi can never reorder ITEMS), bidi-isolated and given the element's
   * direction (so weak/neutral characters at the item's edges resolve INSIDE
   * the item — embedded LTR runs in Persian text shape correctly via the
   * browser's native shaping, per ADR 0003). `white-space: pre` keeps
   * separator padding like ' • ' intact and forbids wrapping.
   */
  private makeItemNode(): HTMLElement {
    const doc = this.o.track.ownerDocument;
    const node = doc.createElement('span');
    node.dataset['cgTickerItem'] = '1';
    node.style.position = 'absolute';
    node.style.top = '0';
    node.style.height = '100%';
    node.style.display = 'flex';
    node.style.alignItems = 'center';
    node.style.whiteSpace = 'pre';
    node.style.direction = this.o.direction;
    node.style.unicodeBidi = 'isolate';
    return node;
  }
}

/**
 * Band-node → driver registry, so the bindings applier (which only sees the
 * element map) can route a `ticker-items` field value to the right driver.
 */
const registry = new WeakMap<HTMLElement, TickerDriver>();

export function registerTickerDriver(band: HTMLElement, driver: TickerDriver): void {
  registry.set(band, driver);
}

export function tickerDriverFor(band: HTMLElement): TickerDriver | undefined {
  return registry.get(band);
}

/**
 * Normalize a `list` field value (or a bare string array — degraded
 * positional-id fallback, jump-free only for appends) into driver items.
 */
export function coerceTickerItems(raw: readonly unknown[]): TickerDriverItem[] {
  return raw.map((v, i) => {
    if (typeof v === 'string') return { id: `item-${String(i)}`, text: v };
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const id = typeof o['id'] === 'string' && o['id'] !== '' ? o['id'] : `item-${String(i)}`;
      const text = typeof o['text'] === 'string' ? o['text'] : '';
      return { id, text };
    }
    return { id: `item-${String(i)}`, text: '' };
  });
}
