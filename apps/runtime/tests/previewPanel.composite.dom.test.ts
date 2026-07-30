// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixedLayerBank, FixedSlotState, Rehearsal } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { PreviewPanel } from '../src/renderer/features/monitors/PreviewPanel.js';
import { ShellLayoutProvider } from '../src/renderer/hooks/shellLayoutContext.js';

/**
 * R-022 — PVW COMPOSITES EVERY REHEARSING ROW.
 *
 * The bug: rehearse is per-row, nothing stops several rows being in it at once,
 * and this panel rendered exactly ONE of them. An operator checked PREVIEW, saw
 * a clean frame, and had no way to know a second graphic was also rehearsing and
 * would collide with it — a surface that read as complete while being partial.
 *
 * The frame COUNT is therefore asserted directly: it is the bug.
 */

const BANK: FixedLayerBank = { channel: 1, start: 70, count: 30 };
const PAGE = '<!doctype html><html><head></head><body></body></html>';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// jsdom has no ResizeObserver. The FIT scale is measured with one; it is a
// preview-only CSS transform and none of these assertions is about it, so a
// no-op stand-in is honest here — the geometry it drives is covered in the E2E,
// against a real box.
class NoopResizeObserver {
  observe(): void {
    /* measured for real in the browser */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
// The frames' `load` events fire asynchronously and update state outside our
// `act` blocks; this is what tells React those updates are expected.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function item(itemId: string): StackItemState {
  return { itemId, templateId: `tpl-${itemId}`, fields: {}, status: 'loaded', pending: false };
}

function slot(layer: number, alias?: string): FixedSlotState {
  return {
    channel: 1,
    layer,
    ...(alias !== undefined ? { alias } : {}),
    observed: { kind: 'producer', producer: 'html' },
    binding: null,
  };
}

interface Fixture {
  rehearsals: Rehearsal[];
  items?: StackItemState[];
  slots?: FixedSlotState[];
  /** Item ids whose page this browser does NOT hold. */
  missingPages?: string[];
}

function stubBridge(f: Fixture): void {
  const items = f.items ?? f.rehearsals.map((r) => item(r.itemId));
  const missing = new Set((f.missingPages ?? []).map((id) => `tpl-${id}`));
  const noop = () => () => undefined;
  const stub = {
    rehearse: { state: () => Promise.resolve(f.rehearsals), onStateChanged: noop },
    stack: { snapshot: () => Promise.resolve(items), onStateChanged: noop },
    fixedLayers: {
      config: () => Promise.resolve(BANK),
      onConfigChanged: noop,
      state: () => Promise.resolve(f.slots ?? f.rehearsals.map((r) => slot(r.layer))),
      onStateChanged: noop,
    },
    channelSettings: {
      get: () =>
        Promise.resolve({
          settings: [{ channel: 1, raster: { width: 1920, height: 1080 } }],
          observed: [],
        }),
      onChanged: noop,
    },
    templates: {
      html: (templateId: string) => Promise.resolve(missing.has(templateId) ? null : PAGE),
    },
    link: { status: () => 'live', onStatusChanged: noop },
  };
  (window as unknown as { cg: unknown }).cg = stub;
}

async function render(f: Fixture): Promise<HTMLDivElement> {
  stubBridge(f);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ShellLayoutProvider, null, createElement(PreviewPanel)));
  });
  // Let the snapshot pulls and the page fetches settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
}

function frames(el: HTMLElement): HTMLIFrameElement[] {
  return [...el.querySelectorAll<HTMLIFrameElement>('iframe[data-rehearsal-frame]')];
}

describe('PreviewPanel — one frame per rehearsing row', () => {
  it('THE BUG: the frame count equals the rehearsing-row count', async () => {
    const el = await render({
      rehearsals: [
        { itemId: 'a', channel: 1, layer: 99 },
        { itemId: 'b', channel: 1, layer: 97 },
        { itemId: 'c', channel: 1, layer: 95 },
      ],
    });
    expect(frames(el)).toHaveLength(3);
  });

  /**
   * THE Z-ORDER, asserted on the RESOLVED ORDER rather than on a snapshot. The
   * higher CasparCG layer draws on top, and the two numbers that look like they
   * say the same thing — the row's display index and the alias number — both run
   * the OPPOSITE way. Keying off either inverts the composite plausibly.
   */
  it('the frame for the HIGHER CasparCG layer is above the other', async () => {
    const el = await render({
      rehearsals: [
        // Deliberately delivered highest-first, which is the order the Layers
        // panel displays: straight through, this would invert the stack.
        { itemId: 'top', channel: 1, layer: 99 },
        { itemId: 'bottom', channel: 1, layer: 71 },
      ],
    });
    const byItem = new Map(frames(el).map((f) => [f.dataset['rehearsalFrame'], f]));
    const top = byItem.get('top');
    const bottom = byItem.get('bottom');
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    expect(Number(top?.style.zIndex)).toBeGreaterThan(Number(bottom?.style.zIndex));
  });

  it('every frame sits ABOVE the single transparency checker', async () => {
    const el = await render({
      rehearsals: [
        { itemId: 'a', channel: 1, layer: 99 },
        { itemId: 'b', channel: 1, layer: 71 },
      ],
    });
    // ONE checker, behind the whole stack — not one per frame. A checker between
    // two frames would read as an opaque layer and hide the alpha it exists to
    // reveal, and it would lie about how the channel composites.
    const checkers = el.querySelectorAll('[data-rehearsal-checker]');
    expect(checkers).toHaveLength(1);
    const checkerZ = Number((checkers[0] as HTMLElement).style.zIndex);
    for (const f of frames(el)) expect(Number(f.style.zIndex)).toBeGreaterThan(checkerZ);
  });

  it('names each frame by the ROW’s name, never the raw layer dressed as an alias', async () => {
    const el = await render({
      rehearsals: [
        { itemId: 'a', channel: 1, layer: 99 },
        { itemId: 'b', channel: 1, layer: 97 },
      ],
      slots: [slot(99), slot(97, 'CLOCK')],
    });
    // The frame's ACCESSIBLE NAME, which is `aria-label` and not `title`: a
    // `title` on an iframe doubles as a native tooltip, and the frames cover
    // most of the panel, so it popped up over the graphic being judged.
    const names = frames(el).map((f) => f.getAttribute('aria-label') ?? '');
    // Layer 99 is the bank's HIGHEST, so its default alias is `Layer 1`.
    expect(names).toContain('Layer 1 rehearsal preview');
    expect(names).toContain('CLOCK rehearsal preview');
    expect(names.join(' ')).not.toContain('Layer 99');
    // Named, but with NOTHING on hover — asserted so a later "just add a title
    // for the tooltip" puts the popup back knowingly rather than by accident.
    for (const f of frames(el)) expect(f.getAttribute('title')).toBeNull();
  });

  it('says how many rows it is compositing', async () => {
    const el = await render({
      rehearsals: [
        { itemId: 'a', channel: 1, layer: 99 },
        { itemId: 'b', channel: 1, layer: 97 },
      ],
    });
    expect(el.querySelector('[data-rehearsal-caption]')?.textContent).toContain(
      'Rehearsing 2 rows',
    );
  });

  /**
   * THE HONESTY CONSTRAINT. If PVW ever shows fewer frames than there are
   * rehearsing rows, it must say so ON THE SURFACE — not inside a collapsed
   * disclosure. A quiet drop is the bug this whole change fixes.
   */
  it('states a shortfall as "showing N of M" when a page is missing in this browser', async () => {
    const el = await render({
      rehearsals: [
        { itemId: 'a', channel: 1, layer: 99 },
        { itemId: 'b', channel: 1, layer: 97 },
        { itemId: 'c', channel: 1, layer: 95 },
      ],
      missingPages: ['b'],
    });
    expect(frames(el)).toHaveLength(2);
    const caption = el.querySelector('[data-rehearsal-caption]')?.textContent ?? '';
    expect(caption).toContain('showing 2 of 3');
  });

  it('shows the empty state only when NOTHING is rehearsing', async () => {
    const el = await render({ rehearsals: [] });
    expect(frames(el)).toHaveLength(0);
    expect(el.textContent).toContain('Nothing to preview');
  });

  /**
   * PVW SHOWS WHAT IS BEING REHEARSED — NOT AIR. Compositing on-air rows would
   * be more faithful to the channel and is the wrong move: PGM is the surface
   * for air, and a second local representation of air is exactly what R-022's
   * design avoided by reusing the bridge's own retained page.
   */
  it('does not composite an ON-AIR row that is not rehearsing', async () => {
    const el = await render({
      rehearsals: [{ itemId: 'a', channel: 1, layer: 99 }],
      items: [item('a'), { ...item('onair'), status: 'on-air' }],
      slots: [slot(99), slot(97)],
    });
    expect(frames(el)).toHaveLength(1);
    expect(frames(el)[0]?.dataset['rehearsalFrame']).toBe('a');
  });
});
