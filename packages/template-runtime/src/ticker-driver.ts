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
 * D-028 two-loop model: this driver owns the INNER repeat loop —
 * `repeat: 'infinite' | N` crawl passes per run, with `cycleBoundary`
 * deciding the seam ('seamless' = the first item follows the last;
 * 'drain' = the band empties between passes). A finite run ends CLEANLY:
 * feeding stops after the Nth cycle's last item, and {@link whenComplete}
 * resolves once that item has fully exited the band — the scope's playout
 * controller awaits it for `holdSource: 'content-driven'` holds. The OUTER
 * loop (composition `loop-cycle` repeat) restarts the crawl each cycle: the
 * controller's hold entry resets + starts this driver, so every open/close
 * cycle replays the crawl from its entering edge.
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
  /**
   * D-045 — vertical placement of each crawl item within the band height. Mirrors the
   * scene-builder's static authoring row so authoring and the live crawl match. Defaults
   * to 'middle' (the prior hardcoded centring) when absent.
   */
  verticalAlign?: 'top' | 'middle' | 'bottom' | undefined;
  /** Crawl speed, px/s (> 0 by schema). */
  speed: number;
  /** Gap between items, px. */
  gap: number;
  /** Optional separator text rendered between items as its own neutral span. */
  separator?: string | undefined;
  /** Initial logical items (authored defaults; a bound list field replaces them). */
  items: TickerDriverItem[];
  /**
   * D-028 — the INNER repeat loop: crawl passes before this driver completes
   * ('infinite' = until stop()). A finite run always ends cleanly: feeding
   * stops after the Nth cycle's last item, and completion fires when that item
   * has FULLY exited the band — never cut mid-scroll.
   */
  repeat: number | 'infinite';
  /** 'seamless' = continuous treadmill; 'drain' = the band empties between cycles. */
  cycleBoundary: 'seamless' | 'drain';
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

/**
 * D-045 — vertical-align enum → flex `align-items` for a crawl item node. Mirrors the
 * scene-builder's `vAlignToFlex` (kept local to avoid a scene-builder→driver import cycle).
 * Defaults to 'middle' (the prior hardcoded centring) when absent.
 */
function tickerVAlignToFlex(v: 'top' | 'middle' | 'bottom' | undefined): string {
  const a = v ?? 'middle';
  return a === 'middle' ? 'center' : a === 'bottom' ? 'flex-end' : 'flex-start';
}

interface FedNode {
  node: HTMLElement;
  /** Abstract content offset (px from the content head). */
  o: number;
  w: number;
  /** Item id ('' for separator nodes). */
  id: string;
  /** The text this node currently renders (reconcile detects edits with it). */
  text: string;
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
  /**
   * Width cache keyed by text. First filled at/after fonts-ready and CLEARED
   * each time a content cycle completes (see {@link recycle}) — the per-pass
   * remeasure self-heal: a width measured mid-font-swap (e.g. an `update()`
   * whose new text triggers a lazy `unicode-range` face for the first time —
   * `update()` never re-awaits fonts) is corrected within one lap instead of
   * poisoning the crawl forever. Already-fed nodes keep their bookkept widths
   * (layout stays self-consistent); only future feeds and cycle math heal.
   */
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
  /** Cycles the feeder has STARTED (1-based once the first item feeds). */
  private cyclesStarted = 0;
  /** Finite repeat exhausted — nothing further will be fed this run. */
  private feedingDone = false;
  /** End offset (o + w) of the last fed node once `feedingDone`. */
  private finalEnd: number | null = null;
  private completed = false;
  private resolveComplete: (() => void) | null = null;
  private completion: Promise<void>;

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
    this.completion = new Promise<void>((res) => {
      this.resolveComplete = res;
    });
    const c = options.clock;
    this.clock = {
      raf: c?.raf ?? ((cb): number => requestAnimationFrame(cb)),
      cancel: c?.cancel ?? ((h): void => cancelAnimationFrame(h)),
      now: c?.now ?? ((): number => performance.now()),
    };
    // Default measurement: the COMPUTED used width — fractional (offsetWidth
    // rounds to ints, which would under/over-gap every boundary by ≤0.5px)
    // and in local layout px, so ancestor `transform: scale` (nested
    // composition instances) can't skew it. offsetWidth is the fallback for
    // environments without getComputedStyle width resolution.
    this.measure =
      options.measure ??
      ((node): number => {
        const win = node.ownerDocument.defaultView;
        if (win === null) return node.offsetWidth;
        const used = Number.parseFloat(win.getComputedStyle(node).width);
        return Number.isFinite(used) && used > 0 ? used : node.offsetWidth;
      });
  }

  /**
   * Start a crawl run. The playout controller's hold entry resets first
   * (`reset()` then `start()`), so every composition cycle replays the crawl
   * from its entering edge; within ONE hold the treadmill rolls continuously
   * through the ticker's own `repeat` passes.
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
    // Empty / zero-width content has nothing to crawl — it is complete by
    // definition (the old zero-length-pass parity), regardless of `repeat`.
    if (this.logical.length === 0 || this.cycleWidth() <= 0) {
      this.fireComplete();
    }
    this.step();
    this.scheduleFrame();
  }

  /**
   * D-028 — resolves when this run's finite `repeat` has fully played out
   * (the last item has completely exited the band). Never resolves for
   * `repeat: 'infinite'` (the scope then holds until `stop()`). A fresh
   * promise is minted per run (constructor + `reset()`).
   */
  whenComplete(): Promise<void> {
    return this.completion;
  }

  private fireComplete(): void {
    if (this.completed) return;
    this.completed = true;
    this.resolveComplete?.();
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

  /**
   * Full reset for a fresh `play()`: clear the fed stream and bookkeeping.
   * Also removes the static authoring layout — every play's intro shows the
   * same (empty) band the crawl then enters, instead of the first play
   * showing possibly-stale authored items that snap away at hold start.
   * The Designer canvas (which never plays) keeps the static row.
   */
  reset(): void {
    this.stop();
    for (const f of this.fed) this.release(f.node);
    this.fed = [];
    this.cycleSeams = [];
    this.nextIdx = 0;
    this.nextOffset = 0;
    this.hasFed = false;
    this.pausedAccumMs = 0;
    this.cyclesStarted = 0;
    this.feedingDone = false;
    this.finalEnd = null;
    // A fresh run gets a fresh completion (the controller awaits per hold).
    this.completed = false;
    this.completion = new Promise<void>((res) => {
      this.resolveComplete = res;
    });
    this.o.track.style.transform = '';
    this.o.band.querySelector('[data-cg-ticker-static]')?.remove();
  }

  destroy(): void {
    this.reset();
    this.destroyed = true;
  }

  /**
   * Reconcile to a new logical list by stable id — the `update()` path.
   * Entered nodes keep their leading edge; an entered item whose text changed
   * is updated IN PLACE (re-measured, downstream kept content shifted by
   * exactly the width delta — track-offset compensation, no jump); the
   * not-yet-visible fed tail is dropped and re-fed from the new list (so
   * removed items never appear, new items enter in order), resuming after the
   * last visible item's position in the NEW list.
   */
  setItems(items: TickerDriverItem[]): void {
    this.logical = items.map((i) => ({ id: i.id, text: i.text }));
    this.cycleWidthCache = null;
    if (!this.running) {
      // Pre-start (field default applied before play): the next start feeds
      // fresh; the static authoring layout re-renders so the canvas shows the
      // bound list, not the stale authored items.
      this.nextIdx = 0;
      this.rebuildStaticRow();
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
    // In-place edit: a kept (on-screen) item whose id survives with NEW text
    // is corrected immediately — broadcast crawls must fix headlines without
    // waiting a full cycle. Its leading edge stays fixed; every later kept
    // node (and seam) shifts by the width delta so spacing stays exact.
    for (let i = 0; i < this.fed.length; i += 1) {
      const f = this.fed[i];
      if (f === undefined || f.isSep) continue;
      const next = this.logical.find((it) => it.id === f.id);
      if (next === undefined || next.text === f.text) continue;
      const newW = this.measureText(next.text);
      const delta = newW - f.w;
      f.node.textContent = next.text;
      f.text = next.text;
      f.w = newW;
      this.position(f);
      if (delta !== 0) {
        for (let j = i + 1; j < this.fed.length; j += 1) {
          const g = this.fed[j];
          if (g === undefined) continue;
          g.o += delta;
          this.position(g);
        }
        this.cycleSeams = this.cycleSeams.map((s) => (s > f.o ? s + delta : s));
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
    // Never re-feed BEHIND the entering edge (a shrunk in-place edit can pull
    // the kept end before `d`; a node fed there would pop in mid-band — a
    // one-off wider gap is the lesser evil).
    this.nextOffset =
      lastKept !== undefined ? Math.max(lastKept.o + lastKept.w + this.o.gap, d) : d;
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
    // Clean end: a finite run completes when the LAST item has fully exited
    // the band — then this driver signals its scope and freezes (no re-entrant
    // stop(): the band is already empty, so no final paint is needed).
    if (!this.completed && this.feedingDone && this.finalEnd !== null && d >= this.finalEnd + V) {
      this.fireComplete();
      this.running = false;
      this.paused = false;
      this.cancelFrame();
    }
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
    if (this.logical.length === 0 || this.feedingDone) return;
    // Zero-width content (all-empty texts, gap 0, no separator) can never
    // advance the feed cursor — bail rather than loop forever.
    if (this.cycleWidth() <= 0) return;
    while (!this.feedingDone && this.nextOffset < d + this.o.viewportWidth + FEED_BUFFER_PX) {
      this.feedNext();
    }
  }

  private feedNext(): void {
    const idx = this.nextIdx % this.logical.length;
    const item = this.logical[idx];
    if (item === undefined) return;
    // The feeder is at the list head — a new content cycle would begin here.
    if (idx === 0) {
      // Finite repeat: refuse the (N+1)th cycle — the run ends cleanly once
      // the already-fed tail has fully exited (see step()).
      if (this.o.repeat !== 'infinite' && this.cyclesStarted >= this.o.repeat) {
        this.feedingDone = true;
        const last = this.fed[this.fed.length - 1];
        this.finalEnd = last !== undefined ? last.o + last.w : 0;
        return;
      }
      if (this.hasFed) {
        // 'drain': the next cycle's head may only enter once the previous
        // cycle's tail has fully exited — a viewport-width spacer guarantees
        // an empty band at the seam.
        if (this.o.cycleBoundary === 'drain') this.nextOffset += this.o.viewportWidth;
        this.cycleSeams.push(this.nextOffset);
      }
      this.cyclesStarted += 1;
    }
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
    // Separator glyphs like '*' or '•' sit high relative to the text baseline;
    // line-height 1 shrinks the separator's line box to the glyph so the
    // node's flex centering really centres it in the band. (Set per placement
    // — pooled nodes swap roles.)
    node.style.lineHeight = isSep ? '1' : '';
    const fedNode: FedNode = { node, o: this.nextOffset, w, id, text, isSep };
    this.position(fedNode);
    this.fed.push(fedNode);
    this.nextOffset += w + this.o.gap;
  }

  /** Write a fed node's CSS position from its abstract offset + width. */
  private position(f: FedNode): void {
    f.node.style.left = this.o.direction === 'ltr' ? `${f.o}px` : `${-(f.o + f.w)}px`;
  }

  private recycle(d: number): void {
    const limit = d - RECYCLE_SLACK_PX;
    while (this.fed.length > 0) {
      const head = this.fed[0];
      if (head === undefined || head.o + head.w + this.o.viewportWidth > limit) break;
      this.fed.shift();
      this.release(head.node);
    }
    // Passed seams can't end a future pass — prune them (memory bound), and
    // remeasure on the next cycle: a completed lap invalidates the width
    // cache so font swaps triggered mid-flight self-heal within one cycle.
    let cycleCompleted = false;
    while (this.cycleSeams.length > 0) {
      const s = this.cycleSeams[0];
      if (s === undefined || s + this.o.viewportWidth > d) break;
      this.cycleSeams.shift();
      cycleCompleted = true;
    }
    if (cycleCompleted) {
      this.widthCache.clear();
      this.cycleWidthCache = null;
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

  /**
   * Re-render the static authoring layout from the current logical list (the
   * Designer canvas path: a list-field default replaces the authored items
   * before any play, and the canvas must show the bound data).
   */
  private rebuildStaticRow(): void {
    const row = this.o.band.querySelector<HTMLElement>('[data-cg-ticker-static]');
    if (row === null) return;
    populateTickerStaticRow(row, this.logical, {
      direction: this.o.direction,
      gap: this.o.gap,
      separator: this.o.separator,
    });
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
    // D-045 — vertical placement of the crawl text, mirroring the scene-builder's static
    // authoring row. Default 'middle' = the prior hardcoded centring (non-breaking).
    node.style.alignItems = tickerVAlignToFlex(this.o.verticalAlign);
    node.style.whiteSpace = 'pre';
    node.style.direction = this.o.direction;
    node.style.unicodeBidi = 'isolate';
    return node;
  }
}

/**
 * (Re)populate a ticker's static authoring row: bidi-isolated spans in
 * reading-direction flex order, spaced with per-span margins rather than flex
 * `column-gap`/`inset` (both above the exported single-file's CEF floor —
 * CasparCG 2.2/2.3 ship CEF 63/71). Shared by the scene-builder (initial
 * build) and the driver (pre-start reconcile), so the two can't drift.
 */
export function populateTickerStaticRow(
  row: HTMLElement,
  items: readonly TickerDriverItem[],
  opts: { direction: 'ltr' | 'rtl'; gap: number; separator?: string | undefined },
): void {
  const doc = row.ownerDocument;
  while (row.firstChild !== null) row.removeChild(row.firstChild);
  const addSpan = (text: string, first: boolean, isSep: boolean): void => {
    const span = doc.createElement('span');
    span.style.whiteSpace = 'pre';
    span.style.direction = opts.direction;
    span.style.unicodeBidi = 'isolate';
    span.style.flexShrink = '0';
    if (isSep) {
      // Centre high-riding separator glyphs ('*', '•') in the band regardless
      // of baseline: shrink the line box to the glyph and let the row's flex
      // centring place it.
      span.style.lineHeight = '1';
      span.style.alignSelf = 'center';
    }
    if (!first) {
      // The gap faces the PREVIOUS item: in an rtl row the next item sits to
      // the left, so its gap is its right margin; ltr is the mirror.
      if (opts.direction === 'rtl') span.style.marginRight = `${opts.gap}px`;
      else span.style.marginLeft = `${opts.gap}px`;
    }
    span.textContent = text;
    row.appendChild(span);
  };
  items.forEach((item, i) => {
    if (i > 0 && opts.separator !== undefined && opts.separator !== '') {
      addSpan(opts.separator, false, true);
    }
    addSpan(item.text, i === 0, false);
  });
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
