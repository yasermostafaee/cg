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
    clock,
    measure,
    ...overrides,
  });
  return { driver, band, track, clock };
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

describe('TickerDriver — content-driven duration math', () => {
  it('first pass = (viewportWidth + cycleWidth) / speed (golden)', () => {
    const h = make();
    h.driver.start();
    // (320 + 400) px at 100 px/s = 7200 ms
    expect(h.driver.passRemainingMs()).toBe(7200);
  });

  it('longer content ⇒ proportionally longer pass (no manual duration anywhere)', () => {
    const h = make({
      items: [
        { id: 'a', text: 'a'.repeat(20) }, // 200px
        { id: 'b', text: 'b'.repeat(40) }, // 400px
      ],
    });
    h.driver.start();
    // cycle = (200+10)+(400+10) = 620 ⇒ (620+400)/100 = 10200 ms
    expect(h.driver.passRemainingMs()).toBe(10200);
  });

  it('separators join the cycle width', () => {
    const h = make({ separator: ' • ' }); // 3 chars → 30px
    h.driver.start();
    // per item: w + gap + sep(30) + gap ⇒ (100+10+30+10)+(200+10+30+10) = 400
    expect(h.driver.passRemainingMs()).toBe(8000); // (400+400)/100
  });

  it('self-corrects: time consumed between passes shrinks the remaining hold', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000); // d = 100px into cycle 1
    // cycle 1 seam at 320 ⇒ remaining (320+400-100)/100 = 6200 ms
    expect(h.driver.passRemainingMs()).toBe(6200);
  });

  it('later passes align to content-cycle completions', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(7500); // d = 750 — cycle 1 (seam 320: 720 ≤ 750) has completed
    // next boundary: seam 640 ⇒ (640+400-750)/100 = 2900 ms
    expect(h.driver.passRemainingMs()).toBe(2900);
  });

  it('empty content ⇒ zero-length pass (D-020 absent-hook semantics)', () => {
    const h = make({ items: [] });
    h.driver.start();
    expect(h.driver.passRemainingMs()).toBe(0);
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
    expect(h.driver.passRemainingMs()).toBe(6700); // (320+400-50)/100
    h.driver.resume();
    h.clock.advance(500); // d = 100
    expect(h.driver.passRemainingMs()).toBe(6200);
  });

  it('start is idempotent — pass boundaries never restart the crawl', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000); // d = 100
    h.driver.start(); // controller re-enters hold on pass 2+
    expect(h.driver.passRemainingMs()).toBe(6200); // NOT reset to 7200
  });

  it('reset() restarts from the entering edge (fresh play())', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000);
    h.driver.reset();
    h.driver.start();
    expect(h.driver.passRemainingMs()).toBe(7200);
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

  it('reconcile updates the cycle width for FUTURE pass math', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000); // d = 100
    h.driver.setItems([itemA]); // cycle now (100+10) = 110
    h.clock.advance(60_000); // run far ahead so recorded seams are consumed
    const remaining = h.driver.passRemainingMs();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(1100); // one new-cycle width / speed
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

  it('projection after a mid-list-resume reconcile derives the wrap from feeder state, not cycle multiples', () => {
    const h = make();
    h.driver.start();
    h.clock.advance(1000); // d = 100
    // New list: q(50px), a(100px), z(1000px) — kept 'a' is at idx 1, so feeding
    // resumes at z; the real wrap lands at 110+1000+10 = 1120, beyond the feed
    // horizon, and the old seams were filtered by the reconcile.
    h.driver.setItems([
      { id: 'q', text: 'qqqqq' },
      itemA,
      { id: 'z', text: 'z'.repeat(100) },
    ]);
    // True boundary: (1120 + 400 − 100) / 100 ⇒ 14200 ms (a cycle-multiple
    // projection would wrongly give (1180+400−100)/100 = 14800).
    expect(h.driver.passRemainingMs()).toBe(14200);
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
    // cycle = 40+10 = 50 ⇒ (50+400)/100 = 4500 ms
    expect(h.driver.passRemainingMs()).toBe(4500);
    expect(fedTexts(h.track)).not.toContain(itemA.text);
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
