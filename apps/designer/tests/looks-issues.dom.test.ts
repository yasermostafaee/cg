/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene } from '@cg/shared-schema';
import { designerStore } from '../src/renderer/state/store.js';
import { LooksSection } from '../src/renderer/features/inspector/LooksSection.js';

/**
 * LOOKS phase 2 step 6 — **the refusal family, surfaced where the author works.**
 *
 * One test per family member: a within-look duplicate, the cross-boundary overlap, the v1
 * second group and — `B-188` — the near-miss NUDGE, each in the preflight's own wording. A
 * clean template is the positive control: no issue block at all.
 *
 * 🔴 `B-188` deleted `look-source-undeclared`; the test that covered it now asserts its
 * ABSENCE, and the near-miss warning is asserted to be a warning rather than a refusal.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  designerStore._reset();
});

function render(scene: Scene): string {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(LooksSection, { scene }));
  });
  return container.textContent ?? '';
}

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };
const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});
const plate = (id: string, routeKey: string, x = 0, y = 0, w = 640, h = 360): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: tf(x, y, w, h),
    routeKey,
  }) as unknown as Element;
const instance = (id: string, compId: string): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'composition',
    compositionId: compId,
    transform: tf(0, 0, 1920, 1080),
  }) as unknown as Element;
const lookComp = (id: string, children: Element[]) => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
  ],
  fields: [],
  bindings: [],
});
const cut = { mode: 'cut' } as const;
const look = (id: string, instanceId: string) => ({ id, name: id, instanceId, entered: cut });

function scene(options: {
  rootChildren?: Element[];
  compositions?: unknown[];
  lookGroups: unknown[];
}): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: options.rootChildren ?? [],
      },
    ],
    compositions: options.compositions ?? [],
    fonts: [],
    fields: [],
    bindings: [],
    lookGroups: options.lookGroups,
  } as unknown as Scene;
}

/**
 * ⚠ `B-188` — the RETIRED `sources` array is written here ON PURPOSE. It is how a scene
 * stored before the change looks on disk, and its presence is what makes the deletion tests
 * below discriminate rather than assert a vacuous absence.
 */
const GROUP = (over: Record<string, unknown> = {}): unknown => ({
  id: 'g1',
  sources: [
    { routeKey: 'live-1', dynamic: false },
    { routeKey: 'live-2', dynamic: false },
  ],
  looks: [look('look-a', 'inst-a')],
  defaultLookId: 'look-a',
  ...over,
});

describe('the LOOKS refusal family appears in the section, in the wording of the preflight', () => {
  it('POSITIVE CONTROL — a clean template shows NO issue block', () => {
    const text = render(
      scene({
        rootChildren: [instance('inst-a', 'comp-a')],
        compositions: [lookComp('comp-a', [plate('a-1', 'live-1')])],
        lookGroups: [GROUP()],
      }),
    );
    expect(text).not.toContain('export will refuse');
  });

  it('🔴 `B-188` — a source the stale declaration omits surfaces NOTHING at all', () => {
    const text = render(
      scene({
        rootChildren: [instance('inst-a', 'comp-a')],
        compositions: [lookComp('comp-a', [plate('a-1', 'nope-9')])],
        lookGroups: [GROUP()],
      }),
    );
    expect(text).not.toContain('export will refuse');
    expect(text).not.toContain('does not declare');
  });

  /**
   * 🔴 **`B-188` condition (c) — THE NEAR MISS IS A NUDGE, AND THE HEADING SAYS SO.**
   *
   * The two halves are asserted together deliberately: a warning listed under an "export will
   * refuse" heading would be a warning that reads as an error to everyone looking at the
   * screen, which is how it later gets "fixed" into one.
   */
  it('🔴 a NEAR-MISS id is surfaced as a nudge — named, and explicitly NOT blocking', () => {
    const text = render(
      scene({
        rootChildren: [instance('inst-a', 'comp-a')],
        compositions: [
          lookComp('comp-a', [plate('a-1', 'live-1', 0, 0), plate('a-2', 'live1', 960, 0)]),
        ],
        lookGroups: [GROUP()],
      }),
    );
    expect(text).toContain('export is not blocked');
    expect(text).toContain('"live1"');
    expect(text).toContain('"live-1"');
    expect(text).not.toContain('export will refuse');
  });

  it('⚠ a numbered FAMILY is silent — live-1 and live-2 are not a near miss', () => {
    const text = render(
      scene({
        rootChildren: [instance('inst-a', 'comp-a')],
        compositions: [
          lookComp('comp-a', [plate('a-1', 'live-1', 0, 0), plate('a-2', 'live-2', 960, 0)]),
        ],
        lookGroups: [GROUP()],
      }),
    );
    expect(text).not.toContain('export is not blocked');
    expect(text).not.toContain('export will refuse');
  });

  it('🔴 the same source TWICE in one look is surfaced, teaching the across-looks case', () => {
    const text = render(
      scene({
        rootChildren: [instance('inst-a', 'comp-a')],
        compositions: [
          lookComp('comp-a', [plate('a-1', 'live-1', 0, 0), plate('a-2', 'live-1', 960, 0)]),
        ],
        lookGroups: [GROUP()],
      }),
    );
    expect(text).toContain('export will refuse');
    expect(text).toContain('DIFFERENT looks is fine');
  });

  it('🔴 a root plate overlapping a plate of the active look is surfaced, naming the look', () => {
    const text = render(
      scene({
        rootChildren: [instance('inst-a', 'comp-a'), plate('root-1', 'live-2', 100, 100, 640, 360)],
        compositions: [lookComp('comp-a', [plate('a-1', 'live-1', 200, 200, 640, 360)])],
        lookGroups: [GROUP()],
      }),
    );
    expect(text).toContain('export will refuse');
    expect(text).toContain('when look "look-a" is active');
  });

  it('🔴 a SECOND multi-frame group is surfaced with the v1 bound', () => {
    const text = render(
      scene({
        rootChildren: [instance('inst-a', 'comp-a'), instance('inst-b', 'comp-b')],
        compositions: [
          lookComp('comp-a', [plate('a-1', 'live-1')]),
          lookComp('comp-b', [plate('b-1', 'live-2')]),
        ],
        lookGroups: [
          GROUP(),
          {
            id: 'g2',
            sources: [{ routeKey: 'live-2', dynamic: false }],
            looks: [look('look-b', 'inst-b')],
            defaultLookId: 'look-b',
          },
        ],
      }),
    );
    expect(text).toContain('export will refuse');
    expect(text).toContain('exactly ONE');
  });
});
