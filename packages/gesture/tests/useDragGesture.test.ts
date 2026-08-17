// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useDragGesture, type DragGestureOptions } from '../src/useDragGesture.js';

/**
 * B-140 — THE TERMINATOR MATRIX, driven directly.
 *
 * The defect this hook exists to remove was never "the wrong delta". It was that
 * **"the drag ended" had more ways to happen than the code had listeners for**, so
 * the state that a drag sets was left behind by whichever ending nobody had
 * written down. A test that only drove `pointerup` would have passed against the
 * broken code.
 *
 * So every terminator gets its own case, and each asserts the SAME three
 * consequences: the shield is gone, `dragging` is false, and a later move does
 * nothing. Those three are what "one teardown" means, stated as observable facts
 * rather than as a claim about the implementation.
 */

/** jsdom ships no PointerEvent; the hook is entirely built on it. */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeAll(() => {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = FakePointerEvent;
  // jsdom implements neither; the hook guards both, and these let the guards be
  // exercised as they are in a real browser rather than always taking the catch.
  Element.prototype.setPointerCapture = function setPointerCapture(this: Element): void {
    (this as unknown as { __captured: boolean }).__captured = true;
  };
  Element.prototype.releasePointerCapture = function releasePointerCapture(this: Element): void {
    (this as unknown as { __captured: boolean }).__captured = false;
  };
  Element.prototype.hasPointerCapture = function hasPointerCapture(this: Element): boolean {
    return (this as unknown as { __captured?: boolean }).__captured === true;
  };
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
  vi.restoreAllMocks();
});

interface Harness {
  handle: HTMLElement;
  moves: number[];
  ends: number;
  isDragging: () => boolean;
}

const shields = (): NodeListOf<Element> => document.body.querySelectorAll('[data-cg-drag-shield]');

async function mount(over: Partial<DragGestureOptions> = {}): Promise<Harness> {
  const moves: number[] = [];
  let ends = 0;
  let dragging = false;

  function Probe(): ReactElement {
    const g = useDragGesture({
      axis: over.axis ?? 'x',
      cursor: over.cursor ?? 'col-resize',
      onMove: (d) => moves.push(d),
      onEnd: () => {
        ends += 1;
      },
    });
    dragging = g.dragging;
    return createElement('div', {
      'data-handle': '',
      ...g.handleProps,
    });
  }

  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const r = root;
  await act(async () => {
    r.render(createElement(Probe));
  });
  const handle = host.querySelector<HTMLElement>('[data-handle]');
  if (handle === null) throw new Error('probe did not render');
  return { handle, moves, ends, isDragging: () => dragging };
}

const down = async (h: Harness, x = 100, pointerId = 1): Promise<void> => {
  await act(async () => {
    h.handle.dispatchEvent(
      new FakePointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: x, pointerId }),
    );
  });
};

const move = async (x: number, pointerId = 1): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(
      new FakePointerEvent('pointermove', { clientX: x, clientY: x, pointerId }),
    );
  });
};

const fire = async (type: string, pointerId = 1): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(new FakePointerEvent(type, { pointerId }));
  });
};

describe('the gesture reports a delta along its axis', () => {
  it('moves are relative to pointerdown, on the x axis', async () => {
    const h = await mount({ axis: 'x' });
    await down(h, 100);
    await move(140);
    await move(90);
    expect(h.moves).toEqual([40, -10]);
  });

  it('reads the y axis when asked to', async () => {
    const h = await mount({ axis: 'y' });
    await down(h, 50);
    await move(75);
    expect(h.moves).toEqual([25]);
  });
});

describe('the shield', () => {
  it('is mounted for the gesture and carries the caller-supplied cursor', async () => {
    const h = await mount({ cursor: 'row-resize' });
    expect(shields()).toHaveLength(0);
    await down(h);
    expect(shields()).toHaveLength(1);
    expect((shields()[0] as HTMLElement).style.cursor).toBe('row-resize');
  });

  it('🔴 does NOT write cursor or user-select onto document.body — that state is what leaked', async () => {
    const h = await mount({ cursor: 'row-resize' });
    await down(h);
    // The whole point of the shield: the gesture owns a NODE, not shared state on
    // the document. A leak here can at worst strand a transparent div.
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
    await fire('pointerup');
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });
});

describe('🔴 the terminator matrix — every ending runs the ONE teardown', () => {
  const TERMINATORS: readonly (readonly [string, (h: Harness) => Promise<void>])[] = [
    ['pointerup', async () => fire('pointerup')],
    ['pointercancel', async () => fire('pointercancel')],
    ['lostpointercapture', async () => fire('lostpointercapture')],
    [
      'window blur',
      async () => {
        await act(async () => {
          window.dispatchEvent(new Event('blur'));
        });
      },
    ],
    [
      'Escape',
      async () => {
        await act(async () => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
      },
    ],
    [
      'the pointer leaving the window',
      async () => {
        await act(async () => {
          const e = new FakePointerEvent('pointerout', { bubbles: true });
          Object.defineProperty(e, 'relatedTarget', { value: null });
          document.dispatchEvent(e);
        });
      },
    ],
  ];

  for (const [name, terminate] of TERMINATORS) {
    it(`${name} ends it completely`, async () => {
      const h = await mount();
      await down(h, 100);
      await move(150);
      expect(h.isDragging()).toBe(true);
      expect(shields()).toHaveLength(1);

      await terminate(h);

      expect(h.isDragging(), 'dragging must be false').toBe(false);
      expect(shields(), 'the shield must be gone').toHaveLength(0);

      const after = h.moves.length;
      await move(400);
      expect(h.moves.length, 'a move after the end must do nothing').toBe(after);
    });
  }

  it('Escape keeps the size it has at that moment — it does not revert', async () => {
    const h = await mount();
    await down(h, 100);
    await move(160);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    // The last delta the caller was told about is the one it keeps. No further
    // call, and no compensating call back to zero.
    expect(h.moves).toEqual([60]);
  });

  it('unmounting mid-drag is itself a terminator, so the shield cannot outlive its listeners', async () => {
    const h = await mount();
    await down(h);
    expect(shields()).toHaveLength(1);
    const r = root;
    await act(async () => {
      r?.unmount();
    });
    root = null;
    expect(shields()).toHaveLength(0);
  });
});

describe('🔴 only the captured pointer drives the drag', () => {
  it('a second finger is ignored, never read as a move', async () => {
    const h = await mount();
    await down(h, 100, 1);
    await move(150, 1);
    expect(h.moves).toEqual([50]);

    // A second finger lands and travels. It must contribute nothing.
    await move(900, 2);
    expect(h.moves).toEqual([50]);
  });

  it("a second finger's release does not end the first finger's drag", async () => {
    const h = await mount();
    await down(h, 100, 1);
    await fire('pointerup', 2);
    expect(h.isDragging()).toBe(true);
    expect(shields()).toHaveLength(1);

    await fire('pointerup', 1);
    expect(h.isDragging()).toBe(false);
  });

  it('a second pointerdown during a drag does not start a second gesture', async () => {
    const h = await mount();
    await down(h, 100, 1);
    await down(h, 300, 2);
    expect(shields(), 'exactly one shield').toHaveLength(1);
    // Still anchored on the FIRST pointer's origin.
    await move(150, 1);
    expect(h.moves).toEqual([50]);
  });
});

describe('the handle opts out of browser gesture stealing', () => {
  it('carries touch-action: none', async () => {
    const h = await mount();
    expect(h.handle.style.touchAction).toBe('none');
  });
});

describe('capture is an OPTIMISATION; the shield is the mechanism', () => {
  it('a browser that refuses setPointerCapture still gets a working drag', async () => {
    // This is the design claim stated as a test: `setPointerCapture` does not
    // dependably cross a browsing-context boundary, so the hook must not DEPEND on
    // it. If this ever starts failing, the shield has stopped being the mechanism.
    vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(() => {
      throw new Error('refused');
    });
    const h = await mount();
    await down(h, 100);
    expect(shields(), 'the shield still mounts').toHaveLength(1);
    await move(130);
    expect(h.moves, 'moves still arrive').toEqual([30]);
    await fire('pointerup');
    expect(shields()).toHaveLength(0);
    expect(h.isDragging()).toBe(false);
  });

  it('a release the browser has already taken back does not abort the teardown', async () => {
    const h = await mount();
    await down(h);
    vi.spyOn(Element.prototype, 'releasePointerCapture').mockImplementation(() => {
      throw new Error('already released');
    });
    await fire('pointerup');
    // The throw must not strand the shield — the rest of the teardown is
    // deliberately unconditional.
    expect(shields(), 'the shield is still removed').toHaveLength(0);
    expect(h.isDragging()).toBe(false);
  });
});

describe('the shield release is idempotent', () => {
  it('a second teardown does not throw and leaves nothing behind', async () => {
    const h = await mount();
    await down(h);
    await fire('pointerup');
    // Two terminators can legitimately arrive for one gesture (an `up` followed by
    // a `blur`, say). The second must be a no-op, not a crash.
    await fire('pointercancel');
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(shields()).toHaveLength(0);
    expect(h.isDragging()).toBe(false);
  });
});
