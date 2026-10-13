// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_ROW_STACKED,
  fitActionRow,
  rowDoesNotFit,
  spillsOut,
  useActionRowFit,
  watchActionRow,
} from '../src/actionRowFit.js';

/**
 * `B-319` — THE DECISION, driven with stated boxes.
 *
 * ⚠ Golden rule 12(c): jsdom has no layout, so nothing here claims that a footer FITS — the
 * boxes are handed in, and what is tested is what the code DECIDES from them and when it asks.
 * Whether a real footer keeps its buttons inside its dialog is measured in Chromium by
 * `dialog-footer-fit.spec.ts` (Designer) and `modal-geometry.spec.ts` (Runtime).
 */

interface Box {
  left: number;
  right: number;
  height?: number;
}

/** Hand an element a box; `null` is "not laid out". */
function place(el: Element, box: Box | null, seen?: (el: Element) => void): void {
  el.getBoundingClientRect = (): DOMRect => {
    seen?.(el);
    const b = box ?? { left: 0, right: 0, height: 0 };
    const width = b.right - b.left;
    return {
      left: b.left,
      right: b.right,
      x: b.left,
      y: 0,
      top: 0,
      bottom: b.height ?? 20,
      width,
      height: box === null ? 0 : (b.height ?? 20),
      toJSON: () => ({}),
    };
  };
}

/** A row 0..400 with 10 px of padding each side (content 10..390), holding `kids`. */
function row(kids: readonly (Box | null)[]): HTMLDivElement {
  const el = document.createElement('div');
  el.style.padding = '0 10px';
  place(el, { left: 0, right: 400 });
  for (const k of kids) {
    const child = document.createElement('button');
    place(child, k);
    el.appendChild(child);
  }
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('spillsOut', () => {
  const content = { start: 10, end: 390 };
  it('is false when every child lies inside the content box', () => {
    expect(
      spillsOut(content, [
        { start: 100, end: 200 },
        { start: 210, end: 390 },
      ]),
    ).toBe(false);
  });
  it('is true for the owner’s case — a child past the START edge', () => {
    expect(spillsOut(content, [{ start: -37.9, end: 30 }])).toBe(true);
  });
  it('is true for a child past the END edge', () => {
    expect(spillsOut(content, [{ start: 300, end: 395 }])).toBe(true);
  });
  it('forgives sub-pixel rounding, and nothing more', () => {
    expect(spillsOut(content, [{ start: 9.6, end: 390.4 }])).toBe(false);
    expect(spillsOut(content, [{ start: 9.4, end: 200 }])).toBe(true);
  });
});

describe('rowDoesNotFit', () => {
  const content = { start: 10, end: 390 };
  it('is false when every box is inside and every content fits its box', () => {
    expect(rowDoesNotFit(content, [{ start: 100, end: 390, overrun: 0 }])).toBe(false);
  });
  it('is true when a box spills out', () => {
    expect(rowDoesNotFit(content, [{ start: -5, end: 390, overrun: 0 }])).toBe(true);
  });
  it('is true for the Runtime’s face — a squeezed button whose label overruns it', () => {
    expect(rowDoesNotFit(content, [{ start: 100, end: 390, overrun: 37 }])).toBe(true);
  });
  it('reads one pixel of overrun as rounding', () => {
    expect(rowDoesNotFit(content, [{ start: 100, end: 390, overrun: 1 }])).toBe(false);
  });
});

/** Give an element a scrolling width wider than its client width. */
function overrun(el: Element, by: number): void {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: 100 });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 100 + by });
}

describe('fitActionRow', () => {
  it('marks a row whose button was squeezed narrower than its label', () => {
    const r = row([
      { left: 200, right: 290 },
      { left: 296, right: 390 },
    ]);
    overrun(r.children[1] as Element, 40);
    expect(fitActionRow(r)).toBe(true);
  });

  it('leaves a row that fits unmarked', () => {
    const r = row([
      { left: 200, right: 290 },
      { left: 296, right: 390 },
    ]);
    expect(fitActionRow(r)).toBe(false);
    expect(r.hasAttribute(ACTION_ROW_STACKED)).toBe(false);
  });

  it('marks a row whose first button spills out of its start edge', () => {
    const r = row([
      { left: -30, right: 60 },
      { left: 66, right: 390 },
    ]);
    expect(fitActionRow(r)).toBe(true);
    expect(r.getAttribute(ACTION_ROW_STACKED)).toBe('');
  });

  it('unmarks a stacked row that fits again', () => {
    const r = row([{ left: 296, right: 390 }]);
    r.setAttribute(ACTION_ROW_STACKED, '');
    expect(fitActionRow(r)).toBe(false);
    expect(r.hasAttribute(ACTION_ROW_STACKED)).toBe(false);
  });

  it('measures the ROW form — the mark is off while the boxes are read', () => {
    const marked: boolean[] = [];
    const r = row([]);
    r.setAttribute(ACTION_ROW_STACKED, '');
    const child = document.createElement('button');
    place(child, { left: 100, right: 200 }, () => marked.push(r.hasAttribute(ACTION_ROW_STACKED)));
    r.appendChild(child);
    fitActionRow(r);
    expect(marked).toEqual([false]);
  });

  it('never stacks a row with no layout', () => {
    const r = row([{ left: -500, right: 900 }]);
    place(r, null);
    expect(fitActionRow(r)).toBe(false);
  });

  it('skips an empty child, which occupies nothing', () => {
    const r = row([{ left: 200, right: 390 }, null]);
    // The empty slot reports 0 × 0 at the origin — outside the content box, and irrelevant.
    expect(fitActionRow(r)).toBe(false);
  });
});

/** A ResizeObserver that fires only when told to, and says what it watches. */
class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  readonly watched = new Set<Element>();
  constructor(private readonly callback: () => void) {
    FakeResizeObserver.last = this;
  }
  observe(el: Element): void {
    this.watched.add(el);
  }
  unobserve(el: Element): void {
    this.watched.delete(el);
  }
  disconnect(): void {
    this.watched.clear();
  }
  fire(): void {
    this.callback();
  }
}

describe('watchActionRow', () => {
  let frames: Map<number, () => void>;
  let nextFrame: number;

  beforeEach(() => {
    frames = new Map();
    nextFrame = 1;
    FakeResizeObserver.last = null;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void): number => {
      const id = nextFrame++;
      frames.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      frames.delete(id);
    });
  });

  const runFrames = (): void => {
    const pending = [...frames.values()];
    frames.clear();
    for (const f of pending) f();
  };

  it('is a no-op where there is no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const r = row([{ left: -30, right: 390 }]);
    const stop = watchActionRow(r);
    expect(r.hasAttribute(ACTION_ROW_STACKED)).toBe(false);
    stop();
  });

  it('fits at once, watches the row and every child, and refits on the next frame', () => {
    const kid: Box = { left: 200, right: 390 };
    const r = row([kid]);
    const stop = watchActionRow(r);
    const ro = FakeResizeObserver.last;
    expect(r.hasAttribute(ACTION_ROW_STACKED)).toBe(false);
    expect(ro?.watched.has(r)).toBe(true);
    expect(ro?.watched.has(r.children[0] as Element)).toBe(true);

    // The text grows: the child now spills. Nothing changes until the frame runs…
    place(r.children[0] as Element, { left: -40, right: 390 });
    ro?.fire();
    ro?.fire(); // …and two notifications in one frame are ONE refit.
    expect(frames.size).toBe(1);
    expect(r.hasAttribute(ACTION_ROW_STACKED)).toBe(false);
    runFrames();
    expect(r.hasAttribute(ACTION_ROW_STACKED)).toBe(true);
    stop();
  });

  it('refits when a child is added, and watches the new child', async () => {
    const r = row([{ left: 300, right: 390 }]);
    const stop = watchActionRow(r);
    const ro = FakeResizeObserver.last;
    const added = document.createElement('button');
    place(added, { left: -20, right: 290 });
    r.appendChild(added);
    await Promise.resolve(); // MutationObserver records are delivered as a microtask
    expect(ro?.watched.has(added)).toBe(true);
    runFrames();
    expect(r.hasAttribute(ACTION_ROW_STACKED)).toBe(true);
    stop();
  });

  it('stops observing and drops a pending refit on teardown', () => {
    const r = row([{ left: 300, right: 390 }]);
    const stop = watchActionRow(r);
    const ro = FakeResizeObserver.last;
    ro?.fire();
    expect(frames.size).toBe(1);
    stop();
    expect(frames.size).toBe(0);
    expect(ro?.watched.size).toBe(0);
    stop(); // a second teardown with nothing pending is harmless
  });
});

describe('useActionRowFit', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    FakeResizeObserver.last = null;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    host?.remove();
    host = null;
    root = null;
    vi.restoreAllMocks();
  });

  function Footer(): ReactElement {
    const fit = useActionRowFit<HTMLDivElement>();
    return createElement('div', { ref: fit, 'data-row': '' });
  }

  it('watches the row it is attached to, and lets go of it on unmount', async () => {
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(Footer));
    });
    const el = host.querySelector('[data-row]');
    const ro = FakeResizeObserver.last;
    expect(ro?.watched.has(el as Element)).toBe(true);
    expect(spy).toHaveBeenCalled(); // the first fit happened at attach, before any frame
    await act(async () => {
      root?.unmount();
    });
    expect(ro?.watched.size).toBe(0);
  });
});
