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
  SPLASH_WARM_FLOOR_MS,
  splashDismissAt,
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
  vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
  document.body.innerHTML = bodyMarkup;
  window.sessionStorage.clear();
  delete (window as unknown as { __CG_SPLASH__?: unknown }).__CG_SPLASH__;
  delete (window as unknown as { __CG_SPLASH_DISABLED__?: unknown }).__CG_SPLASH_DISABLED__;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the inline clock mirrors splashTiming.ts', () => {
  it('declares the same floors, ceiling and fade', () => {
    expect(inlineNumber('COLD_FLOOR_MS')).toBe(SPLASH_COLD_FLOOR_MS);
    expect(inlineNumber('WARM_FLOOR_MS')).toBe(SPLASH_WARM_FLOOR_MS);
    expect(inlineNumber('CEILING_MS')).toBe(SPLASH_CEILING_MS);
    expect(inlineNumber('FADE_MS')).toBe(SPLASH_FADE_MS);
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
  it('starts at INITIALIZING, one of three, with the rail a third along', () => {
    runSplashScript();
    expect(document.getElementById('cg-splash-phase')?.textContent).toBe('INITIALIZING');
    expect(document.getElementById('cg-splash-step')?.textContent).toBe('1 / 3');
    expect(document.getElementById('cg-splash-fill')?.style.width).toBe('33%');
  });

  it('advances by COMPLETED PHASE, and the readout is a step counter — never a percentage', () => {
    runSplashScript();
    splash().phase('PROBING BRIDGE');
    expect(document.getElementById('cg-splash-fill')?.style.width).toBe('67%');
    expect(document.getElementById('cg-splash-step')?.textContent).toBe('2 / 3');

    splash().phase('STARTING INTERFACE');
    expect(document.getElementById('cg-splash-fill')?.style.width).toBe('100%');
    expect(document.getElementById('cg-splash-step')?.textContent).toBe('3 / 3');

    // The step counter never carries a `%` — a percentage would claim measured progress.
    expect(document.getElementById('cg-splash-step')?.textContent).not.toContain('%');
  });

  it('ignores a phase key it does not know rather than corrupting the readout', () => {
    runSplashScript();
    splash().phase('LOADING SNAPSHOTS');
    expect(document.getElementById('cg-splash-phase')?.textContent).toBe('INITIALIZING');
    expect(document.getElementById('cg-splash-step')?.textContent).toBe('1 / 3');
  });

  it('THE LABEL LEAVES on boot-done — it never settles on a terminal word', () => {
    // A fast cold boot is done about a second in while the door stays shut until 5 s, so
    // a "READY" label would be on screen for most of the splash at exactly the moment the
    // operator still cannot use the app. The label fades; the counter carries the rest.
    runSplashScript();
    splash().phase('STARTING INTERFACE');
    expect(document.getElementById('cg-splash-readout')?.getAttribute('data-done')).toBeNull();

    splash().done();
    expect(document.getElementById('cg-splash-readout')?.getAttribute('data-done')).toBe('true');
    // The COUNTER stays — it is what carries the remaining hold once the label is gone.
    expect(document.getElementById('cg-splash-step')?.textContent).toBe('3 / 3');
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
    runSplashScript();

    expect(splashEl()).toBeNull();
    expect(
      (window as unknown as { __CG_SPLASH__?: unknown }).__CG_SPLASH__,
      'a disabled splash must not install a control surface',
    ).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is off by default — an absent global shows the splash', () => {
    runSplashScript();
    expect(splashEl()).not.toBeNull();
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
