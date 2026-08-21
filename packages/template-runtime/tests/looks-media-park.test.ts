import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * `B-150` / `tasks.md` 9.3 — **CONTENT INSIDE A LOOK THAT IS NOT ON SCREEN IS PARKED.**
 *
 * Every look a template authors is built and running; only one is visible. Nothing used to
 * stop what was inside the hidden ones, so a template with four looks decoded four videos
 * and crawled four crawls to put one on air.
 *
 * ── 🔴 WHAT THESE TESTS CANNOT PROVE, STATED UP FRONT (task 6.5) ──────────────────
 *
 * **happy-dom has no decoder**, so the DECODE LOAD — the thing §9.6f says the frame budget
 * cannot spare — is unmeasurable here and is NOT measured. What is asserted is the API
 * FACTS the claim rests on: `paused`, `muted`, and that `currentTime` is not rewound. The
 * step from "the element is paused" to "the decoder stopped spending frames" is the
 * browser's contract, not this suite's finding, and a real measurement belongs on the
 * plant's CEF beside §9.6f's own numbers.
 *
 * ⚠ For the same reason a `<video>`'s head does not ADVANCE on its own here: it moves only
 * when the driver seeks it. Where a test needs a clip to have played, it moves the head by
 * hand — which is what a decoder would have done — and then asserts the driver leaves it
 * alone. That is the honest shape of a resume-in-place assertion in this environment.
 */

const T = (w = 400, h = 200) => ({
  position: { x: 0, y: 0 },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const base = { opacity: 1, visible: true, locked: false, zIndex: 0 };

function video(id: string, over: Record<string, unknown> = {}): Element {
  return {
    ...base,
    id,
    name: id,
    type: 'video',
    transform: T(),
    assetId: `asset-${id}`,
    durationMs: 1000,
    holdBehavior: 'loop',
    ...over,
  } as unknown as Element;
}

function ticker(id: string, over: Record<string, unknown> = {}): Element {
  return {
    ...base,
    id,
    name: id,
    type: 'ticker',
    transform: T(),
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
    ...over,
  } as unknown as Element;
}

function wallClock(id: string): Element {
  return {
    ...base,
    id,
    name: id,
    type: 'clock',
    transform: T(),
    mode: 'wall',
    format: 'HH:mm:ss',
    digits: 'latin',
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
  } as unknown as Element;
}

const instance = (id: string, compositionId: string): Element =>
  ({
    ...base,
    id,
    name: id,
    type: 'composition',
    transform: T(1920, 1080),
    compositionId,
  }) as unknown as Element;

const comp = (id: string, children: Element[]) => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
  ],
  fields: [],
  bindings: [],
});

const cut = { mode: 'cut' } as const;

/** Two looks, `look-a` the default; each carries whatever the test puts in it. */
function scene(a: Element[], b: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    activeRange: { in: 0, out: 50 },
    lifecycle: { outPoint: 25 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [instance('inst-a', 'comp-a'), instance('inst-b', 'comp-b')],
      },
    ],
    compositions: [comp('comp-a', a), comp('comp-b', b)],
    fonts: [],
    fields: [],
    bindings: [],
    lookGroups: [
      {
        id: 'g1',
        sources: [],
        looks: [
          { id: 'look-a', name: 'A', instanceId: 'inst-a', entered: cut },
          { id: 'look-b', name: 'B', instanceId: 'inst-b', entered: cut },
        ],
        defaultLookId: 'look-a',
      },
    ],
  } as unknown as Scene;
}

function makeClock() {
  let ms = 0;
  const rafs = new Map<number, (ts: number) => void>();
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      const id = nextId++;
      rafs.set(id, cb);
      return id;
    },
    cancel: (h: number) => {
      rafs.delete(h);
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
      const round = [...rafs.entries()];
      for (const [id] of round) rafs.delete(id);
      for (const [, cb] of round) cb(ms);
    },
  };
}

async function run(clock: ReturnType<typeof makeClock>, totalMs: number, step = 20): Promise<void> {
  let left = totalMs;
  while (left > 0) {
    const d = Math.min(step, left);
    clock.advance(d);
    left -= d;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

const tickerMeasure = (node: HTMLElement): number => (node.textContent?.length ?? 0) * 10;

const vid = (id: string): HTMLVideoElement =>
  document.querySelector<HTMLVideoElement>(`video[data-cg-element-id="${id}"]`)!;

/** The head only moves when something moves it here — see the header. */
function trackHeads(): void {
  document.querySelectorAll<HTMLVideoElement>('video[data-cg-element-id]').forEach((v) => {
    let t = 0;
    Object.defineProperty(v, 'currentTime', {
      get: () => t,
      set: (x: number) => {
        t = x;
      },
      configurable: true,
    });
  });
}

function boot(a: Element[], b: Element[]) {
  const clock = makeClock();
  const r = createRuntime(scene(a, b), {
    skipFontLoad: true,
    installGlobals: false,
    clock,
    tickerMeasure,
  });
  return { r, clock };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

// ───────────────────────── 6.1 — silent and not spending frames ─────────────────────────

describe('a hidden look is parked; the visible one is not', () => {
  it('🔴 6.1 — the hidden look’s <video> is PAUSED and MUTED; the visible one plays', async () => {
    const { r, clock } = boot([video('vid-a')], [video('vid-b')]);
    trackHeads();
    await r.play({});
    await run(clock, 300);

    expect(r.activeLookId()).toBe('look-a');
    // The look on screen: running, and its mute is whatever the builder set — the park
    // did not touch it.
    expect(vid('vid-a').paused).toBe(false);
    // The look nobody can see: frozen, and silent whatever the pause policy later becomes.
    expect(vid('vid-b').paused).toBe(true);
    expect(vid('vid-b').muted).toBe(true);
    r.remove();
  });

  it('🔴 6.1b — the park survives PLAY, which starts every driver in every look', async () => {
    /*
      `play()` resets and starts every driver in every subtree — it knows nothing about
      looks — so this is the moment the park is most easily undone. Asserted straight after
      the run begins rather than after a switch, because a park that only holds once
      somebody switches is exactly the one that fails on air.
    */
    const { r, clock } = boot([video('vid-a')], [video('vid-b')]);
    trackHeads();
    await r.play({});
    await run(clock, 40);
    expect(vid('vid-b').paused).toBe(true);
    r.remove();
  });

  it('🔴 the park follows the ARRANGEMENT VIEW too — un-hiding a look revives its media', async () => {
    /*
      Both statements of visibility flow through ONE `repunch`: the look flip and the A′
      `setArrangementView`. `setArrangementView(undefined)` un-hides every look instance —
      that seam's own header says so — so a park derived at `applyLook` instead would go on
      holding those instances' media frozen while they were visible. Deriving it from the
      `view` inside `repunch` makes that impossible rather than merely handled: an ABSENT
      visibility entry means "this view does not speak about it" and leaves the member live.
    */
    const { r, clock } = boot([video('vid-a')], [video('vid-b')]);
    trackHeads();
    await r.play({});
    await run(clock, 300);
    expect(vid('vid-b').paused, 'parked while its look is hidden').toBe(true);

    r.setArrangementView(undefined);
    await run(clock, 200);

    expect(vid('vid-b').paused, 'visible again ⇒ running again').toBe(false);
    expect(vid('vid-a').paused).toBe(false);
    r.remove();
  });
});

// ───────────────── 6.2 — enter → leave → re-enter RESUMES IN PLACE ──────────────────

describe('leaving and returning', () => {
  it('🔴 6.2 — a returning clip continues from where it was, and is NOT rewound', async () => {
    const { r, clock } = boot([video('vid-a')], [video('vid-b')]);
    trackHeads();
    await r.play({});
    await run(clock, 300);

    // Stand in for the decoder: the clip has played 420ms of its second. See the header —
    // happy-dom advances no media head on its own.
    vid('vid-a').currentTime = 0.42;

    expect(r.setActiveLook('look-b')).toBe(true);
    await run(clock, 200);
    expect(vid('vid-a').paused, 'the look we left is frozen').toBe(true);
    expect(vid('vid-a').currentTime, 'and freezing did not move it').toBeCloseTo(0.42, 3);

    expect(r.setActiveLook('look-a')).toBe(true);
    await run(clock, 200);

    expect(vid('vid-a').paused, 'playing again').toBe(false);
    // 🔴 THE CLAIM: resume, not restart. `VideoDriver.resume()` re-anchors its clock to the
    // media's actual position instead of seeking the media to the clock's — so a switch
    // back is seamless rather than a visible jump to the top of the clip.
    expect(vid('vid-a').currentTime, 'resumed IN PLACE').toBeCloseTo(0.42, 2);
    r.remove();
  });

  it('a returning clip’s mute is RESTORED to what it was, never forced to false', async () => {
    /*
      The opposite failure, and the worse one: a park that "restored" `muted = false` would
      be a mechanism for putting audio on air that nobody authored. The scene-builder mutes
      every `<video>` it creates, so the value captured and restored here is `true` — and
      that is precisely the point. The assertion is that the park GIVES BACK WHAT IT TOOK.

      ⚠ **This test is a FLOOR, not a proof, and it says so rather than being quietly
      counted.** Because `muted` is `true` on both sides today it also passes with the park
      removed entirely — it cannot distinguish "restored correctly" from "never touched". It
      is here to fail the day somebody adds an unmute path and reaches for `= false` on the
      revive; the tests that actually discriminate are the paused/`currentTime` ones above.
    */
    const { r, clock } = boot([video('vid-a')], [video('vid-b')]);
    trackHeads();
    await r.play({});
    await run(clock, 200);

    expect(r.setActiveLook('look-b')).toBe(true);
    await run(clock, 100);
    expect(vid('vid-a').muted).toBe(true);

    expect(r.setActiveLook('look-a')).toBe(true);
    await run(clock, 100);
    expect(vid('vid-a').muted, 'restored, not cleared').toBe(true);
    r.remove();
  });
});

// ─────────────────────────── 6.3 — DISJOINT membership ────────────────────────────

describe('disjoint membership', () => {
  it('🔴 6.3 — look A holds X, look B holds Y: exactly one of them is ever running', async () => {
    /*
      The shape that hides a rule which only handles the overlap case: the two looks share
      no member at all, so every park and every revive is exercised on the switch and
      nothing can pass by leaving both alone.
    */
    const { r, clock } = boot([video('vid-x')], [video('vid-y')]);
    trackHeads();
    await r.play({});
    await run(clock, 300);

    const running = (): string[] => ['vid-x', 'vid-y'].filter((id) => !vid(id).paused);
    const silent = (): string[] => ['vid-x', 'vid-y'].filter((id) => vid(id).muted);

    expect(running()).toEqual(['vid-x']);
    expect(silent()).toContain('vid-y');

    expect(r.setActiveLook('look-b')).toBe(true);
    await run(clock, 200);
    expect(running(), 'the switch moved the whole membership').toEqual(['vid-y']);
    expect(silent()).toContain('vid-x');

    expect(r.setActiveLook('look-a')).toBe(true);
    await run(clock, 200);
    expect(running()).toEqual(['vid-x']);
    r.remove();
  });
});

// ──────────── 6.4 — the OTHER kinds §4.4 turned up, each on its own rule ─────────────

describe('what else runs inside a hidden look', () => {
  it('🔴 6.4 — a CRAWL in a hidden look stops crawling (the same defect in another hat)', async () => {
    /*
      `drivesHold: false` — and that is not incidental. A ticker's hold participation is
      OPT-OUT, so a default crawl GATES the hold, and a paused driver never completes: park
      one that gates the hold and the graphic never comes off air. The park therefore
      freezes only content that does not gate a hold, which for tickers means the ones
      explicitly excluded from it. The next test pins the other half of that rule.
    */
    const { r, clock } = boot(
      [ticker('t-a', { drivesHold: false })],
      [ticker('t-b', { drivesHold: false })],
    );
    await r.play({});
    await run(clock, 600);

    const track = (id: string): HTMLElement =>
      document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"] .cg-ticker-track`)!;
    const hiddenAt = track('t-b').style.transform;
    const shownAt = track('t-a').style.transform;

    await run(clock, 600);

    expect(track('t-b').style.transform, 'the hidden crawl is frozen').toBe(hiddenAt);
    expect(track('t-a').style.transform, 'the visible one keeps crawling').not.toBe(shownAt);
    r.remove();
  });

  it('🔴 6.4b — a crawl that GATES THE HOLD is left running, or the graphic never exits', async () => {
    const { r, clock } = boot([ticker('t-a')], [ticker('t-b')]);
    await r.play({});
    await run(clock, 600);

    const track = (id: string): HTMLElement =>
      document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"] .cg-ticker-track`)!;
    const before = track('t-b').style.transform;
    await run(clock, 600);

    expect(
      track('t-b').style.transform,
      'a hold-gating crawl keeps running even hidden — see look-media.ts',
    ).not.toBe(before);
    r.remove();
  });

  it('🔴 6.4c — a CLOCK in a hidden look is NEVER parked: it must not lie about the time', async () => {
    /*
      The counter-example, and the reason "park everything hidden" is the wrong rule.
      `ClockDriver.resume()` accrues the paused interval into `pausedAccumMs`, which
      `activeElapsedMs()` subtracts — so a parked duration countdown would come back
      claiming the hidden interval as time it still has. A clock tracks time that passes
      whether or not anyone is looking; it is registered with the park nowhere.
    */
    const { r, clock } = boot([wallClock('c-a')], [wallClock('c-b')]);
    await r.play({});
    await run(clock, 600);

    const text = (id: string): string =>
      document.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`)?.textContent ?? '';
    expect(text('c-b'), 'the hidden clock still paints').not.toBe('');
    r.remove();
  });
});
