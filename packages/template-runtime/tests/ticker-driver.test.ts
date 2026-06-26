import { beforeEach, describe, expect, it } from 'vitest';
import {
  TickerDriver,
  coerceTickerItems,
  type TickerDriverItem,
  type TickerDriverOptions,
} from '../src/ticker-driver.js';

/** Fake rAF + timer clock (same pattern as the playout-controller tests). */
function makeClock() {
  let ms = 0;
  let rafQueue: ((ts: number) => void)[] = [];
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancel: () => {
      rafQueue = [];
    },
    /** Advance time, then flush one rAF round (the driver re-schedules per round). */
    advance: (delta: number) => {
      ms += delta;
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

/** Deterministic width: 10px per code unit (happy-dom has no layout engine). */
const measure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

// Fixture: viewport 400, speed 100 px/s, gap 10, no separator.
// 'a'×10 → 100px, 'b'×20 → 200px ⇒ cycleWidth = (100+10) + (200+10) = 320.
const itemA = { id: 'a', text: 'aaaaaaaaaa' };
const itemB = { id: 'b', text: 'bbbbbbbbbbbbbbbbbbbb' };

interface Harness {
  driver: TickerDriver;
  band: HTMLElement;
  track: HTMLElement;
  clock: ReturnType<typeof makeClock>;
}

function make(overrides: Partial<TickerDriverOptions> = {}): Harness {
  const band = document.createElement('div');
  const track = document.createElement('div');
  band.appendChild(track);
  document.body.appendChild(band);
  const clock = makeClock();
  const driver = new TickerDriver({
    band,
    track,
    viewportWidth: 400,
    direction: 'rtl',
    speed: 100,
    gap: 10,
    items: [itemA, itemB],
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    clock,
    measure,
    ...overrides,
  });
  return { driver, band, track, clock };
}

/** Tracks a run's completion promise as a synchronously inspectable flag. */
function completionFlag(driver: TickerDriver): { readonly done: boolean } {
  const state = { done: false };
  void driver.whenComplete().then(() => {
    state.done = true;
  });
  return state;
}

/** Completion resolutions land on microtasks — drain them between advances. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

/** Texts of the currently fed (non-measure) item spans, in feed order. */
function fedTexts(track: HTMLElement): string[] {
  return [...track.querySelectorAll<HTMLElement>('[data-cg-ticker-item]')]
    .filter((n) => n.style.visibility !== 'hidden')
    .map((n) => n.textContent ?? '');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('TickerDriver — vertical align of crawl item nodes (D-045)', () => {
  /** First VISIBLE fed item node (the hidden measure node is filtered out). */
  function fedItem(track: HTMLElement): HTMLElement | undefined {
    return [...track.querySelectorAll<HTMLElement>('[data-cg-ticker-item]')].find(
      (n) => n.style.visibility !== 'hidden',
    );
  }
  it('item nodes use the element verticalAlign (top → flex-start), not a hardcoded centre', () => {
    const h = make({ verticalAlign: 'top' });
    h.driver.start();
    expect(fedItem(h.track)?.style.alignItems).toBe('flex-start');
  });
  it('bottom → flex-end', () => {
    const h = make({ verticalAlign: 'bottom' });
    h.driver.start();
    expect(fedItem(h.track)?.style.alignItems).toBe('flex-end');
  });
  it('defaults to centre when verticalAlign is absent (non-breaking, the prior behaviour)', () => {
    const h = make();
    h.driver.start();
    expect(fedItem(h.track)?.style.alignItems).toBe('center');
  });
});

describe('TickerDriver — completion (the inner repeat loop, D-028)', () => {
  // Fixture math: items a(100px) + b(200px), gap 10 ⇒ cycle layout
  // a@0, b@110 | a@320, b@430 … Finite repeat 2: feeding stops after the 2nd
  // cycle's b (finalEnd = 430+200 = 630); the run completes when that item has
  // FULLY exited: d ≥ 630 + 400 (viewport) = 1030px ⇒ 10300 ms @ 100px/s.
  it('finite repeat completes exactly when the LAST item has fully exited (clean end)', async () => {
    const h = make({ repeat: 2 });
    const done = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(10_290); // d = 1029 — the tail is 1px from gone
    await flush();
    expect(done.done).toBe(false);
    h.clock.advance(20); // d = 1031 — fully exited
    await flush();
    expect(done.done).toBe(true);
  });

  it('longer content ⇒ proportionally later completion (duration stays content-driven)', async () => {
    const h = make({
      repeat: 1,
      items: [
        { id: 'a', text: 'a'.repeat(20) }, // 200px
        { id: 'b', text: 'b'.repeat(40) }, // 400px
      ],
    });
    // One cycle: a@0(200), b@210(400) ⇒ finalEnd 610 ⇒ complete at d ≥ 1010.
    const done = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(10_090);
    await flush();
    expect(done.done).toBe(false);
    h.clock.advance(20);
    await flush();
    expect(done.done).toBe(true);
  });

  it('never feeds a cycle past the finite repeat (the band ends EMPTY)', () => {
    const h = make({ repeat: 1 });
    h.driver.start();
    h.clock.advance(60_000); // far beyond the single pass
    expect(fedTexts(h.track)).toEqual([]); // everything recycled, nothing re-fed
  });

  // D-081 — the separator goes BETWEEN items, never after the last.
  it('emits the separator only BETWEEN items, never trailing the finite run (D-081)', () => {
    const h = make({ repeat: 1, separator: '•' });
    h.driver.start();
    // The single finite cycle feeds "A • B" and then refuses cycle 2 — so the stream ends on
    // an item, with exactly one separator BETWEEN the two items (none trailing).
    const texts = fedTexts(h.track);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.at(-1)).not.toBe('•');
    expect(texts.filter((t) => t === '•')).toHaveLength(1);
  });

  it("'infinite' never completes (the scope holds until stop())", async () => {
    const h = make({ repeat: 'infinite' });
    const done = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(120_000);
    await flush();
    expect(done.done).toBe(false);
  });

  it('empty content completes immediately (nothing to crawl)', async () => {
    const h = make({ items: [], repeat: 2 });
    const done = completionFlag(h.driver);
    h.driver.start();
    await flush();
    expect(done.done).toBe(true);
  });

  it("'drain' empties the band between cycles (the next head waits for the prior tail)", () => {
    const h = make({ repeat: 2, cycleBoundary: 'drain' });
    h.driver.start();
    h.clock.advance(8000); // d = 800 — cycle 2 fed (spacer applied at the wrap)
    // Wrap at offset 320 gains a viewport-width spacer ⇒ cycle 2 starts at
    // 720: a@720 (rtl left = −(720+100) = −820), b@830 (left = −1030).
    const lefts = [...h.track.querySelectorAll<HTMLElement>('[data-cg-ticker-item]')]
      .filter((n) => n.style.visibility !== 'hidden')
      .map((n) => n.style.left);
    expect(lefts).toContain('-820px');
    // Empty-band window: cycle 1's tail (ends 310) exits at d=710; cycle 2's
    // head enters only at d=720 — guaranteed by construction (720 ≥ 310+400).
  });

  it('a fresh run after reset() completes again (per-composition-cycle restarts)', async () => {
    const h = make({ repeat: 1 }); // finalEnd 310 ⇒ complete at d ≥ 710 ⇒ 7100ms
    const first = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(7200);
    await flush();
    expect(first.done).toBe(true);
    h.driver.reset(); // the controller does reset+start at every hold entry
    const second = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(7000);
    await flush();
    expect(second.done).toBe(false); // a genuinely fresh run, not pre-resolved
    h.clock.advance(200);
    await flush();
    expect(second.done).toBe(true);
  });

  it('widths are RE-measured once per content cycle (mid-font-swap self-heal)', () => {
    // The cache clears when a cycle completes, so a face that finished loading
    // mid-flight gets fresh metrics one lap later: measure() is re-consulted.
    let scale = 10;
    let measuresOfA = 0;
    const h = make({
      measure: (node) => {
        if (node.textContent === itemA.text) measuresOfA += 1;
        return (node.textContent?.length ?? 0) * scale;
      },
    });
    h.driver.start();
    expect(measuresOfA).toBe(1); // cached within cycle 1
    scale = 20; // font swap lands
    // Small steps like real playback so feeding interleaves with completion.
    for (let i = 0; i < 30; i += 1) h.clock.advance(500);
    expect(measuresOfA).toBeGreaterThanOrEqual(2); // healed after a lap
    // Fresh feeds use the healed (2×) width: an 'a' fed post-heal is 200px
    // wide, so consecutive a→b spacing reflects w=200 (left gap = 210).
  });
});

describe('TickerDriver — treadmill behaviour', () => {
  it('seamless wrap: the first item follows the last with the configured spacing', () => {
    const h = make();
    h.driver.start();
    // Feed horizon at d=0 is 400+256=656: a(0) b(110) | a(320) b(430) a(640)
    expect(fedTexts(h.track)).toEqual([itemA.text, itemB.text, itemA.text, itemB.text, itemA.text]);
  });

  it('translate-only motion: rtl track moves left→right (translateX = +d)', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(500); // d = 50
    expect(h.track.style.transform).toBe('translateX(50px)');
  });

  it('ltr is the mirror (translateX = viewport − d)', () => {
    const h = make({ direction: 'ltr' });
    h.driver.start();
    h.clock.advance(500);
    expect(h.track.style.transform).toBe('translateX(350px)');
  });

  it('rtl item nodes are placed at left = −(o + w); ltr at left = o', () => {
    const rtl = make();
    rtl.driver.start();
    const rtlFirst = rtl.track.querySelectorAll<HTMLElement>('[data-cg-ticker-item]')[1];
    expect(rtlFirst?.style.left).toBe('-100px'); // o=0, w=100 (index 0 is the hidden measure node)

    const ltr = make({ direction: 'ltr' });
    ltr.driver.start();
    const ltrFirst = ltr.track.querySelectorAll<HTMLElement>('[data-cg-ticker-item]')[1];
    expect(ltrFirst?.style.left).toBe('0px');
  });

  it('items are bidi-isolated spans with the element direction', () => {
    const h = make();
    h.driver.start();
    const node = h.track.querySelectorAll<HTMLElement>('[data-cg-ticker-item]')[1];
    expect(node?.style.unicodeBidi).toBe('isolate');
    expect(node?.style.direction).toBe('rtl');
    expect(node?.style.whiteSpace).toBe('pre');
  });

  it('pause freezes the crawl; resume continues from the same offset', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(500); // d = 50
    h.driver.pause();
    h.clock.advance(10_000); // frozen — no movement
    expect(h.track.style.transform).toBe('translateX(50px)');
    h.driver.resume();
    h.clock.advance(500); // d = 100 (the paused span never counted)
    expect(h.track.style.transform).toBe('translateX(100px)');
  });

  it('start is idempotent while running (a double start never rewinds the offset)', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000); // d = 100
    h.driver.start();
    h.clock.advance(500); // d = 150 — startedAt was NOT re-stamped
    expect(h.track.style.transform).toBe('translateX(150px)');
  });

  it('reset() restarts from the entering edge (fresh play())', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000);
    h.driver.reset();
    h.driver.start();
    h.clock.advance(500); // a fresh run: d counts from this start
    expect(h.track.style.transform).toBe('translateX(50px)');
  });

  it('removes the static authoring layout when the crawl starts', () => {
    const h = make();
    const staticRow = document.createElement('div');
    staticRow.dataset['cgTickerStatic'] = '1';
    h.band.appendChild(staticRow);
    h.driver.start();
    expect(h.band.querySelector('[data-cg-ticker-static]')).toBeNull();
  });

  it('recycles exited nodes instead of growing the DOM', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(60_000); // d = 6000 — many cycles crossed
    const count = h.track.querySelectorAll('[data-cg-ticker-item]').length;
    // Live window ≈ viewport + buffer + slack of content, NOT 6000px worth.
    expect(count).toBeLessThan(12);
  });
});

describe('TickerDriver — reconcile by stable id (update())', () => {
  it('keeps visible nodes in place, drops the unseen tail, re-feeds from the new list', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000); // d = 100: a(o=0) has entered; b(o=110) has not
    const visibleA = h.track.querySelectorAll<HTMLElement>('[data-cg-ticker-item]')[1];
    expect(visibleA?.textContent).toBe(itemA.text);
    const leftBefore = visibleA?.style.left;

    const itemC: TickerDriverItem = { id: 'c', text: 'cccc' }; // 40px
    h.driver.setItems([itemA, itemC]); // b removed, c appended

    // The entered node is untouched (no visual jump)…
    expect(visibleA?.isConnected).toBe(true);
    expect(visibleA?.style.left).toBe(leftBefore);
    // …and the re-fed tail follows the NEW list from after the last visible
    // item: a → c → a → c … with 'b' never appearing again.
    const texts = fedTexts(h.track);
    expect(texts[0]).toBe(itemA.text);
    expect(texts.slice(1, 4)).toEqual([itemC.text, itemA.text, itemC.text]);
    expect(texts).not.toContain(itemB.text);
  });

  it('a removed-but-visible item scrolls out and never returns', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(2000); // d = 200: a and b both entered
    h.driver.setItems([itemA]); // b removed while visible
    h.clock.advance(60_000); // far past everything fed before the reconcile
    expect(fedTexts(h.track)).not.toContain(itemB.text);
  });

  it('a reconcile mid-run still ends a finite repeat cleanly (completion with the NEW list)', async () => {
    const h = make({ repeat: 2 });
    const done = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(1000); // d = 100 — mid cycle 1
    h.driver.setItems([itemA]); // b removed; remaining feeds use the new list
    for (let i = 0; i < 30; i += 1) h.clock.advance(500); // run well past the end
    await flush();
    expect(done.done).toBe(true); // the run completed — it never stalls
    expect(fedTexts(h.track)).toEqual([]); // and ended empty (nothing re-fed)
  });

  it('an entered item with changed text is corrected IN PLACE — leading edge fixed, downstream shifted by the delta', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(2000); // d = 200: a (o=0..100) and b (o=110..310) both entered
    const nodes = h.track.querySelectorAll<HTMLElement>('[data-cg-ticker-item]');
    const nodeA = nodes[1];
    const nodeB = nodes[2];
    expect(nodeA?.textContent).toBe(itemA.text);
    expect(nodeB?.style.left).toBe('-310px'); // rtl: -(110+200)

    h.driver.setItems([{ id: 'a', text: 'XXXX' }, itemB]); // a: 100px → 40px (Δ=−60)

    // The on-screen headline is corrected immediately…
    expect(nodeA?.textContent).toBe('XXXX');
    // …its leading (rtl: right) edge unchanged: left = −(0+40)
    expect(nodeA?.style.left).toBe('-40px');
    // …and the following entered node shifts by exactly the width delta:
    // o 110→50 ⇒ left = −(50+200)
    expect(nodeB?.style.left).toBe('-250px');
    expect(nodeB?.textContent).toBe(itemB.text);
  });

  it('a shrunk in-place edit never re-feeds behind the entering edge (no pop-in)', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000); // d = 100: only a entered
    h.driver.setItems([{ id: 'a', text: 'XX' }, itemB]); // a: 100px → 20px
    // Kept end is now 20+gap=30 < d=100 — the re-fed tail must start at d, not 30.
    const fedAfter = [...h.track.querySelectorAll<HTMLElement>('[data-cg-ticker-item]')]
      .filter((n) => n.style.visibility !== 'hidden')
      .map((n) => Number.parseFloat(n.style.left));
    // rtl: left = −(o+w) ⇒ every re-fed node has o ≥ 100 ⇒ left ≤ −(100+w) < −100.
    // The edited node itself sits at −20; everything else must be ≤ −100−min(w).
    const others = fedAfter.filter((left) => left !== -20);
    for (const left of others) expect(left).toBeLessThanOrEqual(-120);
  });

  it('a mid-list-resume reconcile keeps feeding the new list in order (no skipped wrap)', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000); // d = 100 — kept 'a' is at idx 1 of the NEW list
    h.driver.setItems([{ id: 'q', text: 'qqqqq' }, itemA, { id: 'z', text: 'zzzz' }]);
    // Feeding resumes AFTER 'a' in the new list: z, then wraps to q, a, z …
    const texts = fedTexts(h.track);
    expect(texts[0]).toBe(itemA.text); // the kept entered node
    expect(texts.slice(1, 4)).toEqual(['zzzz', 'qqqqq', itemA.text]);
  });

  it('reset() removes the static authoring layout (a fresh play never shows stale items)', () => {
    const h = make();
    const staticRow = document.createElement('div');
    staticRow.dataset['cgTickerStatic'] = '1';
    h.band.appendChild(staticRow);
    h.driver.reset();
    expect(h.band.querySelector('[data-cg-ticker-static]')).toBeNull();
  });

  it('pre-start setItems re-renders the static authoring row from the new list', () => {
    const h = make({ separator: '•' });
    const staticRow = document.createElement('div');
    staticRow.dataset['cgTickerStatic'] = '1';
    h.band.appendChild(staticRow);
    h.driver.setItems([
      { id: 'x', text: 'X' },
      { id: 'y', text: 'Y' },
    ]);
    const texts = [...staticRow.querySelectorAll('span')].map((n) => n.textContent);
    expect(texts).toEqual(['X', '•', 'Y']);
  });

  it('pre-start setItems (field default) replaces the authored items wholesale', () => {
    const h = make();
    h.driver.setItems([{ id: 'x', text: 'xxxx' }]);
    h.driver.start();
    expect(fedTexts(h.track)).not.toContain(itemA.text);
    expect(fedTexts(h.track)[0]).toBe('xxxx');
  });
});

describe('coerceTickerItems', () => {
  it('passes {id, text} items through', () => {
    expect(coerceTickerItems([{ id: 'i1', text: 'خبر' }])).toEqual([{ id: 'i1', text: 'خبر' }]);
  });
  it('gives bare strings positional ids (degraded fallback)', () => {
    expect(coerceTickerItems(['x', 'y'])).toEqual([
      { id: 'item-0', text: 'x' },
      { id: 'item-1', text: 'y' },
    ]);
  });
  it('fills missing id/text fields safely', () => {
    expect(coerceTickerItems([{ text: 'x' }, { id: 'k' }, 7])).toEqual([
      { id: 'item-0', text: 'x' },
      { id: 'k', text: '' },
      { id: 'item-2', text: '' },
    ]);
  });
});
