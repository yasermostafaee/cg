// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPLASH_CEILING_MS,
  SPLASH_COLD_FLOOR_MS,
  SPLASH_FADE_MS,
  SPLASH_PHASES,
  SPLASH_SESSION_KEY,
  SPLASH_TICK_MS,
  SPLASH_WARM_FLOOR_MS,
  splashDismissAt,
  splashProgress,
  splashProgressPercent,
} from '../src/renderer/splashTiming.js';

/**
 * R-031 — THE SPLASH'S CLOCK, driven in jsdom out of the REAL `index.html`.
 *
 * The splash paints before the bundle, so its clock cannot import
 * `splashTiming.ts` — it mirrors those constants as literals in an inline script.
 * That duplication is the one thing about this feature that can rot silently, and
 * this file is the containment: it reads the actual document, runs the actual
 * script, and checks both halves — that the mirrored constants still equal the
 * module's, and that the script dismisses at the instant `splashDismissAt` says.
 *
 * It deliberately does NOT re-implement the markup. Everything below is extracted
 * from `apps/runtime/index.html`, so a splash edited without its test coming along
 * fails here rather than in front of an operator.
 */

// Resolved from the workspace cwd, not from `import.meta.url`: under the jsdom
// environment `import.meta.url` is an `http://` URL, so `fileURLToPath` refuses it.
// (`splashCss.test.ts` runs in the node environment and can use the URL form.)
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** The inline (attribute-less) `<script>` — the splash's clock. */
const inlineScript = (() => {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (match === null)
    throw new Error('no inline <script> in index.html — the splash clock is gone');
  return match[1];
})();

/** The document body with both `<script>` blocks stripped — the splash's markup. */
const bodyMarkup = (() => {
  const match = /<body>([\s\S]*)<\/body>/.exec(html);
  if (match === null) throw new Error('no <body> in index.html');
  return match[1].replace(/<script[\s\S]*?<\/script>/g, '');
})();

/** A numeric `var NAME = 123;` from the inline script. */
function inlineNumber(name: string): number {
  const match = new RegExp(`var ${name} = (\\d+);`).exec(inlineScript);
  if (match === null) throw new Error(`inline script no longer declares ${name}`);
  return Number(match[1]);
}

function runSplashScript(): void {
  // Evaluated rather than imported on purpose: this IS the shipped script, character
  // for character, not a copy of it kept in the test.
  new Function(inlineScript)();
}

function splashEl(): HTMLElement | null {
  return document.getElementById('cg-splash');
}

function splash(): { phase(key: string): void; done(): void } {
  const api = (window as unknown as { __CG_SPLASH__?: { phase(k: string): void; done(): void } })
    .__CG_SPLASH__;
  if (api === undefined) throw new Error('the splash did not install window.__CG_SPLASH__');
  return api;
}

beforeEach(() => {
  vi.useFakeTimers();
  // Start from an empty queue no matter what ran before — see `afterEach`.
  vi.clearAllTimers();
  vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
  document.body.innerHTML = bodyMarkup;
  window.sessionStorage.clear();
  delete (window as unknown as { __CG_SPLASH__?: unknown }).__CG_SPLASH__;
  delete (window as unknown as { __CG_SPLASH_DISABLED__?: unknown }).__CG_SPLASH_DISABLED__;
});

afterEach(() => {
  /**
   * DRAIN THE QUEUE EXPLICITLY. Seven tests in this file end with timers deliberately
   * pending — the ceiling armed and never reached, or the 450 ms fade caught mid-flight.
   * That is the state under test, not sloppiness, and making each of them tidy up would
   * blur what each one is actually asserting.
   *
   * What is NOT acceptable is carrying that queue into the NEXT test, because
   * `vi.getTimerCount()` is a GLOBAL count: a leaked timer makes another test's "nothing
   * was scheduled" assertion read someone else's work. Leaning on `useRealTimers()` to
   * discard the queue is leaning on an implementation detail — it held on Windows and did
   * not on CI's Linux runner, which is exactly how this arrived as a green-here-red-there
   * (the bypass test read 1 pending timer that its own code had not created).
   */
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('the inline clock mirrors splashTiming.ts', () => {
  it('declares the same floors, ceiling, fade and tick', () => {
    expect(inlineNumber('COLD_FLOOR_MS')).toBe(SPLASH_COLD_FLOOR_MS);
    expect(inlineNumber('WARM_FLOOR_MS')).toBe(SPLASH_WARM_FLOOR_MS);
    expect(inlineNumber('CEILING_MS')).toBe(SPLASH_CEILING_MS);
    expect(inlineNumber('FADE_MS')).toBe(SPLASH_FADE_MS);
    expect(inlineNumber('TICK_MS')).toBe(SPLASH_TICK_MS);
  });

  it('uses the same session marker and the same phase list', () => {
    expect(inlineScript).toContain(`var SESSION_KEY = '${SPLASH_SESSION_KEY}';`);
    const phases = /var PHASES = \[([\s\S]*?)\];/.exec(inlineScript);
    expect(phases, 'inline script no longer declares PHASES').not.toBeNull();
    const listed = [...(phases?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(listed).toEqual([...SPLASH_PHASES]);
  });
});

describe('the phase readout', () => {
  /** The percentage the inline script is currently showing. */
  function shownPct(): string | undefined {
    return document.getElementById('cg-splash-pct')?.textContent ?? undefined;
  }

  /**
   * The rail, read back as a percentage — it is SCALED rather than widened (an animated
   * width would cost layout on every one of the ~50 ticks of a cold hold), and it must be
   * the SAME number as the readout, which is the whole point of one definition.
   */
  function railPct(): string | undefined {
    const transform = document.getElementById('cg-splash-fill')?.style.transform ?? '';
    const scale = /scaleX\(([\d.]+)\)/.exec(transform);
    return scale === null ? undefined : `${Math.round(Number(scale[1]) * 100)}%`;
  }

  /** What the pure module says the readout should show. The oracle, never a typed literal. */
  function expected(elapsedMs: number, completedSteps: number): string {
    return `${splashProgressPercent(
      splashProgress({
        elapsedMs,
        floorMs: SPLASH_COLD_FLOOR_MS,
        completedSteps,
        totalSteps: SPLASH_PHASES.length,
      }),
    )}%`;
  }

  it('starts at 0% — on the first frame nothing has finished yet', () => {
    runSplashScript();
    expect(document.getElementById('cg-splash-phase')?.textContent).toBe('INITIALIZING');
    expect(shownPct()).toBe(expected(0, 0));
    expect(shownPct()).toBe('0%');
    expect(railPct()).toBe('0%');
  });

  it('the readout is a PERCENTAGE and the rail is the same number', () => {
    runSplashScript();
    // A step is finished when the NEXT one begins, so entering step 2 puts one behind us.
    // The clock is at 0 here, so the `min` pins both readings to the clock's 0.
    splash().phase('PROBING BRIDGE');
    expect(shownPct()).toBe(expected(0, 1));
    expect(railPct()).toBe(shownPct());

    // Let the floor run out; now the gate is the STEP count, not the clock.
    vi.advanceTimersByTime(SPLASH_COLD_FLOOR_MS);
    expect(shownPct()).toBe(expected(SPLASH_COLD_FLOOR_MS, 1));
    expect(shownPct()).toBe('33%');

    splash().phase('STARTING INTERFACE');
    expect(shownPct()).toBe('66%');
    expect(railPct()).toBe(shownPct());
    // NOT 100 — the last label is on screen, so the last step is still RUNNING.
    expect(shownPct()).not.toBe('100%');
  });

  it('the number ticks on its own while the hold runs, without a phase call', () => {
    // The left side goes empty after boot-done and the percentage carries the rest of the
    // hold alone; that only works if something advances it between events.
    runSplashScript();
    splash().done();
    const early = shownPct();
    vi.advanceTimersByTime(SPLASH_COLD_FLOOR_MS / 2);
    expect(shownPct()).not.toBe(early);
    expect(shownPct()).toBe(expected(SPLASH_COLD_FLOOR_MS / 2, SPLASH_PHASES.length));
  });

  it('reaches 100% exactly when the splash may dismiss, and not before', () => {
    runSplashScript();
    splash().done();
    vi.advanceTimersByTime(SPLASH_COLD_FLOOR_MS - SPLASH_TICK_MS);
    expect(shownPct()).not.toBe('100%');

    vi.advanceTimersByTime(SPLASH_TICK_MS);
    expect(shownPct()).toBe('100%');
    expect(railPct()).toBe('100%');
  });

  it('the ceiling dismisses with the percentage HONESTLY below 100', () => {
    // The boot never finishes. Pretending the number got there would invent the one thing
    // this readout refuses to invent.
    runSplashScript();
    splash().phase('PROBING BRIDGE');
    vi.advanceTimersByTime(SPLASH_CEILING_MS);
    expect(splashEl()?.getAttribute('data-dismissing')).toBe('true');
    expect(shownPct()).toBe('33%');
  });

  it('ignores a phase key it does not know rather than corrupting the readout', () => {
    runSplashScript();
    splash().phase('LOADING SNAPSHOTS');
    expect(document.getElementById('cg-splash-phase')?.textContent).toBe('INITIALIZING');
    expect(shownPct()).toBe('0%');
  });

  it('THE LABEL LEAVES on boot-done — it never settles on a terminal word', () => {
    // A fast cold boot is done about a second in while the door stays shut until 5 s, so
    // a "READY" label would be on screen for most of the splash at exactly the moment the
    // operator still cannot use the app. The label fades; the percentage carries the rest.
    runSplashScript();
    splash().phase('STARTING INTERFACE');
    expect(document.getElementById('cg-splash-readout')?.getAttribute('data-done')).toBeNull();

    splash().done();
    expect(document.getElementById('cg-splash-readout')?.getAttribute('data-done')).toBe('true');
    // The PERCENTAGE stays — it carries the remaining hold once the label is gone.
    expect(shownPct()).toBeDefined();
  });

  it('says READY nowhere — not in the markup, the CSS, or the script', () => {
    // Comments are stripped first: the document DOCUMENTS the rejected label on purpose
    // (so nobody reintroduces it), and a test that trips on its own rationale is a test
    // people delete. Word-bounded so "already" neither satisfies nor breaks it, and
    // case-insensitive so a lower-case reintroduction is caught too.
    const withoutComments = html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    expect(withoutComments, 'the terminal READY label is back in index.html').not.toMatch(
      /\bready\b/i,
    );
    expect([...SPLASH_PHASES]).toHaveLength(3);
  });
});

describe('the hold', () => {
  it('a cold start holds the full five seconds even when boot finishes at once', () => {
    const t0 = Date.now();
    runSplashScript();
    splash().done();

    // The oracle is the pure module, not a number typed twice.
    const expectedAt = splashDismissAt({ firstPaintAt: t0, bootDoneAt: t0, coldStart: true });
    expect(expectedAt - t0).toBe(SPLASH_COLD_FLOOR_MS);

    vi.advanceTimersByTime(expectedAt - t0 - 1);
    expect(splashEl()?.getAttribute('data-dismissing')).toBeNull();

    vi.advanceTimersByTime(1);
    expect(splashEl()?.getAttribute('data-dismissing')).toBe('true');

    // …and it REMOVES itself. A full-screen overlay left in the DOM swallows clicks.
    vi.advanceTimersByTime(SPLASH_FADE_MS);
    expect(splashEl()).toBeNull();
  });

  it('a warm reload — the session marker already set — dismisses at the short floor', () => {
    window.sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
    const t0 = Date.now();
    runSplashScript();
    splash().done();

    const expectedAt = splashDismissAt({ firstPaintAt: t0, bootDoneAt: t0, coldStart: false });
    expect(expectedAt - t0).toBe(SPLASH_WARM_FLOOR_MS);

    vi.advanceTimersByTime(SPLASH_WARM_FLOOR_MS - 1);
    expect(splashEl()?.getAttribute('data-dismissing')).toBeNull();
    vi.advanceTimersByTime(1);
    expect(splashEl()?.getAttribute('data-dismissing')).toBe('true');
  });

  it('writes the session marker on a cold start, so the next reload is warm', () => {
    expect(window.sessionStorage.getItem(SPLASH_SESSION_KEY)).toBeNull();
    runSplashScript();
    expect(window.sessionStorage.getItem(SPLASH_SESSION_KEY)).toBe('1');
  });

  it('a boot slower than the floor extends the hold to boot', () => {
    runSplashScript();
    vi.advanceTimersByTime(9000);
    expect(splashEl()?.getAttribute('data-dismissing')).toBeNull();

    splash().done();
    vi.advanceTimersByTime(1);
    expect(splashEl()?.getAttribute('data-dismissing')).toBe('true');
  });

  it('the ceiling dismisses a boot that never completes', () => {
    runSplashScript();
    // `done()` is never called — the app is stuck. The splash still has to go: without
    // it the operator has no door into the application at all.
    vi.advanceTimersByTime(SPLASH_CEILING_MS - 1);
    expect(splashEl()?.getAttribute('data-dismissing')).toBeNull();

    vi.advanceTimersByTime(1);
    expect(splashEl()?.getAttribute('data-dismissing')).toBe('true');
    vi.advanceTimersByTime(SPLASH_FADE_MS);
    expect(splashEl()).toBeNull();
  });

  it('done() twice schedules the hold once', () => {
    runSplashScript();
    splash().done();
    const armed = vi.getTimerCount();

    // StrictMode re-runs mount effects in development, so this happens every dev boot.
    splash().done();
    expect(vi.getTimerCount()).toBe(armed);

    vi.advanceTimersByTime(SPLASH_COLD_FLOOR_MS);
    expect(splashEl()?.getAttribute('data-dismissing')).toBe('true');
    vi.advanceTimersByTime(SPLASH_FADE_MS);
    expect(splashEl()).toBeNull();

    // A third signal after dismissal must not resurrect a timer either.
    splash().done();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the test-suite door', () => {
  it('the bypass global removes the splash outright — no clock, no timers, no hold', () => {
    (window as unknown as { __CG_SPLASH_DISABLED__: boolean }).__CG_SPLASH_DISABLED__ = true;

    /**
     * A SPY OVER THE SCRIPT, not a reading of `vi.getTimerCount()`.
     *
     * The counter was the wrong instrument and that is why this was green on Windows and
     * red on Linux CI. It counts everything the fake clock owns — `requestAnimationFrame`
     * included (probed: one rAF makes it read 1, while microtasks and MutationObserver
     * deliveries do not) — so it was asserting "nothing anywhere in this environment is
     * pending". That was never the claim, and it is not something this test controls: on
     * the Linux runner it already read 1 BEFORE the splash script had run at all.
     *
     * What the bypass actually promises is that IT schedules nothing. A spy across the
     * call measures exactly that, absolutely rather than relatively, and cannot be moved
     * by anything else sharing the environment. `is off by default` below is its positive
     * control — the same spy MUST catch the normal path arming its ceiling, so this
     * assertion cannot pass by simply failing to observe.
     */
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    // The readout's 100 ms ticker is an INTERVAL, so the bypass's "no timers" promise is
    // only checked if the spy covers that too — a repeating timer left running under a
    // disabled splash would be the worse of the two leaks.
    const repeated = vi.spyOn(globalThis, 'setInterval');
    runSplashScript();

    expect(splashEl()).toBeNull();
    expect(
      (window as unknown as { __CG_SPLASH__?: unknown }).__CG_SPLASH__,
      'a disabled splash must not install a control surface',
    ).toBeUndefined();
    // A SYNCHRONOUS no-op: `el.remove()` and return. Not even the ~450 ms fade may be
    // scheduled — that fade in every E2E is the exact cost the bypass exists to avoid.
    expect(
      scheduled,
      'the bypass path scheduled something — it must be a synchronous no-op',
    ).not.toHaveBeenCalled();
    expect(repeated, 'the bypass path armed a repeating timer').not.toHaveBeenCalled();
    scheduled.mockRestore();
    repeated.mockRestore();
  });

  it('is off by default — an absent global shows the splash, and DOES arm its clock', () => {
    // The positive control for the test above. Without it, `not.toHaveBeenCalled()` could
    // pass because the spy never observes this script's scheduling at all rather than
    // because the bypass declined to schedule.
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    runSplashScript();

    expect(splashEl()).not.toBeNull();
    expect(
      scheduled,
      'the spy cannot see the script scheduling — the bypass assertion would be vacuous',
    ).toHaveBeenCalled();
    scheduled.mockRestore();
  });

  it('is not reachable from the URL — the script never reads location', () => {
    // A query parameter is a door an operator can reach by bookmark or typo.
    expect(inlineScript).not.toMatch(/location|URLSearchParams|search/);
  });
});

describe('the boot path may report to the splash and may never depend on it', () => {
  it('a document with no splash element leaves no control surface and throws nothing', () => {
    document.body.innerHTML = '<div id="root"></div>';
    expect(() => {
      runSplashScript();
    }).not.toThrow();
    expect((window as unknown as { __CG_SPLASH__?: unknown }).__CG_SPLASH__).toBeUndefined();
  });
});
