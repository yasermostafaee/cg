import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * `D-163` / `R-100` — PAGES OF PICTURES, turned with Next / Previous / Go to (a book read on air).
 *
 * The page is driven exactly as on air: `createRuntime(scene, { assetUrls })`, verbs through the
 * runtime, and bridge page turns through `update({ __cg: { page } })`. Decoding is the one seam a
 * test DOM cannot do for real, so each test says what `decodeImage` does.
 */

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
    setTimeout: (cb: () => void, delay: number) => setTimeout(cb, delay),
    clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    advance: (delta: number) => {
      ms += delta;
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

async function flush(clock: ReturnType<typeof makeClock>, ms = 0, step = 50): Promise<void> {
  let left = ms;
  do {
    clock.advance(Math.min(step, Math.max(left, 0)));
    left -= step;
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  } while (left > 0);
}

const T = (w: number, h: number) => ({
  position: { x: 0, y: 0 },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const SHA = (n: number): string => n.toString(16).padStart(64, '0');
/** A page's address on the template's own origin — what the bridge sends, never the bytes. */
const DATA = (n: number): string => `/page/${SHA(n)}.png`;

function book(
  items: Record<string, unknown>[],
  over: Record<string, unknown> = {},
  extras: { fields?: unknown[]; bindings?: unknown[] } = {},
): Scene {
  const seq = {
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    id: 'book',
    name: 'Book',
    type: 'sequence',
    transform: T(1920, 1080),
    font: {
      family: 'Vazirmatn',
      weight: 400,
      style: 'normal',
      size: 24,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'start',
    verticalAlign: 'middle',
    direction: 'rtl',
    items,
    defaultDwellMs: 5000,
    advance: 'manual',
    transitionIn: 'none',
    transitionOut: 'none',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 1,
    ...over,
  } as unknown as Element;
  return {
    schemaVersion: 1,
    id: 'scene-book',
    name: 'book',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    playout: { mode: 'manual' },
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [seq],
      },
    ],
    fields: extras.fields ?? [],
    bindings: extras.bindings ?? [],
    fonts: [],
    metadata: { createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' },
  } as unknown as Scene;
}

const authored = (n: number) => ({ kind: 'image', id: `p${String(n)}`, assetId: `a${String(n)}` });
const urls = (count: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`a${String(i + 1)}`, `assets/p${String(i + 1)}.png`]),
  );

/** The pages on stage, as the `src` of each picture item's `<img>`, in DOM order. */
function onStage(): (string | null)[] {
  return [...document.querySelectorAll('[data-cg-sequence-page] img')].map((img) =>
    img.getAttribute('src'),
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('D-163 — a picture item is drawn by the image element’s renderer', () => {
  it('an authored page carries its exported URL and the sequence’s ONE fit', async () => {
    const clock = makeClock();
    const rt = createRuntime(book([authored(1), authored(2)], { imageFit: 'cover' }), {
      skipFontLoad: true,
      clock,
      assetUrls: urls(2),
      decodeImage: () => Promise.resolve(true),
    });
    await rt.play({});
    await flush(clock);
    expect(onStage()).toEqual(['assets/p1.png']);
    const img = document.querySelector<HTMLImageElement>('[data-cg-sequence-page] img')!;
    expect(img.style.objectFit).toBe('cover');
    // It names no element of the scene: the synthetic id stays out of the DOM.
    expect(img.dataset['cgElementId']).toBeUndefined();
  });
});

describe('D-163 — Next, Previous and Go to', () => {
  async function onAir(over: Record<string, unknown> = {}, count = 3) {
    const clock = makeClock();
    const rt = createRuntime(
      book(
        Array.from({ length: count }, (_, i) => authored(i + 1)),
        over,
      ),
      {
        skipFontLoad: true,
        clock,
        assetUrls: urls(count),
        decodeImage: () => Promise.resolve(true),
      },
    );
    await rt.play({});
    await flush(clock);
    return { rt, clock };
  }

  it('🔴 a book (repeat 1) does not wrap: Next on the last page and Previous on the first stay', async () => {
    const { rt, clock } = await onAir();
    await rt.previous!();
    await flush(clock, 100);
    expect(onStage()).toEqual(['assets/p1.png']);
    await rt.goTo!(2);
    await flush(clock, 100);
    expect(onStage()).toEqual(['assets/p3.png']);
    await rt.next!();
    await flush(clock, 100);
    expect(onStage()).toEqual(['assets/p3.png']);
    // …and a book read to its end can still be paged back.
    await rt.previous!();
    await flush(clock, 100);
    expect(onStage()).toEqual(['assets/p2.png']);
  });

  it('an infinite sequence wraps both ways: Previous on the first item goes to the last', async () => {
    const { rt, clock } = await onAir({ repeat: 'infinite' });
    await rt.previous!();
    await flush(clock, 100);
    expect(onStage()).toEqual(['assets/p3.png']);
    await rt.next!();
    await flush(clock, 100);
    expect(onStage()).toEqual(['assets/p1.png']);
  });

  it('🔴 a goTo during a transition is applied when it ends, never dropped', async () => {
    const { rt, clock } = await onAir(
      { transitionIn: 'right', transitionOut: 'left', transitionMs: 400 },
      5,
    );
    await rt.next!(); // p1 → p2, a 400 ms push
    await flush(clock, 100);
    await rt.goTo!(4); // mid-push
    await flush(clock, 1500);
    expect(onStage()).toEqual(['assets/p5.png']);
  });

  it('a goTo before the run starts sets the page the run opens on', async () => {
    const clock = makeClock();
    const rt = createRuntime(book([authored(1), authored(2), authored(3)]), {
      skipFontLoad: true,
      clock,
      assetUrls: urls(3),
      decodeImage: () => Promise.resolve(true),
    });
    await rt.goTo!(1);
    await rt.play({});
    await flush(clock);
    expect(onStage()).toEqual(['assets/p2.png']);
  });
});

describe('D-163 — a page turn never shows a blank frame', () => {
  it('🔴 the old page stays alone on stage until the new one is decoded', async () => {
    const clock = makeClock();
    let release: (ok: boolean) => void = () => undefined;
    const decodes: ((ok: boolean) => void)[] = [];
    const rt = createRuntime(book([authored(1), authored(2)]), {
      skipFontLoad: true,
      clock,
      assetUrls: urls(2),
      decodeImage: () =>
        new Promise<boolean>((res) => {
          decodes.push(res);
        }),
    });
    await rt.play({});
    await flush(clock);
    expect(onStage()).toEqual(['assets/p1.png']);
    await rt.next!();
    await flush(clock, 200);
    // Decoding: page 2 is NOT on stage, and page 1 is — fully, untouched.
    expect(onStage()).toEqual(['assets/p1.png']);
    release = decodes[decodes.length - 1]!;
    release(true);
    await flush(clock, 100);
    expect(onStage()).toEqual(['assets/p2.png']);
  });

  it('🔴 a page that cannot be decoded leaves the previous page on screen', async () => {
    const clock = makeClock();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rt = createRuntime(book([authored(1), authored(2)]), {
      skipFontLoad: true,
      clock,
      assetUrls: urls(2),
      decodeImage: (img) => Promise.resolve(!img.src.includes('p2')),
    });
    await rt.play({});
    await flush(clock);
    await rt.next!();
    await flush(clock, 200);
    expect(onStage()).toEqual(['assets/p1.png']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('R-100 — a bridge page turn (`__cg.page`) on an operator book', () => {
  const pagesField = {
    id: 'pages',
    label: 'Pages',
    required: false,
    type: 'list',
    default: [],
    pages: true,
  };
  const binding = { fieldId: 'pages', target: { kind: 'sequence-items', elementId: 'book' } };
  const operatorBook = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${String(i + 1)}-${SHA(i + 1).slice(0, 12)}`,
      kind: 'image',
      media: SHA(i + 1),
      name: `page${String(i + 1)}.png`,
    }));

  async function taken(count: number, page = 0) {
    const clock = makeClock();
    const rt = createRuntime(book([], {}, { fields: [pagesField], bindings: [binding] }), {
      skipFontLoad: true,
      clock,
      decodeImage: () => Promise.resolve(true),
    });
    // The take: the book and its current page ride the ADD payload, as the bridge sends them.
    await rt.play({
      pages: operatorBook(count),
      __cg: { page: { field: 'pages', index: page, media: { [SHA(page + 1)]: DATA(page + 1) } } },
    });
    await flush(clock);
    return { rt, clock };
  }

  it('🔴 the take opens on the page it names, from the bytes it carried', async () => {
    await taken(300, 11);
    expect(onStage()).toEqual([DATA(12)]);
  });

  it('a turn carries exactly its page and shows it', async () => {
    const { rt, clock } = await taken(300, 11);
    await rt.update({
      __cg: { page: { field: 'pages', index: 12, media: { [SHA(13)]: DATA(13) } } },
    });
    await flush(clock, 100);
    expect(onStage()).toEqual([DATA(13)]);
  });

  it('🔴 a turn to a page whose bytes never arrived keeps the current page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rt, clock } = await taken(300, 11);
    await rt.update({ __cg: { page: { field: 'pages', index: 40 } } });
    await flush(clock, 100);
    expect(onStage()).toEqual([DATA(12)]);
    warn.mockRestore();
  });

  it('only the page on screen is a node — a 300-page book is never built at once', async () => {
    const { rt, clock } = await taken(300, 0);
    for (let i = 1; i <= 20; i += 1) {
      await rt.update({
        __cg: { page: { field: 'pages', index: i, media: { [SHA(i + 1)]: DATA(i + 1) } } },
      });
      await flush(clock, 50);
    }
    expect(document.querySelectorAll('[data-cg-sequence-page]')).toHaveLength(1);
    expect(onStage()).toEqual([DATA(21)]);
    // The page holds the bytes of the last three turns only: going back to page 1 (bytes long
    // evicted, and none carried) cannot be shown and keeps page 21.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await rt.update({ __cg: { page: { field: 'pages', index: 0 } } });
    await flush(clock, 100);
    expect(onStage()).toEqual([DATA(21)]);
    warn.mockRestore();
  });

  it('a turn naming a field this template does not bind turns nothing', async () => {
    const { rt, clock } = await taken(10, 3);
    await rt.update({ __cg: { page: { field: 'other', index: 7, media: { [SHA(8)]: DATA(8) } } } });
    await flush(clock, 100);
    expect(onStage()).toEqual([DATA(4)]);
  });
});
