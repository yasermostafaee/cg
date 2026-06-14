/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Fill } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore } from '../src/renderer/state/store.js';
import {
  defaultClock,
  defaultImage,
  defaultSequence,
  defaultShape,
  defaultText,
  defaultTicker,
} from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { TransformSection } from '../src/renderer/features/inspector/TransformSection.js';
import { timelineGroupsFor } from '../src/renderer/features/timeline/keyframe-helpers.js';

// React's act() needs this flag set for createRoot rendering under Vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

/**
 * Render the FULL right inspector for one element (Transform + Style, exactly what
 * `ElementInspector` composes) and return it.
 */
function renderRightInspector(el: Element): HTMLDivElement {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'custom');
  designerStore.setScene(scene, null);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      createElement(
        Fragment,
        null,
        createElement(TransformSection, { element: el, selectedKeyframe: null }),
        createElement(StyleSection, { element: el, selectedKeyframe: null }),
      ),
    ),
  );
  // CollapseSection only mounts its children when expanded; open every collapsed
  // section (its header carries aria-expanded) so all diamonds are in the DOM.
  for (let i = 0; i < 20; i++) {
    const collapsed = container.querySelector<HTMLElement>('[aria-expanded="false"]');
    if (collapsed === null) break;
    act(() => collapsed.click());
  }
  return container;
}

/** The properties the right inspector renders a real keyframe diamond for (from its aria-labels). */
function rightDiamondProps(c: HTMLDivElement): string[] {
  return Array.from(c.querySelectorAll('[aria-label^="Toggle keyframe for "]'))
    .map(
      (el) => /^Toggle keyframe for (.+) at frame/.exec(el.getAttribute('aria-label') ?? '')?.[1],
    )
    .filter((p): p is string => p !== undefined);
}

/** The properties the timeline-left shows a diamond for. */
function leftDiamondProps(el: Element): string[] {
  return timelineGroupsFor(el).flatMap((g) =>
    g.rows.flatMap((r) => (r.kind === 'animatable' ? [r.row.property] : [])),
  );
}

const sorted = (a: readonly string[]): string[] => [...a].sort();

const LINEAR_GRADIENT: Fill = {
  kind: 'linear',
  stops: [
    { at: 0, color: '#000000' },
    { at: 1, color: '#FFFFFF' },
  ],
  angle: 0,
};

describe('right/left keyframe-diamond parity (D-051) — the rendered inspector matches the timeline', () => {
  const cases: { name: string; el: Element }[] = [
    { name: 'shape', el: defaultShape('s', 0, 0) },
    { name: 'text', el: defaultText('t', 0, 0) },
    { name: 'image', el: defaultImage('i', 0, 0, 'asset-1') },
    { name: 'ticker', el: defaultTicker('tk', 0, 0) },
    { name: 'clock', el: defaultClock('ck', 0, 0) },
    { name: 'sequence', el: defaultSequence('sq', 0, 0) },
  ];
  for (const { name, el } of cases) {
    it(`${name}: every right-inspector diamond appears in the timeline-left and vice-versa`, () => {
      const c = renderRightInspector(el);
      expect(sorted(rightDiamondProps(c))).toEqual(sorted(leftDiamondProps(el)));
    });
  }
});

describe('right inspector — §2 diamond corrections (rendered)', () => {
  it('a clock renders NO diamond for digits or mode (and none for its text styling)', () => {
    const c = renderRightInspector(defaultClock('ck', 0, 0));
    const props = rightDiamondProps(c);
    expect(props).not.toContain('digits');
    expect(props).not.toContain('mode');
    // Only the universal transform + filter diamonds (styling deferred to D-052).
    expect(props).not.toContain('font.size');
    expect(props).not.toContain('cornerRadius');
  });

  it('a shape renders a border-radius diamond in the right inspector (parity with the timeline)', () => {
    const c = renderRightInspector(defaultShape('s', 0, 0));
    expect(rightDiamondProps(c)).toContain('cornerRadius');
    expect(leftDiamondProps(defaultShape('s', 0, 0))).toContain('cornerRadius');
  });

  it('an image renders no diamond for fit', () => {
    const c = renderRightInspector(defaultImage('i', 0, 0, 'asset-1'));
    // No 'fit' diamond and no dead placeholder glyph for it.
    expect(rightDiamondProps(c)).not.toContain('fit');
    expect(c.querySelector('[aria-label$="animation not yet supported"]')).toBeNull();
  });

  it('a gradient-filled shape renders no fill diamond on either panel', () => {
    const gradient: Element = { ...defaultShape('g', 0, 0), fill: LINEAR_GRADIENT };
    const c = renderRightInspector(gradient);
    expect(rightDiamondProps(c)).not.toContain('fill.color');
    expect(leftDiamondProps(gradient)).not.toContain('fill.color');
  });

  it('a solid-filled shape renders a fill diamond on both panels', () => {
    const solid = defaultShape('s', 0, 0);
    const c = renderRightInspector(solid);
    expect(rightDiamondProps(c)).toContain('fill.color');
    expect(leftDiamondProps(solid)).toContain('fill.color');
  });
});
