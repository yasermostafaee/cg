/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { withCgControl, type Element, type FieldValues, type Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * 🔴 `SELF-STOP-24 · REPLY 1` §R1 — **THE PRE-PLAY TELL IS INERT, AND IT NOW REACHES EVERY
 * TEMPLATE.**
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────
 *
 * `750b28ea` made the resident-producer take path send a `CG UPDATE` UNCONDITIONALLY. Before
 * it, only a LOOK-BEARING template got one (`B-191`); a look-less or content-driven template
 * had never seen a mid-flight `CG UPDATE` on this path in its life. So the question is not
 * whether the token arrives — `template-completion-stop.integration.test.ts` measures that on
 * the wire — but whether the command that carries it DOES ANYTHING ELSE.
 *
 * ── WHAT THE BRIDGE ACTUALLY SENDS ────────────────────────────────────────────────────────
 *
 * `CommandBuilder.updateTake(slot, take, lookId?)` takes `fields` defaulting to `{}`, and
 * `#tellPageTake` never passes any. So the payload is `{"__cg":{"take":"…"}}` and nothing else
 * — **no field data at all**, which is why the "last-sent values versus the Inspector's unsent
 * draft" question cannot arise at this command: neither is on it. What this file has to prove
 * is the consequence — that an empty-field payload LEAVES the on-air values alone rather than
 * resetting them to the authored defaults.
 *
 * ── THE `0f54e00d` CLASS, IN THE OTHER DIRECTION ──────────────────────────────────────────
 *
 * That defect was a `__cg` member READ on one door and dropped on the other. The mirror risk
 * here is a member the tell does not CARRY being CLEARED by it: the tell says nothing about
 * `timing`, and an operator's `Count 2` must survive it and survive the re-take that follows.
 * "Absent means unchanged" is written into `readCgControl` and into both doors; this is the
 * end-to-end proof that it holds for the one payload that carries a token and nothing else.
 */

const PASS_MS = 1000;

function makeClock() {
  let ms = 0;
  let rafQueue: ((ts: number) => void)[] = [];
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancel: () => {
      rafQueue = [];
    },
    setTimeout: (cb: () => void, delay: number) => {
      const id = nextId++;
      timers.push({ id, due: ms + delay, cb });
      return id;
    },
    clearTimeout: (h: unknown) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    advance: (delta: number) => {
      ms += delta;
      const due = timers.filter((t) => t.due <= ms).sort((a, b) => a.due - b.due);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        t.cb();
      }
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

/** An infinite crawl — the content that HOLDS a content-driven composition on air. */
function infiniteTicker(): Element {
  return {
    id: 'crawl',
    name: 'crawl',
    type: 'ticker',
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 800, h: 60 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'aaaaaaaaaa' }],
  } as unknown as Element;
}

/**
 * The fixture's lower third — ONE bound text field — with a playout of the caller's choosing
 * and, optionally, a crawl so a content-driven hold has something to be driven by.
 */
function sceneWith(playout: Record<string, unknown>, withTicker = false): Scene {
  const base = structuredClone(lowerThirdScene) as unknown as Record<string, unknown>;
  const layers = base['layers'] as { children: Element[] }[];
  if (withTicker) layers[0]?.children.push(infiniteTicker());
  return {
    ...base,
    lifecycle: { outPoint: 40 },
    playout,
  } as unknown as Scene;
}

const LOOP_FOREVER = {
  mode: 'loop-cycle',
  holdSource: 'timed',
  holdMs: PASS_MS,
  repeat: 'infinite',
};

interface Live {
  rt: ReturnType<typeof createRuntime>;
  clock: ReturnType<typeof makeClock>;
  host: HTMLDivElement;
  events: string[];
  ends: (string | undefined)[];
}

function mount(playout: Record<string, unknown>, withTicker = false): Live {
  const clock = makeClock();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const rt = createRuntime(sceneWith(playout, withTicker), {
    root: host,
    skipFontLoad: true,
    clock,
  });
  const events: string[] = [];
  const ends: (string | undefined)[] = [];
  for (const e of ['play.start', 'update', 'stop.start', 'stop.end'] as const) {
    rt.on(e, () => events.push(e));
  }
  rt.on('self-end', (ev) => {
    events.push('self-end');
    ends.push(ev.take);
  });
  return { rt, clock, host, events, ends };
}

/**
 * ⚠ ONE `advance()` PER PASS — the fixture's clock fires one GENERATION of timers per call, so
 * a single big jump runs ONE pass however large it is. (The same trap `self-end-event.test.ts`
 * documents; repeated here because it reads as "the runtime never emitted".)
 */
function runPasses(l: Live, n: number): void {
  for (let i = 0; i < n; i++) l.clock.advance(PASS_MS);
}

/** EXACTLY what `CommandBuilder.updateTake` puts on the wire: `__cg` and no fields. */
const theTell = (take: string): Partial<FieldValues> =>
  withCgControl({} as unknown as FieldValues, { take });

describe('SELF-STOP-24 R1 — the pre-PLAY tell carries a token and changes nothing else', () => {
  it('leaves the ON-AIR field values alone — it does not reset them to the authored defaults', async () => {
    const l = mount(LOOP_FOREVER);
    await l.rt.play(
      withCgControl({ anchor: 'روی خط' } as unknown as FieldValues, { take: 'tok-1' }),
    );
    expect(l.host.textContent, 'the operator value never reached the page').toContain('روی خط');

    await l.rt.update(theTell('tok-2'));

    expect(
      l.host.textContent,
      'the tell reset the graphic to its authored default — an empty payload was read as REPLACE',
    ).toContain('روی خط');
    expect(l.host.textContent).not.toContain('سارا نادری');
  });

  it("the operator's COUNT survives the tell and the re-take — 2 passes, again", async () => {
    /*
      🔴 THE END-TO-END SHAPE OF A REAL RE-TAKE, and the one this reply exists to check.

      Take 1 carries the operator's override on the ADD payload. The run plays exactly two
      passes and self-ends. The bridge then STOPS the row (producer resident), and the operator
      takes it again — which sends NO `CG ADD`, so the count reaches the page from nowhere at
      all. It has to already be there, and the tell must not have cleared it.
    */
    const l = mount(LOOP_FOREVER);
    await l.rt.play(
      withCgControl({} as unknown as FieldValues, { take: 'tok-1', timing: { passes: 2 } }),
    );

    runPasses(l, 1);
    expect(l.ends, 'ended with a pass still to come').toEqual([]);
    runPasses(l, 1);
    expect(l.ends, 'the first run did not honour the count').toEqual(['tok-1']);

    // The resident-producer re-take: the tell, then a BARE play with no payload at all.
    await l.rt.update(theTell('tok-2'));
    await l.rt.play({} as unknown as FieldValues);

    runPasses(l, 1);
    expect(l.ends, 'the second run ended a pass early — the count was mangled').toEqual(['tok-1']);
    runPasses(l, 1);
    expect(
      l.ends,
      'the second run did not self-end after two passes — the tell cleared the count',
    ).toEqual(['tok-1', 'tok-2']);

    runPasses(l, 4);
    expect(l.ends, 'it kept running — the count was cleared to infinite').toEqual([
      'tok-1',
      'tok-2',
    ]);
  });

  it('a tell DURING a run does not restart it — the remaining passes are still the remaining passes', async () => {
    const l = mount(LOOP_FOREVER);
    await l.rt.play(
      withCgControl({} as unknown as FieldValues, { take: 'tok-1', timing: { passes: 2 } }),
    );

    runPasses(l, 1); // one of the two extra passes is gone
    await l.rt.update(theTell('tok-2'));

    runPasses(l, 1);
    expect(
      l.ends,
      'the run did not end when it was due — the tell put passes back on the clock',
    ).toEqual(['tok-2']);
    runPasses(l, 4);
    expect(l.ends, 'it ended twice, or kept going').toEqual(['tok-2']);
  });

  it('a CONTENT-DRIVEN hold is not re-read — an infinite crawl still holds the graphic on air', async () => {
    // The look-less, content-driven template that had never received a mid-flight `CG UPDATE`
    // on this path. Its hold is owed to a crawl that never completes, so the ONE thing that
    // must not happen is the graphic closing — and the other is the hold silently re-arming.
    const l = mount({ mode: 'auto-out', holdSource: 'content-driven' }, true);
    await l.rt.play(withCgControl({} as unknown as FieldValues, { take: 'tok-1' }));

    l.clock.advance(PASS_MS);
    expect(l.events, 'the crawl did not hold it — the fixture proves nothing').not.toContain(
      'stop.end',
    );

    await l.rt.update(theTell('tok-2'));
    for (let i = 0; i < 5; i++) l.clock.advance(PASS_MS);

    expect(l.events, 'the tell closed a content-driven graphic').not.toContain('stop.end');
    expect(l.ends, 'the tell settled a run whose content had not finished').toEqual([]);
  });

  it('the tell emits `update` and NOTHING else — no play, no exit', async () => {
    const l = mount(LOOP_FOREVER);
    await l.rt.play(withCgControl({} as unknown as FieldValues, { take: 'tok-1' }));
    const before = [...l.events];

    await l.rt.update(theTell('tok-2'));

    expect(l.events.slice(before.length), 'the tell did more than update the page').toEqual([
      'update',
    ]);
  });
});
