/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene } from '@cg/shared-schema';

/**
 * D-133 §3 — THE LOOP RANGE ON THE TIMELINE. ⚠ LOAD-BEARING for the item's acceptance.
 *
 * §9.2's consequence, spelled out because it is easy to read this section as decoration:
 * the loop range is OFFERED only where an out-point exists, so what discharges D-133's
 * "the conditional affordance is at most a shortcut, **never the only path**" is this —
 * the range being drawn BY DEFAULT for every composition that holds, with nothing added by
 * hand. Take this away and the item is not satisfied, however good the Inspector is.
 *
 * Two properties, asserted separately because they fail separately:
 *
 *  - **present by default** — drawn from the EFFECTIVE content start, so an UNPINNED
 *    composition shows its range too (dashed: derived, not authored);
 *  - **full timeline height** — the indicator lines span the whole body, not the scene
 *    lane the draggable grips live in. That is the difference between lining an element's
 *    keyframes up against the loop boundary and eyeballing it across rows, and it is
 *    asserted on the geometry (`top`/`bottom` on a body-level box), never on a class name.
 */

const { designerStore, editSceneOf } = await import('../src/renderer/state/store.js');
const { TimelineDock } = await import('../src/renderer/features/timeline/TimelineDock.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = {
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
} as const;

function shape(id: string, settle?: number): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'solid', color: '#FF0000' },
    ...(settle !== undefined
      ? {
          animation: {
            tracks: {
              opacity: {
                keyframes: [
                  { frame: 0, value: 0, easing: 'linear' },
                  { frame: settle, value: 1, easing: 'linear' },
                ],
              },
            },
          },
        }
      : {}),
  } as unknown as Element;
}

function scene(children: Element[], lifecycle?: object | null): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'main',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    ...(lifecycle !== null ? { lifecycle: lifecycle ?? { outPoint: 80 } } : {}),
    editorBackdrop: 'transparent',
    layers: [{ id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children }],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z' },
  } as unknown as Scene;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

function mount(s: Scene): void {
  designerStore.setScene(s, null);
  const st = designerStore.get();
  act(() => {
    root.render(
      createElement(TimelineDock, {
        scene: editSceneOf(st.scene, st.activeCompositionId)!,
        selection: new Set<string>(),
        selectedKeyframe: null,
        selectedKeyframes: [],
      }),
    );
  });
}

const el = (id: string): HTMLElement | null =>
  host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
/** The `left` percent an absolutely-positioned frame marker was placed at. */
const leftPct = (id: string): number => Number.parseFloat(el(id)?.style.left ?? 'NaN');

describe('the loop range is drawn on the timeline by default', () => {
  it('a composition that holds shows the range and BOTH indicator lines, hand-added by nobody', () => {
    // Entrance settling at frame 30 ⇒ the effective content start is 30, out-point 80.
    mount(scene([shape('bg', 30)]));
    expect(el('loop-range-band')).not.toBeNull();
    expect(el('loop-range-start')).not.toBeNull();
    expect(el('loop-range-end')).not.toBeNull();
  });

  it('the range spans [effective content start → out point] — 30 → 80 of a 0–100 timeline', () => {
    mount(scene([shape('bg', 30)]));
    expect(leftPct('loop-range-start')).toBeCloseTo(30, 1);
    expect(leftPct('loop-range-end')).toBeCloseTo(80, 1);
    expect(leftPct('loop-range-band')).toBeCloseTo(30, 1);
    expect(Number.parseFloat(el('loop-range-band')!.style.width)).toBeCloseTo(50, 1);
  });

  it('the indicator lines live where the FULL-HEIGHT playhead lives, not in the scene lane', () => {
    // jsdom applies no stylesheet, so `top: 0 / bottom: 0` (a vanilla-extract class, not an
    // inline style) is not readable here and the PIXEL claim belongs to the E2E, which
    // measures the rendered boxes against the timeline body. What IS checkable here is the
    // structural precondition, and it is the half that actually regresses: the lines are
    // siblings of the shipped full-height body playhead, in the body-level overlay
    // container — NOT children of the fixed-height scene row, which cannot be full-height
    // however it is styled.
    mount(scene([shape('bg', 30)]));
    const playhead = el('body-playhead')!;
    for (const id of ['loop-range-start', 'loop-range-end', 'loop-range-band']) {
      const node = el(id)!;
      expect(node.parentElement).toBe(playhead.parentElement);
      expect(node.closest('[data-testid="scene-row-lane"]')).toBeNull();
      expect(node.closest('[data-testid="timeline-lane-body"]')).not.toBeNull();
    }
  });

  it('a PINNED content start moves the range and draws it solid; an unpinned one is dashed', () => {
    // Unpinned: derived from the entrance, so the line says so rather than presenting a
    // derivation as an authored decision.
    mount(scene([shape('bg', 30)]));
    expect(el('loop-range-start')!.style.borderLeft).toMatch(/dashed/);

    mount(scene([shape('bg', 30)], { outPoint: 80, contentStart: 55 }));
    expect(leftPct('loop-range-start')).toBeCloseTo(55, 1);
    expect(el('loop-range-start')!.style.borderLeft).toMatch(/solid/);
  });

  it('the draggable scene-lane markers are UNCHANGED — the lines are an addition, not a move', () => {
    mount(scene([shape('bg', 30)], { outPoint: 80, contentStart: 55 }));
    const lane = host.querySelector('[data-testid="scene-row-lane"]')!;
    expect(lane.querySelector('[aria-label="Out point marker"]')).not.toBeNull();
    expect(lane.querySelector('[aria-label="Content start marker"]')).not.toBeNull();
  });

  it('no out-point ⇒ no range: a static composition has no hold to loop', () => {
    mount(scene([shape('bg', 30)], null));
    expect(el('loop-range-band')).toBeNull();
    expect(el('loop-range-start')).toBeNull();
    expect(el('loop-range-end')).toBeNull();
  });

  it('a DEGENERATE range draws nothing — two coincident lines read as one stray marker', () => {
    // No keyframes ⇒ no entrance to settle ⇒ the effective content start IS the out-point.
    mount(scene([shape('bg')]));
    expect(el('loop-range-band')).toBeNull();
    expect(el('loop-range-start')).toBeNull();
  });
});
