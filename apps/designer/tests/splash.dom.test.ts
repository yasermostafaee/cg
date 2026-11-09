// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPLASH_CEILING_MS,
  SPLASH_FADE_MS,
  SPLASH_LABEL_FADE_MS,
  SPLASH_PHASES,
  splashDismissAt,
  splashProgress,
  splashProgressPercent,
} from '../src/renderer/splashTiming.js';

/**
 * THE SPLASH'S CLOCK, driven in jsdom out of the REAL `index.html`.
 *
 * The splash paints before the bundle, so its clock cannot import `splashTiming.ts` — it
 * mirrors those constants as literals in an inline script. That duplication is the one thing
 * about this feature that can rot silently, and this file is the containment: it reads the
 * actual document, runs the actual script, and checks both halves — that the mirrored
 * constants still equal the module's, and that the script dismisses at the instant
 * `splashDismissAt` says.
 *
 * It deliberately does NOT re-implement the markup. Everything below is extracted from
 * `apps/designer/index.html`, so a splash edited without its test coming along fails here
 * rather than in front of an operator.
 */

// Resolved from the workspace cwd, not from `import.meta.url`: under the jsdom environment
// `import.meta.url` is an `http://` URL, so `fileURLToPath` refuses it.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** The inline (attribute-less) `<script>` — the splash's clock. */
const inlineScript = (() => {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (match === null)
    throw new Error('no inline <script> in index.html — the splash clock is gone');
  return match[1]!;
})();

/** The document body with both `<script>` blocks stripped — the splash's markup. */
const bodyMarkup = (() => {
  const match = /<body>([\s\S]*)<\/body>/.exec(html);
  if (match === null) throw new Error('no <body> in index.html');
  return match[1]!.replace(/<script[\s\S]*?<\/script>/g, '');
})();

/** A numeric `var NAME = 123;` from the inline script. */
function inlineNumber(name: string): number {
  const match = new RegExp(`var ${name} = (\\d+);`).exec(inlineScript);
  if (match === null) throw new Error(`inline script no longer declares ${name}`);
  return Number(match[1]);
}

function runSplashScript(): void {
  // Evaluated rather than imported on purpose: this IS the shipped script, character for
  // character, not a copy of it kept in the test.
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
  vi.clearAllTimers();
  vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
  document.body.innerHTML = bodyMarkup;
  delete (window as unknown as { __CG_SPLASH__?: unknown }).__CG_SPLASH__;
  delete (window as unknown as { __CG_SPLASH_DISABLED__?: unknown }).__CG_SPLASH_DISABLED__;
});

afterEach(() => {
  // Several tests end with timers deliberately pending — the ceiling armed and never
  // reached, or the fade caught mid-flight. That is the state under test. What is not
  // acceptable is carrying that queue into the NEXT test, because `vi.getTimerCount()` is a
  // GLOBAL count and a leaked timer makes another test's "nothing was scheduled" read
  // someone else's work.
  vi.clearAllTimers();
  vi.useRealTimers();
});

const shownPct = (): string | null => document.getElementById('cg-splash-pct')?.textContent ?? null;
const phaseLabel = (): string | null =>
  document.getElementById('cg-splash-phase')?.textContent ?? null;

describe('the inline splash mirrors the startup timing contract', () => {
  it('uses the same ceiling, fade and phase list', () => {
    expect(inlineNumber('CEILING_MS')).toBe(SPLASH_CEILING_MS);
    expect(inlineNumber('FADE_MS')).toBe(SPLASH_FADE_MS);
    const listed = /var PHASES = \[([^\]]+)\]/
      .exec(inlineScript)?.[1]
      ?.split(',')
      .map((part) => part.trim().replaceAll("'", ''));
    expect(listed).toEqual([...SPLASH_PHASES]);
    expect(html).toContain(
      `#cg-splash-phase {\n        transition: opacity ${String(SPLASH_LABEL_FADE_MS / 1000)}s ease;`,
    );
  });

  it('shows the fraction of completed phases on both the rail and the readout', () => {
    runSplashScript();
    expect(shownPct()).toBe('0%');
    for (const [completedSteps, phase] of SPLASH_PHASES.entries()) {
      splash().phase(phase);
      const progress = splashProgressPercent(
        splashProgress({ completedSteps, totalSteps: SPLASH_PHASES.length }),
      );
      expect(shownPct()).toBe(`${String(progress)}%`);
      expect(document.getElementById('cg-splash-fill')?.style.transform).toBe(
        `scaleX(${String(progress / 100)})`,
      );
      expect(phaseLabel()).toBe(phase);
    }
    vi.advanceTimersByTime(9000);
    expect(shownPct()).toBe('66%');
    splash().phase('UNKNOWN');
    splash().phase(SPLASH_PHASES[0]);
    expect(shownPct()).toBe('66%');
    expect(phaseLabel()).toBe(SPLASH_PHASES[2]);
    expect(inlineScript).not.toMatch(/sessionStorage|setInterval/);
  });

  it.each([0, 120, 9000])('dismisses immediately when boot finishes at %i ms', (bootMs) => {
    const firstPaintAt = Date.now();
    runSplashScript();
    vi.advanceTimersByTime(bootMs);
    const bootDoneAt = Date.now();
    expect(splashDismissAt({ firstPaintAt, bootDoneAt })).toBe(bootDoneAt);
    expect(splashEl()?.hasAttribute('data-dismissing')).toBe(false);
    splash().done();
    expect(shownPct()).toBe('100%');
    expect(splashEl()?.getAttribute('data-dismissing')).toBe('true');
    expect(splashEl()?.getAttribute('aria-hidden')).toBe('true');
    expect(document.getElementById('cg-splash-readout')?.getAttribute('data-done')).toBe('true');
    expect(phaseLabel()).not.toMatch(/ready/i);
    vi.advanceTimersByTime(SPLASH_FADE_MS - 1);
    expect(splashEl()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(splashEl()).toBeNull();
  });

  it('the ceiling dismisses a stuck boot without claiming 100%', () => {
    runSplashScript();
    splash().phase(SPLASH_PHASES[1]);
    vi.advanceTimersByTime(SPLASH_CEILING_MS - 1);
    expect(splashEl()?.hasAttribute('data-dismissing')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(splashEl()?.getAttribute('data-dismissing')).toBe('true');
    expect(shownPct()).toBe('33%');
    splash().done();
    expect(shownPct()).toBe('33%');
    vi.advanceTimersByTime(SPLASH_FADE_MS);
    expect(splashEl()).toBeNull();
  });

  it('schedules the fade removal once even if boot completion is reported repeatedly', () => {
    runSplashScript();
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    try {
      splash().done();
      splash().done();
      vi.advanceTimersByTime(SPLASH_FADE_MS);
      splash().done();
      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(splashEl()).toBeNull();
    } finally {
      scheduled.mockRestore();
    }
  });
});

describe('the test-suite door', () => {
  it('the bypass global removes the splash outright — no clock, no timers, no hold', () => {
    (window as unknown as { __CG_SPLASH_DISABLED__: boolean }).__CG_SPLASH_DISABLED__ = true;

    // A SPY OVER THE SCRIPT rather than a reading of `vi.getTimerCount()`: the counter is a
    // global that counts everything the fake clock owns (rAF included), so it would be
    // asserting "nothing anywhere in this environment is pending", which was never the
    // claim. What the bypass promises is that IT schedules nothing.
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    const repeated = vi.spyOn(globalThis, 'setInterval');
    runSplashScript();

    expect(splashEl()).toBeNull();
    expect(
      (window as unknown as { __CG_SPLASH__?: unknown }).__CG_SPLASH__,
      'a disabled splash must not install a control surface',
    ).toBeUndefined();
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
    // pass because the spy never observes this script's scheduling at all.
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
