import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTicker, tickerPresetFor } from '../src/ticker.js';
import type { TextElement } from '@cg/shared-schema';

/**
 * M8.1 — Mixed RTL/LTR ticker with seamless wrap.
 *
 * The wrap is the load-bearing invariant: `offset()` may never produce
 * a visible discontinuity. We test this by stepping the rAF loop with
 * a controlled clock and observing the offset trajectory.
 */

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  host.style.width = '100px';
  // happy-dom doesn't lay out — we hand the ticker a known item width via
  // the fallback in installTicker (200px when getBoundingClientRect is 0).
  document.body.appendChild(host);
  const span = document.createElement('span');
  span.textContent = 'breaking news — ';
  host.appendChild(span);
  return host;
}

interface FakeRaf {
  schedule: (cb: (timestamp: number) => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
  advance: (ms: number) => void;
}

function fakeRaf(): FakeRaf {
  let clock = 1000;
  const pending: { id: number; cb: (t: number) => void }[] = [];
  let nextId = 1;
  return {
    schedule(cb): number {
      const id = nextId++;
      pending.push({ id, cb });
      return id;
    },
    cancel(handle): void {
      const idx = pending.findIndex((p) => p.id === handle);
      if (idx !== -1) pending.splice(idx, 1);
    },
    now(): number {
      return clock;
    },
    advance(ms): void {
      clock += ms;
      // Fire any scheduled callbacks once, in order; new ones go to the
      // next advance() call so the test controls timing precisely.
      const fired = pending.splice(0, pending.length);
      for (const p of fired) p.cb(clock);
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('installTicker', () => {
  it('throws on non-positive speed', () => {
    const host = makeHost();
    expect(() => installTicker(host, { speedPxPerSec: 0, direction: 'ltr' })).toThrow();
  });

  it('LTR direction: offset decreases over time, snaps back to 0 after item width', () => {
    const host = makeHost();
    const f = fakeRaf();
    const handle = installTicker(host, {
      speedPxPerSec: 200,
      direction: 'ltr',
      raf: f.schedule,
      cancelRaf: f.cancel,
      now: f.now,
    });
    // Item width falls back to 200 (happy-dom getBoundingClientRect=0).
    expect(handle.offset()).toBe(0);

    f.advance(500); // 0.5s × 200 = 100px
    expect(handle.offset()).toBeCloseTo(-100, 1);

    f.advance(500); // another 100px → -200 → seamless snap to 0
    expect(handle.offset()).toBeCloseTo(0, 1);

    handle.dispose();
  });

  it('RTL direction: offset increases from -w toward 0, snaps back to -w', () => {
    const host = makeHost();
    const f = fakeRaf();
    const handle = installTicker(host, {
      speedPxPerSec: 200,
      direction: 'rtl',
      raf: f.schedule,
      cancelRaf: f.cancel,
      now: f.now,
    });
    expect(handle.offset()).toBe(-200);

    f.advance(500);
    expect(handle.offset()).toBeCloseTo(-100, 1);

    f.advance(500); // hits 0 → snap to -200
    expect(handle.offset()).toBeCloseTo(-200, 1);

    handle.dispose();
  });

  it('dispose() restores the original DOM exactly', () => {
    const host = makeHost();
    const beforeHTML = host.innerHTML;
    const f = fakeRaf();
    const handle = installTicker(host, {
      speedPxPerSec: 100,
      direction: 'ltr',
      raf: f.schedule,
      cancelRaf: f.cancel,
      now: f.now,
    });
    // Track is now installed — original markup is wrapped.
    expect(host.querySelector('.cg-ticker-track')).not.toBeNull();
    handle.dispose();
    expect(host.querySelector('.cg-ticker-track')).toBeNull();
    expect(host.innerHTML).toBe(beforeHTML);
  });

  it('pause/resume halts and continues the offset trajectory', () => {
    const host = makeHost();
    const f = fakeRaf();
    const handle = installTicker(host, {
      speedPxPerSec: 200,
      direction: 'ltr',
      raf: f.schedule,
      cancelRaf: f.cancel,
      now: f.now,
    });
    f.advance(250); // -50
    handle.pause();
    f.advance(1000); // wall clock advances but no rAF callbacks fire
    expect(handle.offset()).toBeCloseTo(-50, 1);
    handle.resume();
    f.advance(250); // another -50 from resume point
    expect(handle.offset()).toBeCloseTo(-100, 1);
    handle.dispose();
  });

  it('pauseOnHover wires pointer handlers', () => {
    const host = makeHost();
    const f = fakeRaf();
    const addSpy = vi.spyOn(host, 'addEventListener');
    const handle = installTicker(host, {
      speedPxPerSec: 200,
      direction: 'ltr',
      pauseOnHover: true,
      raf: f.schedule,
      cancelRaf: f.cancel,
      now: f.now,
    });
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain('pointerenter');
    expect(events).toContain('pointerleave');
    handle.dispose();
    addSpy.mockRestore();
  });
});

describe('tickerPresetFor', () => {
  function makeTextElement(
    loop: TextElement['animation'] extends infer A ? A : never,
  ): TextElement {
    const base: TextElement = {
      id: 't',
      name: 't',
      type: 'text',
      transform: {
        position: { x: 0, y: 0 },
        size: { w: 100, h: 100 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0, y: 0 },
      },
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      text: 'hello',
      font: {
        family: 'Inter',
        weight: 400,
        style: 'normal',
        size: 16,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
      color: '#FFF',
      align: 'start',
      direction: 'auto',
      fitMode: 'fixed',
      overflow: 'clip',
    };
    if (loop !== undefined) base.animation = loop;
    return base;
  }

  it('returns null for elements without a ticker loop', () => {
    expect(tickerPresetFor(makeTextElement(undefined))).toBeNull();
    expect(tickerPresetFor(makeTextElement({ loop: { kind: 'none' } }))).toBeNull();
    expect(
      tickerPresetFor(
        makeTextElement({ loop: { kind: 'pulse', duration: 30, minOpacity: 0.5, maxOpacity: 1 } }),
      ),
    ).toBeNull();
  });

  it('extracts speed + direction + optional pauseOnHover', () => {
    const result = tickerPresetFor(
      makeTextElement({
        loop: { kind: 'ticker', speed: 120, direction: 'rtl', pauseOnHover: true },
      }),
    );
    expect(result).toEqual({ speed: 120, direction: 'rtl', pauseOnHover: true });
  });

  it('omits pauseOnHover when undefined (preserves exactOptionalPropertyTypes)', () => {
    const result = tickerPresetFor(
      makeTextElement({ loop: { kind: 'ticker', speed: 60, direction: 'ltr' } }),
    );
    expect(result).toEqual({ speed: 60, direction: 'ltr' });
    expect('pauseOnHover' in (result ?? {})).toBe(false);
  });
});
