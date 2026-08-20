// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  FixedLayerBank,
  FixedSlotState,
  Rehearsal,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { smpteBarsGradient } from '@cg/template-runtime/scene-builder';
import { PreviewPanel } from '../src/renderer/features/monitors/PreviewPanel.js';
import { ShellLayoutProvider } from '../src/renderer/hooks/shellLayoutContext.js';
import {
  initSources,
  __resetSourcesForTest,
} from '../src/renderer/features/sources/sourceStore.js';

/**
 * R-049 — PVW draws a labelled placeholder over every live plate, in TWO states
 * that must be separable WITHOUT reading the label.
 *
 * The bug this closes, in the owner's words from live testing: in CG Control's
 * PVW you cannot tell a live plate exists at all. A Live Source region paints
 * nothing in the rendered page (design.md §12.2, unchanged), so "the template is
 * fine and the live box simply is not a browser thing" and "the page failed to
 * load" looked identical — and nothing said WHICH SOURCE was behind WHICH plate,
 * which only this surface can answer.
 *
 * The two states are asserted on the STYLE, not only on the text, because the
 * requirement is that an operator tells them apart across the room. A test that
 * only read the words would pass against two identical-looking boxes.
 */

const BANK: FixedLayerBank = { channel: 1, start: 70, count: 30 };
const PAGE = '<!doctype html><html><head></head><body></body></html>';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// jsdom has no ResizeObserver; the FIT scale is measured with one. It stays at
// its initial 1 here, which is exactly what these assertions want — the geometry
// is pinned in `livePlateGeometry.test.ts` and, against a real box, in the E2E.
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
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  __resetSourcesForTest();
});

const TEMPLATE_ID = 'tpl-two-plates';

function templateWithPlates(): TemplateInfo {
  return {
    templateId: TEMPLATE_ID,
    templateType: 'custom',
    fields: [],
    liveSources: {
      resolution: { width: 1920, height: 1080 },
      defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
      sources: [
        {
          elementId: 'el-a',
          sourceId: 'guest-1',
          rect: { x: 100, y: 60, width: 640, height: 360 },
          dynamic: false,
        },
        {
          elementId: 'el-b',
          sourceId: 'guest-2',
          rect: { x: 900, y: 60, width: 640, height: 360 },
          dynamic: false,
        },
      ],
    },
  };
}

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 3 } },
    { id: 'src-bbb', name: 'Baku', producer: { kind: 'route', channel: 4 } },
  ],
};

const item = (itemId: string): StackItemState => ({
  itemId,
  templateId: TEMPLATE_ID,
  fields: {},
  status: 'loaded',
  pending: false,
});

const slot = (layer: number): FixedSlotState => ({
  channel: 1,
  layer,
  observed: { kind: 'producer', producer: 'html' },
  binding: null,
});

interface Fixture {
  rehearsals: Rehearsal[];
  templates?: TemplateInfo[];
  assignments?: SourceAssignments;
}

function stubBridge(f: Fixture): void {
  const noop = () => () => undefined;
  const stub = {
    rehearse: { state: () => Promise.resolve(f.rehearsals), onStateChanged: noop },
    stack: {
      snapshot: () => Promise.resolve(f.rehearsals.map((r) => item(r.itemId))),
      onStateChanged: noop,
    },
    fixedLayers: {
      config: () => Promise.resolve(BANK),
      onConfigChanged: noop,
      state: () => Promise.resolve(f.rehearsals.map((r) => slot(r.layer))),
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
      html: () => Promise.resolve(PAGE),
      list: () => Promise.resolve(f.templates ?? [templateWithPlates()]),
      onChanged: noop,
    },
    sources: {
      config: () => Promise.resolve(CATALOG),
      onConfigChanged: noop,
      assignments: () => Promise.resolve(f.assignments ?? { assignments: [] }),
      onAssignmentsChanged: noop,
    },
    link: {
      status: () => 'live',
      onStatusChanged: noop,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: unknown }).cg = stub;
}

async function render(f: Fixture): Promise<HTMLDivElement> {
  stubBridge(f);
  // The app shell owns this call in production; the panel only READS the store.
  initSources(window.cg as unknown as Parameters<typeof initSources>[0]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ShellLayoutProvider, null, createElement(PreviewPanel)));
  });
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
  return container;
}

const plate = (el: HTMLElement, id: string): HTMLElement => {
  const found = el.querySelector<HTMLElement>(`[data-live-plate="${id}"]`);
  if (found === null) throw new Error(`no placeholder for plate ${id}`);
  return found;
};

const REHEARSING: Rehearsal[] = [{ itemId: 'a', channel: 1, layer: 99 }];

describe('R-049 — a live plate is VISIBLE in PVW', () => {
  it('every declared plate gets a placeholder, even with nothing assigned', async () => {
    const el = await render({ rehearsals: REHEARSING });
    // The premise of the whole item: "there is a frame here" must be answerable
    // BEFORE anything is bound, because an unbound plate is the state an
    // operator most needs to catch.
    expect(el.querySelectorAll('[data-live-plate]')).toHaveLength(2);
  });

  it('the bars are the DESIGNER’s bars — the same call, never a second table', async () => {
    const el = await render({ rehearsals: REHEARSING });
    // Reuse asserted as an EQUALITY against the exported function, so a
    // hand-written copy of the seven-colour table fails here rather than
    // drifting silently and losing the paired-stop rule (B-066) on air.
    expect(plate(el, 'guest-1').style.backgroundImage).toContain(smpteBarsGradient());
  });

  it('it declares itself a PLACEHOLDER and cannot read as an incoming picture', async () => {
    const el = await render({ rehearsals: REHEARSING });
    const box = plate(el, 'guest-1');
    expect(box.textContent).toContain('PLACEHOLDER');
    // Hazard striping over the bars — nothing arriving on an SDI input looks
    // like this, which is the point.
    expect(box.style.backgroundImage).toContain('repeating-linear-gradient');
  });

  it('is drawn WITHOUT a Play, and a Play does not change it', async () => {
    const el = await render({ rehearsals: REHEARSING });

    // BEFORE any Play. Required, not incidental: an unassigned plate REFUSES the
    // take, and PVW is the operator's last chance to see that before air, so a
    // marker that waited for Play would be absent exactly when it is needed.
    // D-087's blank-until-play contract is untouched by this — that contract is a
    // property of the PAGE's own `body.cg-pending`, and the overlay is not page
    // content.
    expect(el.querySelectorAll('[data-live-plate]')).toHaveLength(2);
    const before = plate(el, 'guest-1').outerHTML;

    // …and pressing Play changes nothing about it: this component takes no
    // lifecycle input at all. The hole is still a hole while the graphic runs, so
    // a marker that faded at Play would restore the original defect at the moment
    // the frame most resembles air.
    //
    // What THIS level can show is the overlay's invariance under the transport.
    // What it cannot show is the page changing underneath (jsdom runs no scripts
    // in the frame), so the full before/during/after sequence — page blank, page
    // painting, page blank again, marker identical throughout — is pinned against
    // a real lifecycle in `tests/e2e/pvw-live-plate-placeholder.spec.ts`.
    const play = el.querySelector<HTMLButtonElement>('button[aria-label="PLAY"]');
    expect(play).not.toBeNull();
    act(() => {
      play?.click();
    });
    expect(el.querySelectorAll('[data-live-plate]')).toHaveLength(2);
    expect(plate(el, 'guest-1').outerHTML).toBe(before);
  });

  it('the overlay never takes a click from the transport beneath it', async () => {
    const el = await render({ rehearsals: REHEARSING });
    const layer = el.querySelector<HTMLElement>('[data-live-plate-overlay]');
    expect(layer?.style.pointerEvents).toBe('none');
  });
});

describe('R-049 — the two states, distinguishable without reading', () => {
  it('an ASSIGNED plate is full-saturation and names plate AND source', async () => {
    const el = await render({
      rehearsals: REHEARSING,
      assignments: {
        assignments: [{ templateId: TEMPLATE_ID, plateId: 'guest-1', sourceId: 'src-aaa' }],
      },
    });
    const box = plate(el, 'guest-1');
    expect(box.dataset['livePlateState']).toBe('assigned');
    expect(box.style.filter).toBe('none');
    expect(box.textContent).toContain('guest-1');
    // The join no exported page can make: the INSTALLATION's name for the source.
    expect(box.textContent).toContain('Studio A');
  });

  it('an UNASSIGNED plate is DESATURATED and says so in words', async () => {
    const el = await render({ rehearsals: REHEARSING });
    const box = plate(el, 'guest-2');
    expect(box.dataset['livePlateState']).toBe('unassigned');
    // The across-the-room signal. Asserted on the style because the requirement
    // is that the states differ BEFORE a word is read.
    expect(box.style.filter).toBe('grayscale(1)');
    expect(box.textContent).toContain('no source assigned');
  });

  it('the two states differ in the SAME frame, one bound and one not', async () => {
    const el = await render({
      rehearsals: REHEARSING,
      assignments: {
        assignments: [{ templateId: TEMPLATE_ID, plateId: 'guest-1', sourceId: 'src-bbb' }],
      },
    });
    const bound = plate(el, 'guest-1');
    const unbound = plate(el, 'guest-2');
    expect(bound.textContent).toContain('Baku');
    expect(unbound.textContent).toContain('no source assigned');
    expect(bound.style.filter).not.toBe(unbound.style.filter);
    // …and the frames differ too, not just the fill.
    expect(bound.style.border).not.toBe(unbound.style.border);
  });

  it('a binding whose catalog entry is gone reads as UNASSIGNED, not as a broken name', async () => {
    const el = await render({
      rehearsals: REHEARSING,
      assignments: {
        assignments: [{ templateId: TEMPLATE_ID, plateId: 'guest-1', sourceId: 'src-deleted' }],
      },
    });
    // `pruneAssignmentsForCatalog`'s own reading of a dangling reference, and the
    // safe direction regardless: that plate WILL refuse the take.
    expect(plate(el, 'guest-1').dataset['livePlateState']).toBe('unassigned');
  });
});

describe('R-049 — a template with no live plates draws nothing', () => {
  it('no carrier, no overlay', async () => {
    const el = await render({
      rehearsals: REHEARSING,
      templates: [{ templateId: TEMPLATE_ID, templateType: 'custom', fields: [] }],
    });
    expect(el.querySelector('[data-live-plate-overlay]')).toBeNull();
    // The rehearsal itself is unaffected — this is an overlay, not a render path.
    expect(el.querySelectorAll('iframe[data-rehearsal-frame]')).toHaveLength(1);
  });
});
