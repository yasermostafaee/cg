/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';
import { ErrorMarkOverlay } from '../src/renderer/features/canvas/ErrorMarkOverlay.js';

/**
 * ⭐ **`D-157` — THE RULE AND ITS SURFACE, ASSERTED FOR THE SAME FIXTURE, IN ONE TEST.**
 *
 * The owner's report was that a 1-px overlap kills the Export button and nothing says why. The
 * fix is a mark on the offending box — and the failure mode of a fix like that is the two halves
 * drifting: a preflight that reports an element the canvas does not mark, or a canvas that marks
 * a box the preflight has stopped complaining about.
 *
 * 🔴 **So every test here feeds ONE scene to BOTH.** `liveSourceIssues(scene)` is the rule, and
 * its output is handed straight to `ErrorMarkOverlay` — the same list the app passes. If they
 * ever disagree about which elements are at fault, these tests fail; if the mark were added
 * inside the preview iframe instead (where `@cg/template-runtime` paints the plate), this test
 * could not exist at all, because the rule and the surface would be in different packages with
 * different DOM environments. That constraint is why the mark is a designer-side overlay.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Feed ONE scene to the rule and to the surface, and return both answers. */
function ruleAndSurface(scene: Scene): { issues: ExportIssue[]; marked: string[] } {
  const issues = liveSourceIssues(scene);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ErrorMarkOverlay, { scene, issues, scale: 1 }));
  });
  const marked = [...container.querySelectorAll('[data-element-id]')].map(
    (n) => n.getAttribute('data-element-id') ?? '',
  );
  return { issues, marked };
}

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };
const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const plate = (id: string, x: number, y: number, w: number, h: number): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    routeKey: id,
    transform: tf(x, y, w, h),
  }) as unknown as Element;

function scene(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-d157',
    name: 'd157',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

describe('D-157 — a 1-px overlap: the rule fires for BOTH, and BOTH are marked', () => {
  /*
    🔴 EXACTLY ONE PIXEL. The owner's own number, and the one that makes the test discriminating:
    `overlaps` is a strict `<`, so 400+200 = 600 against a neighbour at 599 shares exactly 1 px of
    x. A fixture overlapping by hundreds of pixels would pass against a broken boundary too.
  */
  const oneByOne = () => scene([plate('a', 400, 100, 200, 200), plate('b', 599, 100, 200, 200)]);

  it('🔴 the RULE files an error for EACH participant', () => {
    const { issues } = ruleAndSurface(oneByOne());
    const overlaps = issues.filter((i) => i.code === 'live-source-overlap');
    expect(overlaps).toHaveLength(2);
    expect(overlaps.every((i) => i.severity === 'error')).toBe(true);
    expect(new Set(overlaps.map((i) => i.elementId))).toEqual(new Set(['a', 'b']));
  });

  it('🔴 …and the CANVAS marks BOTH — one box marked would name a culprit where there is a pair', () => {
    const { marked } = ruleAndSurface(oneByOne());
    expect(new Set(marked)).toEqual(new Set(['a', 'b']));
  });

  it('the mark carries the issue’s OWN message as an accessible description', () => {
    // Not a re-worded summary: the preflight's sentence already names both elements and says why
    // it matters, and re-writing it here would give the canvas and the panel two vocabularies.
    ruleAndSurface(oneByOne());
    const badge = container?.querySelector('[data-element-id="a"] [role="img"]');
    const label = badge?.getAttribute('aria-label') ?? '';
    expect(label).toContain('overlaps');
    expect(label).toContain('"a"');
    expect(label).toContain('"b"');
    // …and the same text is on `title`, so a sighted author gets it on hover.
    expect(badge?.getAttribute('title')).toBe(label);
  });

  it('the mark is drawn at the element’s FLATTENED rect, in scene px × scale', () => {
    // `D-154`'s lesson: chrome drawn where the element is not. The overlay reads the same
    // flattener the rule measured on, so the outline lands on the box the preflight faulted.
    ruleAndSurface(oneByOne());
    const mark = container?.querySelector('[data-element-id="b"]') as HTMLElement | null;
    expect(mark?.style.left).toBe('599px');
    expect(mark?.style.top).toBe('100px');
    expect(mark?.style.width).toBe('200px');
    expect(mark?.style.height).toBe('200px');
  });

  it('scale is applied — a zoomed canvas marks the same box, larger', () => {
    const issues = liveSourceIssues(oneByOne());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(createElement(ErrorMarkOverlay, { scene: oneByOne(), issues, scale: 2 }));
    });
    const mark = container.querySelector('[data-element-id="b"]') as HTMLElement | null;
    expect(mark?.style.left).toBe('1198px');
    expect(mark?.style.width).toBe('400px');
  });
});

describe('D-157 — an off-frame box, same shape', () => {
  const offFrame = () =>
    scene([plate('a', 100, 100, 200, 200), plate('edge', 1850, 100, 200, 200)]);

  it('the rule faults it and the canvas marks it', () => {
    const { issues, marked } = ruleAndSurface(offFrame());
    const off = issues.filter((i) => i.code === 'live-source-off-frame');
    expect(off).toHaveLength(1);
    expect(off[0]?.elementId).toBe('edge');
    expect(marked).toEqual(['edge']);
    // …and the plate that is entirely inside the frame is NOT marked.
    expect(marked).not.toContain('a');
  });
});

describe('D-157 — the POSITIVE CONTROL, and it is not optional', () => {
  it('🔴 a clean composition marks NOTHING and the overlay renders nothing at all', () => {
    // Two plates that merely TOUCH: `overlaps` is a strict `<`, so a shared edge is zero area and
    // is not an overlap. This is also the shape an author is trying to build, so a mark here
    // would be the fix becoming the defect.
    const clean = scene([plate('a', 100, 100, 200, 200), plate('b', 300, 100, 200, 200)]);
    const { issues, marked } = ruleAndSurface(clean);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(marked).toEqual([]);
    expect(container?.querySelector('[data-testid="canvas-error-marks"]')).toBeNull();
  });

  it('a WARNING-severity issue does not mark anything — only errors block the export', () => {
    const clean = scene([plate('a', 100, 100, 200, 200)]);
    const warning: ExportIssue = {
      severity: 'warning',
      code: 'made-up-warning',
      message: 'just a warning',
      elementId: 'a',
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(createElement(ErrorMarkOverlay, { scene: clean, issues: [warning], scale: 1 }));
    });
    expect(container.querySelector('[data-element-id="a"]')).toBeNull();
  });

  it('an issue with NO elementId marks nothing rather than drawing at the origin', () => {
    // `look-second-group` is a template-level refusal with no element to point at. A mark at
    // (0,0) would be a red box over the corner of the frame, faulting nothing.
    const clean = scene([plate('a', 100, 100, 200, 200)]);
    const orphan: ExportIssue = {
      severity: 'error',
      code: 'look-second-group',
      message: 'only one multi-frame group is supported',
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(createElement(ErrorMarkOverlay, { scene: clean, issues: [orphan], scale: 1 }));
    });
    expect(container.querySelector('[data-testid="canvas-error-marks"]')).toBeNull();
  });
});

describe('D-157 — the mark clears when the geometry is fixed', () => {
  it('re-rendering the fixed scene through the same path marks nothing', () => {
    // The live path: `useIssues` re-runs the preflight on every scene change, so "fixed" means
    // exactly "the rule stopped producing the issue". Asserted by running both halves again.
    const broken = ruleAndSurface(
      scene([plate('a', 400, 100, 200, 200), plate('b', 599, 100, 200, 200)]),
    );
    expect(broken.marked).toHaveLength(2);

    if (root !== null) act(() => root?.unmount());
    container?.remove();

    const fixed = ruleAndSurface(
      scene([plate('a', 400, 100, 200, 200), plate('b', 600, 100, 200, 200)]),
    );
    expect(fixed.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(fixed.marked).toEqual([]);
  });
});
