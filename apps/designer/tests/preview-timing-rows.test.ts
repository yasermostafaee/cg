/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Composition, Element, Scene } from '@cg/shared-schema';
import { PreviewScopeTiming } from '../src/renderer/features/fields/PreviewScopeTiming.js';
import type { TimingOverride } from '../src/renderer/features/fields/PreviewTimingControls.js';

/**
 * D-102 Phase 2 — driving the panel's REAL rows: a sequence's and a countdown's session-only
 * controls patch ONLY their own element's map (element-id keyed, deep-merged), never another
 * element's and never the scope's lifecycle. The runtime side (each map reaching that element's own
 * driver) is covered by @cg/template-runtime's per-element-timing tests; the E2E covers the whole
 * loop through the preview iframe.
 */

// React's act() needs this flag set for createRoot rendering under Vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 200, h: 60 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const baseElProps = {
  transform: baseTransform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};
const font = {
  family: 'Vazirmatn',
  weight: 500,
  style: 'normal',
  size: 24,
  lineHeight: 1.2,
  letterSpacing: 0,
};

function sequence(id: string, name: string): Element {
  return {
    ...baseElProps,
    id,
    name,
    type: 'sequence',
    font,
    color: '#FFFFFF',
    direction: 'rtl',
    items: [],
    repeat: 'infinite',
    defaultDwellMs: 5000,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
  } as unknown as Element;
}

function countdown(id: string, name: string): Element {
  return {
    ...baseElProps,
    id,
    name,
    type: 'clock',
    font,
    color: '#FFFFFF',
    align: 'center',
    mode: 'countdown',
    format: 'mm:ss',
    digits: 'latin',
    target: { kind: 'duration', ms: 60_000 },
  } as unknown as Element;
}

/** Root scope with two sequences + one countdown — enough to prove per-element isolation. */
function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 'sc',
    name: 'Panel',
    templateType: 'custom',
    resolution: { width: 400, height: 200 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 40 },
    background: 'transparent',
    layers: [
      {
        id: 'pl',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          sequence('sq-a', 'Now/Next'),
          sequence('sq-b', 'Lineup'),
          countdown('cd', 'Break'),
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [] as Composition[],
    metadata: { createdAt: '2026-07-14T00:00:00.000Z', updatedAt: '2026-07-14T00:00:00.000Z' },
  } as unknown as Scene;
}

/** The overrides the panel has accumulated (the modal's per-scope shallow merge, as in PreviewModal). */
let overrides: Record<string, TimingOverride> = {};

/** Render the panel against a live override state, exactly as the preview modal holds it. */
function render(): void {
  overrides = {};
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const Harness = (): JSX.Element => {
    const [state, setState] = useState<Record<string, TimingOverride>>({});
    overrides = state;
    return createElement(PreviewScopeTiming, {
      scene: scene(),
      overrides: state,
      onChange: (path: string, patch: TimingOverride) =>
        setState((prev) => ({ ...prev, [path]: { ...prev[path], ...patch } })),
    });
  };
  act(() => root!.render(createElement(Harness)));
}

function input(label: string): HTMLInputElement {
  const el = container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (el === null || el === undefined) throw new Error(`no input labelled "${label}"`);
  return el;
}

/** Type a value into a controlled number input (React needs the native setter + an input event). */
function typeNumber(el: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('D-102 Phase 2 — the preview timing panel’s sequence / countdown rows', () => {
  it('renders one row per sequence and per countdown (labelled by element name)', () => {
    render();
    expect(input('Preview Now/Next sequence item dwell in milliseconds')).toBeTruthy();
    expect(input('Preview Lineup sequence item dwell in milliseconds')).toBeTruthy();
    expect(input('Preview Break countdown duration in milliseconds')).toBeTruthy();
    // The authored values are the resting display.
    expect(input('Preview Now/Next sequence item dwell in milliseconds').value).toBe('5000');
    expect(input('Preview Break countdown duration in milliseconds').value).toBe('60000');
  });

  it('a sequence dwell edit patches ONLY that sequence’s map (not the other, not the lifecycle)', () => {
    render();
    typeNumber(input('Preview Now/Next sequence item dwell in milliseconds'), '800');
    expect(overrides['']?.sequences).toEqual({ 'sq-a': { dwellMs: 800 } });
    // The other sequence is untouched, and no lifecycle axis was written.
    expect(overrides['']?.sequences?.['sq-b']).toBeUndefined();
    expect(overrides['']?.mode).toBeUndefined();
    expect(overrides['']?.holdMs).toBeUndefined();
    // The second sequence's row still shows ITS authored dwell.
    expect(input('Preview Lineup sequence item dwell in milliseconds').value).toBe('5000');
  });

  it('editing a second element deep-merges — it never clobbers the first', () => {
    render();
    typeNumber(input('Preview Now/Next sequence item dwell in milliseconds'), '800');
    typeNumber(input('Preview Lineup sequence item dwell in milliseconds'), '1200');
    typeNumber(input('Preview Break countdown duration in milliseconds'), '3000');
    expect(overrides['']?.sequences).toEqual({
      'sq-a': { dwellMs: 800 },
      'sq-b': { dwellMs: 1200 },
    });
    expect(overrides['']?.countdowns).toEqual({ cd: { durationMs: 3000 } });
  });

  it('a countdown duration of 0 CLEARS the override (back to the authored target)', () => {
    render();
    typeNumber(input('Preview Break countdown duration in milliseconds'), '3000');
    expect(overrides['']?.countdowns).toEqual({ cd: { durationMs: 3000 } });
    typeNumber(input('Preview Break countdown duration in milliseconds'), '0');
    expect(overrides['']?.countdowns?.['cd']?.durationMs).toBeUndefined();
  });
});
