import { beforeEach, describe, expect, it } from 'vitest';
import { SequenceDriver, type SequenceDriverOptions } from '../src/sequence-driver.js';

/** Fake rAF + timer clock (same shape as the ticker/clock suites). */
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
    advance: (delta: number) => {
      ms += delta;
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

function completionFlag(driver: SequenceDriver): { done: boolean } {
  const out = { done: false };
  void driver.whenComplete().then(() => {
    out.done = true;
  });
  return out;
}

const ITEMS = [
  { id: 'a', text: 'اکنون: برنامهٔ نخست' },
  { id: 'b', text: 'سپس: برنامهٔ دوم' },
  { id: 'c', text: 'بعد: برنامهٔ سوم' },
];

function make(opts: Partial<SequenceDriverOptions> = {}) {
  const clock = makeClock();
  const host = document.createElement('div');
  host.style.width = '720px';
  host.style.height = '72px';
  document.body.appendChild(host);
  const driver = new SequenceDriver({
    host,
    direction: 'rtl',
    items: ITEMS.map((i) => ({ ...i })),
    defaultDwellMs: 1000,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 'infinite',
    clock,
    ...opts,
  });
  return { clock, host, driver };
}

/** Texts of the on-stage (non-hidden) item nodes. */
function visible(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('[data-cg-sequence-item]')]
    .filter((n) => n.style.visibility !== 'hidden')
    .map((n) => n.textContent ?? '');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('SequenceDriver (D-029)', () => {
  it('auto: each item dwells (per-item dwellMs falls back to the default), then advances', () => {
    const h = make({
      items: [
        { id: 'a', text: 'A', dwellMs: 500 }, // own dwell
        { id: 'b', text: 'B' }, // falls back to 1000
        { id: 'c', text: 'C' },
      ],
    });
    h.driver.start();
    expect(visible(h.host)).toEqual(['A']);
    h.clock.advance(499);
    expect(visible(h.host)).toEqual(['A']);
    h.clock.advance(1); // a's 500ms dwell ends — transition to B begins
    h.clock.advance(400); // transition completes
    expect(visible(h.host)).toEqual(['B']);
    h.clock.advance(999);
    expect(visible(h.host)).toEqual(['B']); // default dwell not yet over
    h.clock.advance(1);
    h.clock.advance(400);
    expect(visible(h.host)).toEqual(['C']);
  });

  it('manual: no dwell timers run — only next() advances', () => {
    const h = make({ advance: 'manual' });
    h.driver.start();
    h.clock.advance(60_000); // nothing happens on time alone
    expect(visible(h.host)).toEqual([ITEMS[0]?.text]);
    h.driver.next();
    h.clock.advance(400);
    expect(visible(h.host)).toEqual([ITEMS[1]?.text]);
  });

  it('next() in auto advances immediately AND restarts the new item dwell', () => {
    const h = make({ defaultDwellMs: 1000 });
    h.driver.start();
    h.clock.advance(900); // 100ms before the timer would fire
    h.driver.next(); // manual advance
    h.clock.advance(400); // transition done — B's dwell starts NOW
    expect(visible(h.host)).toEqual([ITEMS[1]?.text]);
    h.clock.advance(999);
    expect(visible(h.host)).toEqual([ITEMS[1]?.text]); // fresh full dwell
    h.clock.advance(1);
    h.clock.advance(400);
    expect(visible(h.host)).toEqual([ITEMS[2]?.text]);
  });

  it('next() before start() is ignored (no queueing)', () => {
    const h = make();
    h.driver.next();
    h.driver.start();
    expect(visible(h.host)).toEqual([ITEMS[0]?.text]); // still item 1
  });

  it('a finite repeat plays the boundary transitions and completes after the LAST item EXITS — by timer', async () => {
    const h = make({ repeat: 1, defaultDwellMs: 500 });
    const done = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(400); // D-116 — the first item's entrance (transitionIn) plays before dwelling
    expect(visible(h.host)).toEqual([ITEMS[0]?.text]);
    // a → b → c, then c's dwell elapses: past the last item of pass 1.
    for (let i = 0; i < 2; i += 1) {
      h.clock.advance(500);
      h.clock.advance(400);
    }
    expect(visible(h.host)).toEqual([ITEMS[2]?.text]);
    await flush();
    expect(done.done).toBe(false);
    h.clock.advance(500); // c's dwell ends — the LAST item's EXIT (transitionOut) begins
    await flush();
    expect(done.done).toBe(false); // D-116 — completion waits until the exit finishes
    h.clock.advance(400); // the exit completes — NOW the run completes
    await flush();
    expect(done.done).toBe(true);
    // The last item has EXITED (off-screen); nothing advances any more.
    expect(visible(h.host)).toEqual([]);
    h.clock.advance(10_000);
    expect(visible(h.host)).toEqual([]);
  });

  it('a finite repeat completes after the last item EXITS — by next() too', async () => {
    const h = make({ repeat: 1, advance: 'manual' });
    const done = completionFlag(h.driver);
    h.driver.start();
    h.clock.advance(400); // D-116 — the first-item entrance plays on start (next() waits for it)
    h.driver.next();
    h.clock.advance(400);
    h.driver.next();
    h.clock.advance(400);
    expect(visible(h.host)).toEqual([ITEMS[2]?.text]);
    await flush();
    expect(done.done).toBe(false);
    h.driver.next(); // past the last item of pass 1 — the LAST item's EXIT begins
    await flush();
    expect(done.done).toBe(false); // D-116 — completion waits for the exit
    h.clock.advance(400); // the exit completes — NOW the run completes
    await flush();
    expect(done.done).toBe(true);
    expect(visible(h.host)).toEqual([]); // the last item has exited
  });

  it("'infinite' wraps to item 1 and never completes", async () => {
    const h = make({ defaultDwellMs: 500 });
    const done = completionFlag(h.driver);
    h.driver.start();
    for (let i = 0; i < 3; i += 1) {
      h.clock.advance(500);
      h.clock.advance(400);
    }
    expect(visible(h.host)).toEqual([ITEMS[0]?.text]); // wrapped around
    await flush();
    expect(done.done).toBe(false);
  });

  it('pause() freezes the dwell; resume() continues with no jump', () => {
    const h = make({ defaultDwellMs: 1000 });
    h.driver.start();
    h.clock.advance(800);
    h.driver.pause();
    h.clock.advance(30_000); // paused time must not count
    expect(visible(h.host)).toEqual([ITEMS[0]?.text]);
    h.driver.resume();
    h.clock.advance(199);
    expect(visible(h.host)).toEqual([ITEMS[0]?.text]);
    h.clock.advance(1); // dwell completes at active 1000ms
    h.clock.advance(400);
    expect(visible(h.host)).toEqual([ITEMS[1]?.text]);
  });

  it('pause() freezes an IN-FLIGHT transition mid-motion; resume() continues it', () => {
    const h = make({ defaultDwellMs: 500 });
    h.driver.start();
    h.clock.advance(500); // dwell over — transition begins
    h.clock.advance(200); // mid-transition (ease midpoint: ±36px)
    const nodes = h.host.querySelectorAll<HTMLElement>('[data-cg-sequence-item]');
    const midTransform = nodes[1]?.style.transform;
    expect(midTransform).toMatch(/translate/);
    h.driver.pause();
    h.clock.advance(10_000);
    expect(nodes[1]?.style.transform).toBe(midTransform); // frozen mid-motion
    h.driver.resume();
    h.clock.advance(200); // the remaining half completes
    expect(visible(h.host)).toEqual([ITEMS[1]?.text]);
  });

  it('reset() returns to item 1 and mints a FRESH completion per run', async () => {
    const h = make({
      repeat: 1,
      advance: 'manual',
      items: ITEMS.slice(0, 2).map((i) => ({ ...i })),
    });
    h.driver.start();
    h.clock.advance(400); // entrance
    h.driver.next();
    h.clock.advance(400); // a → b transition
    h.driver.next(); // past the last item — run 1's last item exits
    h.clock.advance(400); // exit → run 1 completes
    await flush();
    h.driver.reset();
    expect(visible(h.host)).toEqual([ITEMS[0]?.text]); // back to item 1
    const second = completionFlag(h.driver);
    await flush();
    expect(second.done).toBe(false);
    h.driver.start();
    h.clock.advance(400); // entrance (run 2 — fresh)
    h.driver.next();
    h.clock.advance(400); // a → b
    h.driver.next(); // past b — exit
    h.clock.advance(400); // exit completes
    await flush();
    expect(second.done).toBe(true);
  });

  it('an empty items list is complete by definition at start()', async () => {
    const h = make({ items: [], repeat: 1 });
    const done = completionFlag(h.driver);
    h.driver.start();
    await flush();
    expect(done.done).toBe(true);
    expect(visible(h.host)).toEqual([]);
  });

  describe('setItems() reconcile', () => {
    it('a text edit of the CURRENT item corrects it in place — never yanked', () => {
      const h = make();
      h.driver.start();
      h.driver.setItems([{ id: 'a', text: 'A2' }, ...ITEMS.slice(1).map((i) => ({ ...i }))]);
      expect(visible(h.host)).toEqual(['A2']); // same node, new text
    });

    it('removing the current item takes effect at the NEXT advance', () => {
      const h = make({ advance: 'manual' });
      h.driver.start();
      // Remove 'a' while it displays: it stays on screen…
      h.driver.setItems(ITEMS.slice(1).map((i) => ({ ...i })));
      expect(visible(h.host)).toEqual([ITEMS[0]?.text]);
      // …and the next advance resumes at its successor position ('b').
      h.driver.next();
      h.clock.advance(400);
      expect(visible(h.host)).toEqual([ITEMS[1]?.text]);
    });

    it('order and per-item dwellMs come from the NEW list', () => {
      const h = make({ defaultDwellMs: 1000 });
      h.driver.start();
      // Reorder: after 'a' now comes 'c'; give the current item a longer dwell.
      h.driver.setItems([
        { id: 'a', text: ITEMS[0]?.text ?? '', dwellMs: 2000 },
        { id: 'c', text: ITEMS[2]?.text ?? '' },
        { id: 'b', text: ITEMS[1]?.text ?? '' },
      ]);
      h.clock.advance(1000); // old dwell would have fired — new dwell is 2000
      expect(visible(h.host)).toEqual([ITEMS[0]?.text]);
      h.clock.advance(1000);
      h.clock.advance(400);
      expect(visible(h.host)).toEqual([ITEMS[2]?.text]); // 'c' is next now
    });

    it('pre-start setItems re-renders item 1 from the new list (canvas truth)', () => {
      const h = make();
      h.driver.setItems([{ id: 'x', text: 'X' }]);
      h.driver.reset();
      expect(visible(h.host)).toEqual(['X']);
    });

    it('removal resumes at the first SURVIVING successor (no phantom pass boundary)', async () => {
      // Mid-transition a→b, a reconcile removes BOTH a and b but keeps c:
      // b finishes entering (never yanked), and the next advance must land on
      // c — not skip past the end and complete the finite run prematurely.
      const h = make({ repeat: 1, advance: 'manual' });
      const done = completionFlag(h.driver);
      h.driver.start();
      h.clock.advance(400); // D-116 — the first-item entrance completes (next() waits for it)
      h.driver.next(); // a → b transition in flight
      h.clock.advance(100); // mid-motion
      h.driver.setItems([{ id: 'c', text: ITEMS[2]?.text ?? '' }]);
      h.clock.advance(300); // the transition completes — b on stage, orphaned
      expect(visible(h.host)).toEqual([ITEMS[1]?.text]);
      h.driver.next(); // resumes at c (b's surviving successor), NOT the end
      h.clock.advance(400);
      expect(visible(h.host)).toEqual([ITEMS[2]?.text]);
      await flush();
      expect(done.done).toBe(false); // no premature completion
      h.driver.next(); // past the real last item — the last item's EXIT begins
      await flush();
      expect(done.done).toBe(false); // D-116 — completion waits for the exit
      h.clock.advance(400); // exit completes — NOW the run completes
      await flush();
      expect(done.done).toBe(true);
    });
  });
});
