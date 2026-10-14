/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetMeta, Element, TickerElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { defaultTicker } from '../src/renderer/state/element-defaults.js';
import { designerStore } from '../src/renderer/state/store.js';
import { TickerSeparatorControl } from '../src/renderer/features/inspector/TickerSeparatorControl.js';
import { useSeparatorRepairOnOpen } from '../src/renderer/hooks/useSeparatorRepairOnOpen.js';

/**
 * 🔴 `B-128` — mounted: the picker offers PICTURES only, and a project that already carries a
 * font or video separator is repaired when it opens — dropped, the author told once, not undoable.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noUnsub = (): void => {
  /* no unsubscribe needed in tests */
};
const asset = (assetId: string, kind: AssetMeta['kind'], filename: string): AssetMeta =>
  ({ assetId, kind, filename, sha256: assetId, bytes: 1, mime: 'x' }) as unknown as AssetMeta;
const PROJECT: AssetMeta[] = [
  asset('img-1', 'image', 'logo.png'),
  asset('font-1', 'font', 'Vazir.woff2'),
  asset('clip-1', 'video', 'intro.webm'),
  asset('anim-1', 'lottie', 'spark.json'),
];
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () => Promise.resolve(PROJECT),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([{ assetId: 'logo-shared', filename: 'brand.png' }]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

function mount(node: ReturnType<typeof createElement>): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

/** Let the bridge promises settle and React flush. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Open a real new project holding one ticker on `separator`. */
function openWithTicker(separator: TickerElement['separator']): TickerElement {
  const { scene } = new ProjectStore(new MemoryWorkspace(), new MemoryKv()).newScene(
    'demo',
    'lower-third',
  );
  const t = { ...defaultTicker('tk', 0, 0), name: 'Headlines', separator } as TickerElement;
  const [comp, ...rest] = scene.compositions ?? [];
  if (comp === undefined) throw new Error('a new project has a composition');
  const layer = { id: 'L-b128', name: 'b128', visible: true, locked: false, blendMode: 'normal' };
  designerStore.setScene(
    {
      ...scene,
      compositions: [
        {
          ...comp,
          layers: [
            ...comp.layers,
            { ...layer, children: [t as Element] } as (typeof comp.layers)[number],
          ],
        },
        ...rest,
      ],
    },
    null,
  );
  return t;
}

function tickerNow(): TickerElement | undefined {
  for (const c of designerStore.get().scene?.compositions ?? []) {
    for (const l of c.layers) {
      const hit = l.children.find((e) => e.id === 'tk');
      if (hit !== undefined) return hit as TickerElement;
    }
  }
  return undefined;
}

describe('B-128 — the separator picker', () => {
  it('🔴 offers the project’s PICTURES and the shared library — no font, video or animation', async () => {
    const t = openWithTicker({
      kind: 'image',
      assetId: 'img-1',
      source: 'project',
      size: { w: 48, h: 48 },
    });
    const host = mount(createElement(TickerSeparatorControl, { element: t, digits: 'latin' }));
    await settle();
    const select = host.querySelector('select[aria-label="image"]');
    const values = [...(select?.querySelectorAll('option') ?? [])].map((o) => o.value);
    expect(values).toEqual(['', 'project:img-1', 'shared:logo-shared']);
  });
});

describe('B-128 — repaired on open', () => {
  function Probe({ sceneId }: { sceneId: string | null }): null {
    useSeparatorRepairOnOpen(sceneId);
    return null;
  }

  it('🔴 a FONT separator is dropped, the author is told once, and Undo cannot bring it back', async () => {
    openWithTicker({ kind: 'image', assetId: 'font-1', source: 'project', size: { w: 48, h: 48 } });
    const id = designerStore.get().scene?.id ?? null;
    mount(createElement(Probe, { sceneId: id }));
    await settle();
    expect(tickerNow()).toBeDefined();
    expect(tickerNow()?.separator).toBeUndefined();
    expect(designerStore.get().notice).toBe(
      'Removed the separator from ticker "Headlines": it pointed at a font, and a separator can ' +
        'only be an image. Choose an image for it.',
    );
    // The repair is real: the project reads unsaved until the author saves it…
    expect(designerStore.get().dirty).toBe(true);
    // …and it is not an undo step that could put the broken record back.
    expect(designerStore.get().canUndo).toBe(false);
  });

  it('a PICTURE separator is kept, and nothing is said', async () => {
    openWithTicker({ kind: 'image', assetId: 'img-1', source: 'project', size: { w: 48, h: 48 } });
    const id = designerStore.get().scene?.id ?? null;
    mount(createElement(Probe, { sceneId: id }));
    await settle();
    expect(tickerNow()?.separator).toEqual({
      kind: 'image',
      assetId: 'img-1',
      source: 'project',
      size: { w: 48, h: 48 },
    });
    expect(designerStore.get().notice).toBeNull();
    expect(designerStore.get().dirty).toBe(false);
  });
});
